import { z } from "zod";
import { NextResponse } from "next/server";
import { sanitizeObject } from "./sanitize";

// ===========================================
// SINGAPORE PHONE VALIDATION
// ===========================================
const validateSGPhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('65')) {
    return digits.length === 10 && /^65[689]\d{7}$/.test(digits);
  }
  return digits.length === 8 && /^[689]\d{7}$/.test(digits);
};

// ===========================================
// PASSWORD VALIDATION
// ===========================================
const BANNED_PASSWORDS = [
  'password123456', '123456789012', 'qwertyuiopas', 'adminadmin',
  'letmein123', 'welcome123', 'password123', 'abc123456',
];

const isPasswordWeak = (password: string): boolean => {
  const lower = password.toLowerCase();
  if (BANNED_PASSWORDS.includes(lower)) return true;
  const patterns = ['qwerty', 'asdfgh', 'zxcvbn', '123456', 'abcdef'];
  return patterns.some(p => lower.includes(p));
};

export const passwordValidation = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Must contain at least one special character')
  .refine(p => !isPasswordWeak(p), 'Password is too common or weak. Please choose a stronger one.');

// ===========================================
// BRIEFING DATE SCHEMA
// ===========================================
export const briefingDateSchema = z.object({
  date: z.string().datetime({ offset: true }),
  description: z.string().optional().default(""),
});

// ===========================================
// TENDER SCHEMAS
// ===========================================
const tenderBaseSchema = z.object({
  branch_id: z.number().int().positive(),
  renovation_type_id: z.number().int().positive(),
  status_id: z.number().int().positive().optional(),
  tender_name: z.string().min(1).max(150),
  tender_description: z.string().optional().nullable(),
  tender_date: z.string().datetime().optional().nullable(),
  closing_date: z.string().datetime().optional().nullable(),
  renovation_start_date: z.string().datetime().optional().nullable(),
  renovation_end_date: z.string().datetime().optional().nullable(),
  estimated_budget: z.number().nonnegative().optional().nullable(),
  project_manager_id: z.number().int().positive().optional().nullable(),
  project_manager_name: z.string().max(150).optional().nullable(),
  project_manager_email: z.string().email().max(150).optional().nullable(),
  project_manager_phone: z
    .string()
    .max(50)
    .optional()
    .nullable()
    .refine(val => !val || validateSGPhone(val), 'Please enter a valid Singapore phone number'),
  // Planning-time estimate, deliberately not date-ordered against
  // renovation_end_date — real handover routinely slips past the planned
  // renovation completion date, so the two are intentionally uncoupled.
  // Stored as a plain @db.Date column (form input is type="date", not
  // datetime-local), hence a basic parse check rather than z.string().datetime().
  expected_handover_date: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Invalid date').optional().nullable(),
  defect_liability_months: z.number().int().positive().max(120).optional().nullable(),
  briefing_dates: z.array(briefingDateSchema).optional().default([]),
  clauses: z.object({
    critical: z.array(z.object({ title: z.string(), description: z.string() })).optional(),
    scope: z.array(z.object({ title: z.string(), description: z.string() })).optional(),
    terms: z.array(z.object({ header: z.string(), text: z.string() })).optional(),
  }).optional(),
});

// Cross-field date-order checks - only fires when both sides of a pair are
// actually present, so partial updates that only touch one date are unaffected.
function validateTenderDateOrder(data: Partial<z.infer<typeof tenderBaseSchema>>, ctx: z.RefinementCtx) {
  const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);
  const tenderDate = toDate(data.tender_date);
  const closingDate = toDate(data.closing_date);
  const renoStart = toDate(data.renovation_start_date);
  const renoEnd = toDate(data.renovation_end_date);

  if (tenderDate && closingDate && closingDate < tenderDate) {
    ctx.addIssue({ code: "custom", message: "Closing date cannot be before the tender date", path: ["closing_date"] });
  }
  if (renoStart && renoEnd && renoEnd < renoStart) {
    ctx.addIssue({ code: "custom", message: "Renovation end date cannot be before the renovation start date", path: ["renovation_end_date"] });
  }
}

export const tenderCreateSchema = tenderBaseSchema.superRefine(validateTenderDateOrder);
export const tenderUpdateSchema = tenderBaseSchema.partial().superRefine(validateTenderDateOrder);

// ===========================================
// TENDER HANDOVER / DLP SCHEMA
// ===========================================
export const handoverSchema = z.object({
  handover_date: z.string().refine((v) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return d <= today;
  }, 'Handover date cannot be in the future'),
  defect_liability_months: z.number().int().positive().max(120),
  notes: z.string().max(2000).optional().nullable(),
});

export const dlpCaseStatusSchema = z.object({
  dlp_case_status: z.enum(['processing', 'completed']).nullable(),
});

// ===========================================
// TENDER MESSAGING SCHEMA
// ===========================================
export const tenderMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  contractor_id: z.number().int().positive().optional(),
});

// ===========================================
// TENDER LIST QUERY SCHEMA
// ===========================================
export const tenderListQuerySchema = z.object({
  page: z.preprocess(
    (val) => (val === null || val === undefined || val === '' ? 1 : Number(val)),
    z.number().int().positive()
  ),
  limit: z.preprocess(
    (val) => (val === null || val === undefined || val === '' ? 20 : Number(val)),
    z.number().int().positive().max(100)
  ),
  status: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().optional()
  ),
  search: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().optional()
  ),
});

