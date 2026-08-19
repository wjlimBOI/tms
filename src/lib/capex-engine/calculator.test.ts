import { describe, it, expect } from "vitest";
import { calculateCapExMetrics } from "./calculator";
import { getBrandRules, brandRulesMap } from "./brand-rules";
import type { BrandKey, CapExInput } from "@/types/capex";

describe("getBrandRules", () => {
  it("returns the matching rules for every real brand", () => {
    (Object.keys(brandRulesMap) as BrandKey[]).forEach((brand) => {
      expect(getBrandRules(brand).brand).toBe(brand);
    });
  });

  it("throws for a brand with no defined rules", () => {
    expect(() => getBrandRules("Not A Real Brand" as BrandKey)).toThrow(
      "No rules defined for brand: Not A Real Brand"
    );
  });
});

describe("calculateCapExMetrics - area tiering (getFirstTier)", () => {
  // Yun Nam's tierThresholds: [1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000]
  it("puts an area exactly on a threshold entirely in the first tier", () => {
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1600 });
    expect(result.areaBreakdown.firstTier).toBe(1600);
    expect(result.areaBreakdown.nextTier).toBe(0);
  });

  it("splits an area between the nearest lower threshold and the remainder", () => {
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1650 });
    expect(result.areaBreakdown.firstTier).toBe(1600);
    expect(result.areaBreakdown.nextTier).toBe(50);
  });

  it("documents current (surprising) behavior for an area below the smallest threshold: firstTier is clamped UP to the threshold, not down to the real area, and nextTier goes to 0 rather than negative", () => {
    // thresholds[0] is 1200 for every brand. An 1000 sqft unit still gets
    // billed as if it were 1200 sqft for the first tier, and the "next
    // tier" portion is floored at 0 instead of reporting a shortfall.
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1000 });
    expect(result.areaBreakdown.firstTier).toBe(1200);
    expect(result.areaBreakdown.nextTier).toBe(0);
  });

  it("uses the highest threshold at or below the area, not the highest threshold overall", () => {
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 3500 });
    expect(result.areaBreakdown.firstTier).toBe(3000);
    expect(result.areaBreakdown.nextTier).toBe(500);
  });
});

describe("calculateCapExMetrics - renovation cost formula", () => {
  it("applies the 20% multiplier using the cost tier matching the snapped-down area, not a flat rate reused across all tiers", () => {
    // Yun Nam's 1600 tier: ratePerSqft = 139, nextRatePerSqft = 102
    // (each tier has its own declining rates - see costTiers in brand-rules.ts)
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1650 });
    const expectedFirstTierCost = 1600 * 139 * 1.2;
    const expectedNextTierCost = 50 * 102 * 1.2;
    expect(result.areaBreakdown.firstTierCost).toBeCloseTo(expectedFirstTierCost, 6);
    expect(result.areaBreakdown.nextTierCost).toBeCloseTo(expectedNextTierCost, 6);
    expect(result.renovationBaseCost).toBeCloseTo(expectedFirstTierCost + expectedNextTierCost, 6);
  });

  it("sets finalCost equal to renovationBaseCost (no separate discount/markup step exists today)", () => {
    const result = calculateCapExMetrics({ brand: "London", areaSqft: 1800 });
    expect(result.finalCost).toBe(result.renovationBaseCost);
  });
});

describe("calculateCapExMetrics - budget breakdown", () => {
  it("scales every budget category off the same renovationBaseCost using that brand's allocation percentages", () => {
    const input: CapExInput = { brand: "Dorra", areaSqft: 1800 };
    const result = calculateCapExMetrics(input);
    const alloc = getBrandRules("Dorra").budgetAllocation;
    expect(result.budgetBreakdown.renovation).toBeCloseTo(result.renovationBaseCost * alloc.renovation, 6);
    expect(result.budgetBreakdown.refurbishment1st).toBeCloseTo(result.renovationBaseCost * alloc.refurbishment1st, 6);
    expect(result.budgetBreakdown.refurbishment2nd).toBeCloseTo(result.renovationBaseCost * alloc.refurbishment2nd, 6);
    expect(result.budgetBreakdown.refurbishment3rd).toBeCloseTo(result.renovationBaseCost * alloc.refurbishment3rd, 6);
    expect(result.budgetBreakdown.rebranding).toBeCloseTo(result.renovationBaseCost * alloc.rebranding, 6);
    expect(result.budgetBreakdown.reinstatement).toBeCloseTo(result.renovationBaseCost * alloc.reinstatement, 6);
  });

  it("does NOT require the budget categories to sum to the renovation base cost (they're independent percentages, not a partition)", () => {
    // refurbishment1st + refurbishment2nd + refurbishment3rd + rebranding +
    // reinstatement for Dorra = 0.05 + 0.08 + 0.7 + 0.15 + 0.12 = 1.10,
    // i.e. 110% of the base cost once renovation (100%) is included too -
    // this is deliberate (each line item is its own budget, not a slice of
    // one pie), but easy to misread as a bug, so it's worth locking in.
    const result = calculateCapExMetrics({ brand: "Dorra", areaSqft: 1800 });
    const sumOfAllCategories =
      result.budgetBreakdown.renovation +
      result.budgetBreakdown.refurbishment1st +
      result.budgetBreakdown.refurbishment2nd +
      result.budgetBreakdown.refurbishment3rd +
      result.budgetBreakdown.rebranding +
      result.budgetBreakdown.reinstatement;
    expect(sumOfAllCategories).toBeGreaterThan(result.renovationBaseCost);
  });
});

