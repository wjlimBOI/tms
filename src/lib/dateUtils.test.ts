import { describe, it, expect, beforeAll } from "vitest";
import {
  toDateOrNull,
  toDateOnly,
  toISOStringUTC,
  isoToLocalDate,
  isoToLocalDateTime,
  formatTenderDate,
  formatTenderDateTime,
  formatTenderDateLong,
} from "./dateUtils";

// isoToLocalDateTime/formatTenderDate*/isoToLocalDate all read LOCAL time
// getters (getHours/getMonth/etc), so their output depends on the test
// runner's system timezone unless pinned here. Pinning to UTC makes "local"
// time equal to the UTC instant encoded in each ISO string, so results are
// deterministic on any machine or CI runner.
beforeAll(() => {
  process.env.TZ = "UTC";
});

describe("toDateOrNull", () => {
  it("parses a YYYY-MM-DD string as UTC midnight", () => {
    const d = toDateOrNull("2026-03-15");
    expect(d?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("returns null for null/undefined/empty input", () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
    expect(toDateOrNull("")).toBeNull();
  });

  it("returns null for an unparseable string", () => {
    expect(toDateOrNull("not-a-date")).toBeNull();
  });
});

describe("toDateOnly", () => {
  it("extracts YYYY-MM-DD from a full ISO string", () => {
    expect(toDateOnly("2026-03-15T09:30:00.000Z")).toBe("2026-03-15");
  });

  it("returns empty string for null/undefined/empty/invalid input", () => {
    expect(toDateOnly(null)).toBe("");
    expect(toDateOnly(undefined)).toBe("");
    expect(toDateOnly("")).toBe("");
    expect(toDateOnly("garbage")).toBe("");
  });
});

describe("toISOStringUTC", () => {
  it("converts a YYYY-MM-DD string to a full UTC ISO string at midnight", () => {
    expect(toISOStringUTC("2026-03-15")).toBe("2026-03-15T00:00:00.000Z");
  });

  it("returns null for null/undefined/empty/invalid input", () => {
    expect(toISOStringUTC(null)).toBeNull();
    expect(toISOStringUTC(undefined)).toBeNull();
    expect(toISOStringUTC("")).toBeNull();
    expect(toISOStringUTC("garbage")).toBeNull();
  });
});

describe("isoToLocalDate / isoToLocalDateTime", () => {
  it("formats an ISO string for a date input", () => {
    expect(isoToLocalDate("2026-03-15T09:30:00.000Z")).toBe("2026-03-15");
  });

  it("formats an ISO string for a datetime-local input", () => {
    expect(isoToLocalDateTime("2026-03-15T09:30:00.000Z")).toBe("2026-03-15T09:30");
  });

  it("pads single-digit month/day/hour/minute", () => {
    expect(isoToLocalDateTime("2026-01-05T03:07:00.000Z")).toBe("2026-01-05T03:07");
  });

  it("returns empty string for null/undefined/empty/invalid input", () => {
    expect(isoToLocalDate(null)).toBe("");
    expect(isoToLocalDateTime(undefined)).toBe("");
    expect(isoToLocalDateTime("garbage")).toBe("");
  });
});

describe("formatTenderDate", () => {
  it("formats as DD/MM/YYYY", () => {
    expect(formatTenderDate("2026-03-05T00:00:00.000Z")).toBe("05/03/2026");
  });

  it("falls back to 'To be confirmed' (not an empty string) for null/undefined/invalid input", () => {
    expect(formatTenderDate(null)).toBe("To be confirmed");
    expect(formatTenderDate(undefined)).toBe("To be confirmed");
    expect(formatTenderDate("garbage")).toBe("To be confirmed");
  });
});

describe("formatTenderDateTime", () => {
  it("formats with time when the time isn't exactly midnight", () => {
    expect(formatTenderDateTime("2026-03-05T14:45:00.000Z")).toBe("05/03/2026, 14:45 Hrs");
  });

  it("omits the time portion when it's exactly midnight (date-only convention)", () => {
    expect(formatTenderDateTime("2026-03-05T00:00:00.000Z")).toBe("05/03/2026");
  });

  it("falls back to 'To be confirmed' for null/undefined/invalid input", () => {
    expect(formatTenderDateTime(null)).toBe("To be confirmed");
    expect(formatTenderDateTime("garbage")).toBe("To be confirmed");
  });
});

describe("formatTenderDateLong", () => {
  it("formats as 'D Month YYYY' with no leading zero on the day", () => {
    expect(formatTenderDateLong("2026-03-05T00:00:00.000Z")).toBe("5 March 2026");
  });

  it("falls back to 'To be confirmed' for null/undefined/invalid input", () => {
    expect(formatTenderDateLong(null)).toBe("To be confirmed");
    expect(formatTenderDateLong("garbage")).toBe("To be confirmed");
  });
});
