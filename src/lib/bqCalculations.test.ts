import { describe, it, expect } from "vitest";
import { calculateLineItemAmount } from "./bqCalculations";

describe("calculateLineItemAmount", () => {
  it("computes quantity * unitPrice - discount for the normal case", () => {
    expect(calculateLineItemAmount(10, 5, 2)).toBe(48);
  });

  it("treats undefined discount as 0", () => {
    expect(calculateLineItemAmount(10, 5, undefined)).toBe(50);
  });

  it("treats zero discount as 0", () => {
    expect(calculateLineItemAmount(10, 5, 0)).toBe(50);
  });

  it("handles decimal quantities and prices", () => {
    expect(calculateLineItemAmount(2.5, 3.2, 1.1)).toBeCloseTo(6.9, 10);
  });

  it("does not clamp when discount exceeds quantity * unitPrice (matches current behavior: negative allowed)", () => {
    expect(calculateLineItemAmount(2, 3, 100)).toBe(-94);
  });
});
