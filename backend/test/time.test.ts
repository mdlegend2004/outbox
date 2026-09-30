import { describe, expect, it } from "vitest";
import { HOUR_MS, hourWindow, overflowTarget, scheduleTimes, windowStart, windowTtlSeconds } from "../src/lib/time";

describe("hour windows", () => {
  it("aligns windows to clock hours", () => {
    const t = Date.UTC(2026, 0, 1, 10, 59, 59, 999);
    expect(windowStart(hourWindow(t))).toBe(Date.UTC(2026, 0, 1, 10));
    expect(hourWindow(t + 1)).toBe(hourWindow(t) + 1);
  });

  it("keeps counter keys alive past the end of their window", () => {
    const t = Date.UTC(2026, 0, 1, 10, 30);
    expect(windowTtlSeconds(t)).toBe(30 * 60 + 3600);
  });
});

describe("overflowTarget", () => {
  const now = Date.UTC(2026, 0, 1, 10, 15);
  const next = Date.UTC(2026, 0, 1, 11);

  it("moves overflowed jobs to the start of the next window", () => {
    expect(overflowTarget(now, 1, 2000)).toBe(next);
  });

  it("preserves overflow order and spaces jobs by the send delay", () => {
    const targets = [1, 2, 3].map((p) => overflowTarget(now, p, 2000));
    expect(targets).toEqual([next, next + 2000, next + 4000]);
  });

  it("never schedules two jobs in the same millisecond when delay is 0", () => {
    expect(overflowTarget(now, 2, 0)).toBe(next + 1);
  });

  it("is always in the future relative to now", () => {
    expect(overflowTarget(next - 1, 1, 0)).toBeGreaterThan(next - 1);
    expect(overflowTarget(next - 1, 1, 0) - (next - 1)).toBeLessThanOrEqual(HOUR_MS);
  });
});

describe("scheduleTimes", () => {
  it("spaces recipients by the per-campaign delay", () => {
    const start = new Date(Date.UTC(2026, 0, 1, 9));
    const times = scheduleTimes(start, 3, 5000).map((d) => d.getTime());
    expect(times).toEqual([start.getTime(), start.getTime() + 5000, start.getTime() + 10000]);
  });

  it("handles 1000+ recipients", () => {
    const times = scheduleTimes(new Date(0), 1500, 0);
    expect(times).toHaveLength(1500);
  });
});
