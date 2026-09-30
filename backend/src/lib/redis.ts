import IORedis from "ioredis";
import { env } from "../config/env";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on connections used by workers
 * (blocking commands must not be retried/aborted by ioredis).
 */
export function createRedis() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Shared connection for non-blocking commands (rate-limit counters, dedupe keys). */
export const redis = createRedis();