describe("calculateCapExMetrics - area range bucketing per brand group (getAreaRangeKey)", () => {
  it("haircare brands (Yun Nam, Jonsson): area exactly AT the 'Below' boundary is NOT below it - falls into the next bucket up, despite that bucket's label implying a higher floor", () => {
    // area < 1300 -> 'Below 1300'; area <= 1500 -> '1301 - 1500'.
    // At area === 1300, the first condition is false (not < 1300), so it
    // falls through to the second and lands in '1301 - 1500' even though
    // 1300 is not actually >= 1301. A label/boundary mismatch worth
    // documenting so nobody "fixes" the off-by-one without realizing the
    // capacity constraints below are keyed to this exact behavior.
    const below = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1299 });
    const atBoundary = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1300 });
    // 'Below 1300' constraints: minTotalBeds 13, maxTotalBeds 15
    expect(below.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(13);
    // '1301 - 1500' constraints: minTotalBeds 15, maxTotalBeds 16
    expect(atBoundary.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(15);
  });

  it("slimming brands (London, Dorra): the 'Min 1400' bucket is inclusive of 1400 itself", () => {
    const at1400 = calculateCapExMetrics({ brand: "London", areaSqft: 1400 });
    const at1401 = calculateCapExMetrics({ brand: "London", areaSqft: 1401 });
    // 'Min 1400': minTotalBeds 6; '1401 - 1600': minTotalBeds 7
    expect(at1400.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(6);
    expect(at1401.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(7);
  });

  it("facial brands (New York, Shakura, Victoria): the '1201 - 1400' bucket is used up to and including 1400", () => {
    const at1400 = calculateCapExMetrics({ brand: "New York", areaSqft: 1400 });
    const at1401 = calculateCapExMetrics({ brand: "New York", areaSqft: 1401 });
    // '1201 - 1400': minTotalBeds 7; '1401 - 1600': minTotalBeds 9
    expect(at1400.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(7);
    expect(at1401.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(9);
  });

  it("uses the top bucket for very large areas regardless of brand group", () => {
    const yunNam = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 5000 });
    const london = calculateCapExMetrics({ brand: "London", areaSqft: 5000 });
    const newYork = calculateCapExMetrics({ brand: "New York", areaSqft: 5000 });
    expect(yunNam.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(27); // '2301 above'
    expect(london.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(16); // '2400 above'
    expect(newYork.capacityValidation.suggestedConstraints?.minTotalBeds).toBe(18); // '2201 above'
  });
});

describe("calculateCapExMetrics - capacity validation", () => {
  it("is valid with no errors when nothing is requested", () => {
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1600 });
    expect(result.capacityValidation.isValid).toBe(true);
    expect(result.capacityValidation.errors).toEqual([]);
  });

  it("flags a desired value below the bucket's minimum", () => {
    // '1501 - 1700' for Yun Nam: minCR 3, maxCR 4
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1600, desiredCR: 1 });
    expect(result.capacityValidation.isValid).toBe(false);
    expect(result.capacityValidation.errors).toContain("CR 1 is below minimum 3");
  });

  it("flags a desired value above the bucket's maximum", () => {
    const result = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1600, desiredCR: 10 });
    expect(result.capacityValidation.isValid).toBe(false);
    expect(result.capacityValidation.errors).toContain("CR 10 exceeds maximum 4");
  });

  it("accepts a desired value exactly at the minimum or maximum boundary", () => {
    const atMin = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1600, desiredCR: 3 });
    const atMax = calculateCapExMetrics({ brand: "Yun Nam", areaSqft: 1600, desiredCR: 4 });
    expect(atMin.capacityValidation.isValid).toBe(true);
    expect(atMax.capacityValidation.isValid).toBe(true);
  });

  it("collects multiple errors at once rather than stopping at the first", () => {
    const result = calculateCapExMetrics({
      brand: "Yun Nam",
      areaSqft: 1600,
      desiredCR: 1,
      desiredTR: 100,
    });
    expect(result.capacityValidation.errors).toHaveLength(2);
  });

  it("silently ignores an optional constraint the brand doesn't define, even if the caller provides a value for it", () => {
    // Yun Nam's capacity rules never set minBlueSpirit/maxBlueSpirit, so
    // desiredBlueSpirit is never validated against anything for this
    // brand - it's simply not checked, not an error.
    const result = calculateCapExMetrics({
      brand: "Yun Nam",
      areaSqft: 1600,
      desiredBlueSpirit: 999,
    });
    expect(result.capacityValidation.isValid).toBe(true);
    expect(result.capacityValidation.errors).toEqual([]);
  });

  it("validates an optional constraint the brand DOES define (London has BlueSpirit)", () => {
    // '1601 - 1800' for London: minBlueSpirit 2, maxBlueSpirit 4
    const result = calculateCapExMetrics({
      brand: "London",
      areaSqft: 1700,
      desiredBlueSpirit: 10,
    });
    expect(result.capacityValidation.isValid).toBe(false);
    expect(result.capacityValidation.errors).toContain("Blue Spirit 10 exceeds maximum 4");
  });
});
