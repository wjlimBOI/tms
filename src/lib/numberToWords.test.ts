import { describe, it, expect } from "vitest";
import { numberToWords } from "./numberToWords";

describe("numberToWords", () => {
  it("returns 'Zero' for exactly 0", () => {
    expect(numberToWords(0)).toBe("Zero");
  });

  it("converts single and double digit numbers", () => {
    expect(numberToWords(1)).toBe("One");
    expect(numberToWords(9)).toBe("Nine");
    expect(numberToWords(15)).toBe("Fifteen");
    expect(numberToWords(42)).toBe("Forty Two");
    expect(numberToWords(20)).toBe("Twenty");
  });

  it("converts hundreds, including an exact multiple of 100 with no trailing chunk", () => {
    expect(numberToWords(100)).toBe("One Hundred");
    expect(numberToWords(105)).toBe("One Hundred Five");
    expect(numberToWords(999)).toBe("Nine Hundred Ninety Nine");
  });

  it("converts thousands/millions/billions, chaining each 3-digit chunk correctly", () => {
    expect(numberToWords(1234)).toBe("One Thousand Two Hundred Thirty Four");
    expect(numberToWords(1234567)).toBe(
      "One Million Two Hundred Thirty Four Thousand Five Hundred Sixty Seven"
    );
  });

  it("skips a zero chunk in the middle instead of emitting 'Zero Thousand' or similar", () => {
    // 1,000,005 -> chunk[0]=5, chunk[1]=0 (skipped entirely), chunk[2]=1
    expect(numberToWords(1000005)).toBe("One Million Five");
  });

  it("appends cents when the fractional part is non-zero, matching the documented example", () => {
    expect(numberToWords(1234.5)).toBe("One Thousand Two Hundred Thirty Four and Fifty Cents");
  });

  it("omits the cents suffix entirely when the fractional part rounds to zero", () => {
    expect(numberToWords(100.0)).toBe("One Hundred");
    expect(numberToWords(100.001)).toBe("One Hundred"); // rounds to 0 cents
  });

  it("rounds cents to the nearest whole cent, subject to normal floating-point error", () => {
    // 1.005 - 1 isn't exactly 0.005 in floating point (it's fractionally
    // under), so Math.round lands on 0 cents here, not 1 - verified
    // directly rather than assumed, since this is exactly the kind of
    // thing floating point gets wrong in non-obvious ways.
    expect(numberToWords(1.005)).toBe("One");
    expect(numberToWords(10.02)).toBe("Ten and Two Cents");
  });

  it("documents current (surprising) behavior: an amount under 1 with no whole part produces just the cents phrase, with no 'Zero' prefix", () => {
    // remaining = Math.floor(0.5) = 0, so the whole-number while loop never
    // runs and `result` stays "" - only the cents suffix gets appended,
    // then trim() removes the leading space that would otherwise precede
    // "and". Contrast with numberToWords(0) itself, which does return "Zero".
    expect(numberToWords(0.5)).toBe("and Fifty Cents");
  });

  it("documents current (surprising) behavior: a negative number produces an empty string, not an error or a signed word form", () => {
    // Math.floor(-5) = -5, and `while (remaining > 0)` is false for any
    // negative remaining, so the whole-number conversion loop never runs.
    // num - Math.floor(num) is also 0 for a negative integer, so no cents
    // are appended either - the function silently returns "".
    expect(numberToWords(-5)).toBe("");
  });
});
