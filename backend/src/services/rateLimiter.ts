import { env } from "../config/env";
import { redis } from "../lib/redis";
import { hourWindow, overflowTarget, windowTtlSeconds } from "../lib/time";

/**
 * Atomically reserve one send slot in the current hour window for BOTH the
 * sender (global ceiling from env) and the campaign (limit chosen in the UI).
 * Runs as a single Lua script, so it is race-free across any number of
 * worker processes / concurrent jobs.
 *
 * Returns: {0, senderCount, campaignCount}  -> slot reserved
 *          {1, "sender"|"campaign", count}  -> limit reached, nothing reserved
 */
const RESERVE_LUA = `
local senderLimit = tonumber(ARGV[1])
local campaignLimit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local s = tonumber(redis.call('GET', KEYS[1]) or '0')
if s >= senderLimit then return {1, 'sender', s} end
local c = tonumber(redis.call('GET', KEYS[2]) or '0')
if c >= campaignLimit then return {1, 'campaign', c} end
s = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ttl)
c = redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ttl)
return {0, s, c}
`;

const RELEASE_LUA = `
for i, k in ipairs(KEYS) do
  local v = tonumber(redis.call('GET', k) or '0')
  if v > 0 then redis.call('DECR', k) end
end
return 1
`;

export type LimitScope = "sender" | "campaign";

export type ReserveResult =
  | { ok: true; senderCount: number; campaignCount: number; window: number }
  | { ok: false; scope: LimitScope; count: number; window: number };

const senderKey = (senderId: string, w: number) => `rl:sender:${senderId}:${w}`;
const campaignKey = (campaignId: string, w: number) => `rl:campaign:${campaignId}:${w}`;

export async function reserveSlot(
  senderId: string,
  campaignId: string,
  campaignLimit: number,
  now = Date.now(),
): Promise<ReserveResult> {
  const w = hourWindow(now);
  const res = (await redis.eval(
    RESERVE_LUA,
    2,
    senderKey(senderId, w),
    campaignKey(campaignId, w),
    env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    campaignLimit,
    windowTtlSeconds(now),
  )) as [number, number | string, number];

  if (res[0] === 0) {
    return { ok: true, senderCount: Number(res[1]), campaignCount: Number(res[2]), window: w };
  }
  return { ok: false, scope: res[1] as LimitScope, count: Number(res[2]), window: w };
}

/** Give a reserved slot back (e.g. another worker already claimed the email). */
export async function releaseSlot(senderId: string, campaignId: string, window: number) {
  await redis.eval(RELEASE_LUA, 2, senderKey(senderId, window), campaignKey(campaignId, window));
}

/**
 * When a limit is hit, place the job in the next hour window. Each overflowing
 * job takes a ticket from a Redis counter, so jobs re-run in the order they
 * overflowed (≈ original schedule order), spaced by the min send delay.
 */
export async function nextWindowRunAt(scope: LimitScope, scopeId: string, now = Date.now()) {
  const nextWindow = hourWindow(now) + 1;
  const key = `rl:overflow:${scope}:${scopeId}:${nextWindow}`;
  const position = await redis.incr(key);
  await redis.expire(key, windowTtlSeconds(now) + 3600);
  return overflowTarget(now, position, env.MIN_DELAY_BETWEEN_SENDS_MS);
}

/**
 * Minimum gap between two sends from the same sender, shared by every worker.
 * Each call atomically books the sender's next free send time and returns how
 * long the caller must wait for it. Uses Redis TIME so worker clocks don't matter.
 * Jobs therefore queue up behind each other (in pickup order) instead of
 * polling/retrying, and different senders are paced independently.
 */
const GAP_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local gap = tonumber(ARGV[1])
local nxt = tonumber(redis.call('GET', KEYS[1]) or '0')
local at = math.max(now, nxt)
redis.call('SET', KEYS[1], at + gap, 'PX', at + gap - now + 60000)
return at - now
`;

export async function reserveSendGap(senderId: string): Promise<number> {
  if (env.MIN_DELAY_BETWEEN_SENDS_MS <= 0) return 0;
  return Number(await redis.eval(GAP_LUA, 1, `rl:gap:${senderId}`, env.MIN_DELAY_BETWEEN_SENDS_MS));
}

/** Returns true exactly once per (scope, id, window): used to dedupe Slack alerts. */
export async function shouldNotifyLimit(scope: LimitScope, scopeId: string, window: number) {
  const res = await redis.set(`rl:notified:${scope}:${scopeId}:${window}`, "1", "EX", 2 * 3600, "NX");
  return res === "OK";
}
