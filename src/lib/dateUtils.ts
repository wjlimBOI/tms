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

/**
 * Convert an ISO string to local YYYY-MM-DDTHH:mm for input[type="datetime-local"].
 * Uses local wall-clock time components (not UTC) since that's what the input displays.
 */
export const isoToLocalDateTime = (isoString: string | null | undefined): string => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * DD/MM/YYYY for the tender document/print views. Falls back to
 * "To be confirmed" (not empty string) since these render inside contract text.
 */
export const formatTenderDate = (isoString: string | null | undefined): string => {
  if (!isoString) return "To be confirmed";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "To be confirmed";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * DD/MM/YYYY, HH:mm Hrs for the tender document/print views — omits the time
 * when it's exactly midnight (treated as "date only, no specific time set").
 */
export const formatTenderDateTime = (isoString: string | null | undefined): string => {
  if (!isoString) return "To be confirmed";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "To be confirmed";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (hours === "00" && minutes === "00") {
    return `${day}/${month}/${year}`;
  }
  return `${day}/${month}/${year}, ${hours}:${minutes} Hrs`;
};

/**
 * "D Month YYYY" for the tender document/print views.
 */
export const formatTenderDateLong = (isoString: string | null | undefined): string => {
  if (!isoString) return "To be confirmed";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "To be confirmed";
  const day = date.getDate();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};