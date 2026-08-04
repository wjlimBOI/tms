// lib/dateUtils.ts

/**
 * Convert a date string (YYYY-MM-DD) to a Date object at UTC midnight.
 * Returns null for invalid input.
 */
export const toDateOrNull = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Extract YYYY-MM-DD from an ISO string or Date object.
 */
export const toDateOnly = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

/**
 * Convert a date string (YYYY-MM-DD) to ISO 8601 UTC string (YYYY-MM-DDTHH:mm:ss.sssZ).
 * Returns null for invalid input.
 */
export const toISOStringUTC = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Convert an ISO string to local YYYY-MM-DD for input[type="date"].
 */
export const isoToLocalDate = (isoString: string | null | undefined): string => {
  if (!isoString) return "";
  const d = new Date(isoString);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};