// Pure DLP (Defect Liability Period) calculation rules, unit-testable without
// a DB. Used by the handover route, the dashboard DLP summary, the lazy
// reminder-notification check, and the tender detail page's read-only DLP
// panel — all share this so status buckets/thresholds never disagree.
//
// The dashboard's DLP query computes the expiry date itself in raw SQL
// (Postgres interval arithmetic, already correct) — computeDlpExpiry here is
// for contexts with no DB round trip (the handover route's immediate
// response, the detail-page display). getDlpStatus/isWithinReminderWindow
// are the single source of truth for categorizing an already-known date.

export type DlpStatus = "upcoming" | "due-soon" | "overdue";

// Manual override an admin/PM can set on tender.dlp_case_status once a DLP
// case is actively being worked or resolved, so the deadlines page can stop
// showing "N days overdue" for a case that's no longer actually outstanding.
// Only meaningful once the date-derived status is "overdue" — a case that's
// still upcoming/due-soon has nothing to override yet.
export type DlpCaseStatus = "processing" | "completed";
export const DLP_CASE_STATUSES: DlpCaseStatus[] = ["processing", "completed"];

export const DLP_DUE_SOON_THRESHOLD_DAYS = 30;
export const DLP_REMINDER_WINDOW_DAYS = 30;

export function computeDlpExpiry(handoverDate: Date | string, defectLiabilityMonths: number): Date {
  const base = typeof handoverDate === "string" ? new Date(handoverDate) : handoverDate;
  const expiry = new Date(base);
  expiry.setMonth(expiry.getMonth() + defectLiabilityMonths);
  return expiry;
}

export interface DlpStatusResult {
  status: DlpStatus;
  daysLeft: number; // 0 when overdue
  daysOverdue: number; // 0 when not overdue
}

export function getDlpStatus(expiryDate: Date, now: Date = new Date()): DlpStatusResult {
  const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { status: "overdue", daysLeft: 0, daysOverdue: Math.abs(diffDays) };
  }
  if (diffDays <= DLP_DUE_SOON_THRESHOLD_DAYS) {
    return { status: "due-soon", daysLeft: diffDays, daysOverdue: 0 };
  }
  return { status: "upcoming", daysLeft: diffDays, daysOverdue: 0 };
}

// Whether a DLP has crossed into the reminder window — includes already-
// overdue dates so a missed check cycle (e.g. no dashboard load for a while)
// still catches up on the next run.
export function isWithinReminderWindow(expiryDate: Date, now: Date = new Date()): boolean {
  const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= DLP_REMINDER_WINDOW_DAYS;
}
