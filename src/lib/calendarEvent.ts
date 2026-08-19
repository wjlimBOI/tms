import { format } from "date-fns";

// Tender-synced calendar events (src/lib/syncTenderToCalendar.ts) store a
// combined title like "Renovation Period: <tender name>" so the month-grid
// FullCalendar view (src/app/calendar/page.tsx) has one self-describing
// label per block. List views want those two halves split back apart -
// tender name as the heading, "Renovation Period" as the sublabel - without
// a schema change/backfill, so we recover the label by stripping the known
// tender-name suffix back off the title.
export function getEventPeriodLabel(title: string, tenderName?: string | null): string | null {
  if (!tenderName) return null;
  const suffix = `: ${tenderName}`;
  if (title.endsWith(suffix)) {
    return title.slice(0, title.length - suffix.length);
  }
  return null;
}

export function getEventMainTitle(title: string, tenderName?: string | null): string {
  return tenderName || title;
}

export function formatEventDateRange(
  startDate: string,
  endDate?: string | null
): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const sameDay = !end || end.toDateString() === start.toDateString();
  const startLabel = format(start, "MMM d, yyyy");
  if (sameDay) return startLabel;
  // Drop the year from the start date when both ends fall in the same
  // year, so a same-year range reads "Sep 1 - Sep 30, 2026" instead of
  // repeating the year twice.
  const sameYear = end!.getFullYear() === start.getFullYear();
  const startLabelShort = sameYear ? format(start, "MMM d") : startLabel;
  return `${startLabelShort} – ${format(end!, "MMM d, yyyy")}`;
}
