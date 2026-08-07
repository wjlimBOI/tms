import { describe, it, expect } from "vitest";
import { classifyDeviation, buildLocalSummary, type FlaggedItem } from "./bqRateSummary";

describe("classifyDeviation", () => {
  it("returns null when there's no comparison average", () => {
    expect(classifyDeviation(100, null)).toBeNull();
  });

  it("returns null when comparisonAvg is zero or negative (avoids divide-by-zero/nonsense)", () => {
    expect(classifyDeviation(100, 0)).toBeNull();
    expect(classifyDeviation(100, -5)).toBeNull();
  });

  it("returns null when within the default 20% threshold", () => {
    expect(classifyDeviation(110, 100)).toBeNull(); // +10%
    expect(classifyDeviation(90, 100)).toBeNull(); // -10%
    expect(classifyDeviation(120, 100)).toBeNull(); // exactly +20%, inclusive
  });

  it("returns the positive deviation when priced significantly above average", () => {
    expect(classifyDeviation(150, 100)).toBe(50);
  });

  it("returns the negative deviation when priced significantly below average", () => {
    expect(classifyDeviation(50, 100)).toBe(-50);
  });

  it("respects a custom threshold", () => {
    expect(classifyDeviation(105, 100, 10)).toBeNull();
    expect(classifyDeviation(115, 100, 10)).toBe(15);
  });
});

describe("buildLocalSummary", () => {
  const item = (overrides: Partial<FlaggedItem>): FlaggedItem => ({
    item_id: 1,
    description: "Item",
    rate: 100,
    comparisonAvg: 100,
    deviationPct: 0,
    ...overrides,
  });

  it("returns a no-data message when nothing is priced yet", () => {
    expect(buildLocalSummary([], [], 0, 0, 0)).toBe(
      "No priced items yet — add rates to see a pricing summary."
    );
  });

  it("summarizes an all-within-range BQ with no flags", () => {
    const summary = buildLocalSummary([], [], 5, 0, 5);
    expect(summary).toContain("5 are within the typical range");
    expect(summary).not.toContain("above the historical average");
    expect(summary).not.toContain("below the historical average");
  });

  it("names the single worst high outlier", () => {
    const high = [
      item({ description: "Cheap tile", deviationPct: 25 }),
      item({ description: "Gold-plated fixture", deviationPct: 90 }),
    ];
    const summary = buildLocalSummary(high, [], 3, 0, 5);
    expect(summary).toContain("2 items");
    expect(summary).toContain('"Gold-plated fixture" at 90% above');
  });

  it("names the single worst low outlier", () => {
    const low = [
      item({ description: "Underpriced labor", deviationPct: -80 }),
      item({ description: "Slightly cheap paint", deviationPct: -25 }),
    ];
    const summary = buildLocalSummary([], low, 3, 0, 5);
    expect(summary).toContain('"Underpriced labor" at 80% below');
  });

  it("mentions items with no historical data", () => {
    const summary = buildLocalSummary([], [], 2, 3, 5);
    expect(summary).toContain("3 items have no historical data to compare against yet");
  });

  it("uses singular phrasing for a count of exactly 1", () => {
    const summary = buildLocalSummary([item({ description: "Solo item", deviationPct: 30 })], [], 0, 0, 1);
    expect(summary).toContain("1 item is priced significantly above");
    expect(summary).not.toContain("items are");
  });
});
