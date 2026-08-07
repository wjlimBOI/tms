import { describe, it, expect } from "vitest";
import { computeStats } from "./route";

describe("computeStats", () => {
  it("returns all-null/zero-count stats for an empty list", () => {
    expect(computeStats([])).toEqual({ count: 0, avg: null, min: null, max: null });
  });

  it("computes count/avg/min/max for a normal list", () => {
    expect(computeStats([10, 20, 30])).toEqual({ count: 3, avg: 20, min: 10, max: 30 });
  });

  it("handles a single value (avg/min/max all equal it)", () => {
    expect(computeStats([42])).toEqual({ count: 1, avg: 42, min: 42, max: 42 });
  });

  it("handles decimal values without rounding away precision", () => {
    const result = computeStats([1.1, 2.2, 3.3]);
    expect(result.count).toBe(3);
    expect(result.avg).toBeCloseTo(2.2, 10);
    expect(result.min).toBeCloseTo(1.1, 10);
    expect(result.max).toBeCloseTo(3.3, 10);
  });
});
