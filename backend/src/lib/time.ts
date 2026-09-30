export const HOUR_MS = 60 * 60 * 1000;

/** Fixed (clock-aligned, UTC) hour window index for a timestamp. */
export function hourWindow(ts: number): number {
  return Math.floor(ts / HOUR_MS);
}

export function windowStart(window: number): number {
  return window * HOUR_MS;
}

/**
 * Timestamp an overflowed job should be re-run at: the start of the next hour
 * window, offset by its position in the overflow line so that jobs keep the
 * order in which they overflowed and don't all wake up in the same millisecond.
 */
export function overflowTarget(now: number, position: number, spacingMs: number): number {
  const next = windowStart(hourWindow(now) + 1);
  return next + Math.max(0, position - 1) * Math.max(1, spacingMs);
}

/** Seconds until the end of the window + 1h grace; used as TTL for window counters. */
export function windowTtlSeconds(now: number): number {
  const end = windowStart(hourWindow(now) + 1);
  return Math.ceil((end - now) / 1000) + 3600;
}

/** Recipient i is scheduled at startAt + i * delay (per-campaign pacing). */
export function scheduleTimes(startAt: Date, count: number, delayMs: number): Date[] {
  const base = startAt.getTime();
  return Array.from({ length: count }, (_, i) => new Date(base + i * delayMs));
}
