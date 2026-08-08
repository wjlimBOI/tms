import { describe, it, expect } from "vitest";
import {
  computeDlpExpiry,
  getDlpStatus,
  isWithinReminderWindow,
  DLP_DUE_SOON_THRESHOLD_DAYS,
  DLP_REMINDER_WINDOW_DAYS,
} from "./dlp";

const FIXED_NOW = new Date("2026-06-15T00:00:00.000Z");

function daysFromNow(days: number): Date {
  const d = new Date(FIXED_NOW);
  d.setDate(d.getDate() + days);
  return d;
}

describe("computeDlpExpiry", () => {
  it("adds the given number of months to the handover date", () => {
    const expiry = computeDlpExpiry("2026-01-15", 12);
    expect(expiry.getUTCFullYear()).toBe(2027);
    expect(expiry.getUTCMonth()).toBe(0); // January
    expect(expiry.getUTCDate()).toBe(15);
  });

  it("accepts a Date object as well as a string", () => {
    const expiry = computeDlpExpiry(new Date("2026-01-01"), 6);
    expect(expiry.getUTCMonth()).toBe(6); // July
  });

  it("handles a defect liability period of 0 months (expiry equals handover date)", () => {
    const expiry = computeDlpExpiry("2026-03-01", 0);
    expect(expiry.getUTCFullYear()).toBe(2026);
    expect(expiry.getUTCMonth()).toBe(2);
    expect(expiry.getUTCDate()).toBe(1);
  });
});

describe("getDlpStatus", () => {
  it("is 'overdue' with daysOverdue set for any expiry in the past", () => {
    const result = getDlpStatus(daysFromNow(-1), FIXED_NOW);
    expect(result.status).toBe("overdue");
    expect(result.daysLeft).toBe(0);
    expect(result.daysOverdue).toBe(1);
  });

  it("is 'overdue' far in the past", () => {
    const result = getDlpStatus(daysFromNow(-90), FIXED_NOW);
    expect(result.status).toBe("overdue");
    expect(result.daysOverdue).toBe(90);
  });

  it("is 'due-soon' at exactly the threshold boundary (0 days)", () => {
    const result = getDlpStatus(daysFromNow(0), FIXED_NOW);
    expect(result.status).toBe("due-soon");
    expect(result.daysLeft).toBe(0);
    expect(result.daysOverdue).toBe(0);
  });

  it("is 'due-soon' at exactly DLP_DUE_SOON_THRESHOLD_DAYS", () => {
    const result = getDlpStatus(daysFromNow(DLP_DUE_SOON_THRESHOLD_DAYS), FIXED_NOW);
    expect(result.status).toBe("due-soon");
    expect(result.daysLeft).toBe(DLP_DUE_SOON_THRESHOLD_DAYS);
  });

  it("is 'upcoming' just past the due-soon threshold", () => {
    const result = getDlpStatus(daysFromNow(DLP_DUE_SOON_THRESHOLD_DAYS + 1), FIXED_NOW);
    expect(result.status).toBe("upcoming");
    expect(result.daysLeft).toBe(DLP_DUE_SOON_THRESHOLD_DAYS + 1);
  });

  it("is 'upcoming' far in the future", () => {
    const result = getDlpStatus(daysFromNow(365), FIXED_NOW);
    expect(result.status).toBe("upcoming");
    expect(result.daysOverdue).toBe(0);
  });
});

describe("isWithinReminderWindow", () => {
  it("is true at exactly the reminder window boundary", () => {
    expect(isWithinReminderWindow(daysFromNow(DLP_REMINDER_WINDOW_DAYS), FIXED_NOW)).toBe(true);
  });

  it("is false just past the reminder window", () => {
    expect(isWithinReminderWindow(daysFromNow(DLP_REMINDER_WINDOW_DAYS + 1), FIXED_NOW)).toBe(false);
  });

  it("is true when already overdue (a missed check cycle still catches up)", () => {
    expect(isWithinReminderWindow(daysFromNow(-10), FIXED_NOW)).toBe(true);
  });

  it("is false for a far-future expiry", () => {
    expect(isWithinReminderWindow(daysFromNow(365), FIXED_NOW)).toBe(false);
  });
});
