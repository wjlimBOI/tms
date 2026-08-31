// lib/tenderConstants.ts

export const DEFAULT_COMPANY_ADDRESS = "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526";
export const DEFAULT_COMPANY_TEL = "6372 2668";
export const DEFAULT_COMPANY_FAX = "6565 1861";

export const DEFAULT_PM_NAME = "Mr. Jack Puan";
export const DEFAULT_PM_EMAIL = "skpuan@beautyone.com.sg";
export const DEFAULT_PM_PHONE = "8139 0348";

// Used for the "Tender Enquiries" fallback
export const DEFAULT_CONTACT_PERSON = DEFAULT_PM_NAME;
export const DEFAULT_CONTACT_POSITION = "Project Manager";
export const DEFAULT_CONTACT_EMAIL = DEFAULT_PM_EMAIL;
export const DEFAULT_CONTACT_PHONE = DEFAULT_COMPANY_TEL;

// Fixed tender submission mailbox — deliberately separate from the PM's
// enquiry email above. Clause 3 ("Submission of Tender") always routes here
// regardless of which PM is assigned to the tender; clause 4 ("Tender
// Enquiries") uses the per-tender PM email instead.
export const DEFAULT_SUBMISSION_EMAIL = "annielim@beautyone.com.sg";