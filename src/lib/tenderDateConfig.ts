// lib/tenderDateConfig.ts

export const DATE_LABELS: Record<string, string> = {
  // The 5 critical date items (with time where specified)
  briefing_date: "Collection of Tender Drawing and Briefing on site", // time included
  closing_date: "Submission of Completed Tender", // time included
  renovation_start_date: "Contractor takes over of Premises at Site", // date only
  renovation_end_date: "Completion and Handover of Completed Site", // time included

  // Additional periods (date ranges)
  tender_date: "Tender Period Start", // date only
  download_start: "Download Window Start", // date only
  download_end: "Download Window End", // date only
  // Note: "Tender Period End" is covered by closing_date above
  // "Renovation Period End" is renovation_end_date
};

export const EXTRA_DATE_NOTES: string[] = [
  "* Refurbishment period is purely night work only.",
  "The dates stated above may be subject to change. In case of any inconsistency between the dates contained in the Tender Document and the Letter of Award, the dates specified in the Letter of Award shall prevail.",
  "The contractors will be informed",
];