// ===========================================
// TENDER ID PARAM SCHEMA
// ===========================================
export const tenderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ===========================================
// BQ LINE ITEM SCHEMAS
// ===========================================
export const bqLineItemCreateSchema = z.object({
  submission_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  parent_item_id: z.number().int().positive().nullable().optional(),
  location: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  specifications: z.string().optional(),
  brand: z.string().max(100).optional(),
  quantity: z.number().nonnegative().default(0),
  unit: z.string().max(20).default("no"),
  unit_price: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
});

export const bqLineItemUpdateSchema = bqLineItemCreateSchema.partial().extend({
  line_item_id: z.number().int().positive(),
});

// ===========================================
// BQ SUBMISSION SCHEMAS
// ===========================================
export const bqSubmissionCreateSchema = z.object({
  tender_id: z.number().int().positive(),
  category_ids: z.array(z.number().int().positive()).optional(),
  bq_name: z.string().min(1).max(200).optional(),
  copy_from_template: z.boolean().optional().default(false),
});

export const bqSubmissionUpdateSchema = z.object({
  submission_id: z.number().int().positive(),
  bq_date: z.string().date().optional().nullable(),
  area_size: z.string().max(50).optional().nullable(),
  client_name_override: z.string().max(200).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  renovation_type_override: z.number().int().positive().optional().nullable(),
  branch_name_override: z.string().max(200).optional().nullable(),
  status: z.enum(["Draft", "Submitted", "Approved", "Rejected"]).optional(),
  bq_name: z.string().min(1).max(200).optional(),
});

// ===========================================
// TEAM LEAVE & ASSIGNMENT SCHEMAS
// ===========================================
export const teamLeaveSchema = z.object({
  user_id: z.number().int().positive(),
  leave_type_id: z.number().int().positive(),
  start_date: z.string().date(),
  end_date: z.string().date(),
  reason: z.string().optional(),
  half_day: z.boolean().default(false),
});

export const officerAssignmentSchema = z.object({
  officer_id: z.number().int().positive(),
  branch_id: z.number().int().positive(),
  effective_from: z.string().date(),
  effective_to: z.string().date().nullable().optional(),
  is_primary: z.boolean().default(true),
  shift: z.enum(["morning", "afternoon", "full_day"]).optional(),
  notes: z.string().optional(),
});

// ===========================================
// USER SCHEMAS
// ===========================================
export const userCreateSchema = z.object({
  username: z.string().min(3).max(100),
  email: z.string().email().max(150),
  password: passwordValidation,
  role_id: z.number().int().min(1).max(4).default(4),
  is_active: z.boolean().default(true),
  is_approved: z.boolean().default(true),
  access_start_date: z.string().date().nullable().optional(),
  access_end_date: z.string().date().nullable().optional(),
  consentToPDPA: z
    .boolean()
    .refine(val => val === true, 'You must consent to the collection and use of your personal data in accordance with the PDPA'),
});

export const userUpdateSchema = userCreateSchema
  .partial()
  .extend({
    password: passwordValidation.optional(),
    consentToPDPA: z.boolean().optional(),
  });

// ===========================================
// LOGIN SCHEMA
// ===========================================
export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ===========================================
// CALENDAR EVENT SCHEMAS
// ===========================================
export const calendarEventCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  start_date: z.string().datetime({ offset: true }),
  end_date: z.string().datetime({ offset: true }).optional().nullable(),
  all_day: z.boolean().default(true),
  event_type: z.enum(['milestone', 'briefing', 'deadline', 'meeting', 'other']).default('milestone'),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  brand_id: z.number().int().positive().optional().nullable(),
  branch_id: z.number().int().positive().optional().nullable(),
  tender_id: z.number().int().positive().optional().nullable(),
});

export const calendarEventUpdateSchema = calendarEventCreateSchema.partial().extend({
  event_id: z.number().int().positive(),
});

export const calendarEventsQuerySchema = z.object({
  start: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().date().optional()
  ),
  end: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().date().optional()
  ),
});

// ===========================================
// VALIDATION HELPER
// ===========================================
export async function validateBody<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    const sanitised = sanitizeObject(data);
    return { success: true, data: sanitised };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return {
        success: false,
        response: NextResponse.json(
          { error: "Validation failed", details: formattedErrors },
          { status: 400 }
        ),
      };
    }
    return {
      success: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

// ===========================================
// TYPE EXPORTS
// ===========================================
export type BriefingDateInput = z.infer<typeof briefingDateSchema>;
export type TenderCreateInput = z.infer<typeof tenderCreateSchema>;
export type TenderUpdateInput = z.infer<typeof tenderUpdateSchema>;
export type TenderListQueryInput = z.infer<typeof tenderListQuerySchema>;
export type TenderIdParamInput = z.infer<typeof tenderIdParamSchema>;
export type BqLineItemCreateInput = z.infer<typeof bqLineItemCreateSchema>;
export type BqLineItemUpdateInput = z.infer<typeof bqLineItemUpdateSchema>;
export type BqSubmissionCreateInput = z.infer<typeof bqSubmissionCreateSchema>;
export type BqSubmissionUpdateInput = z.infer<typeof bqSubmissionUpdateSchema>;
export type TeamLeaveInput = z.infer<typeof teamLeaveSchema>;
export type OfficerAssignmentInput = z.infer<typeof officerAssignmentSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CalendarEventCreateInput = z.infer<typeof calendarEventCreateSchema>;
export type CalendarEventUpdateInput = z.infer<typeof calendarEventUpdateSchema>;
export type CalendarEventsQueryInput = z.infer<typeof calendarEventsQuerySchema>;