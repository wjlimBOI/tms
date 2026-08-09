import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { sanitize } from "@/lib/sanitize";
import { createApprovalRequestIfConfigured } from "@/lib/approvals";
import { z } from "zod";

const mainTendererSchema = z.object({
  fullName: z.string().max(200).optional().default(""),
  position: z.string().max(200).optional().default(""),
  companyName: z.string().max(200).optional().default(""),
  date: z.string().max(50).optional().default(""),
  signature: z.string().min(1, "Main tenderer signature is required"),
  address: z.string().max(500).optional().default(""),
});

const witnessSchema = z.object({
  fullName: z.string().max(200).optional().default(""),
  date: z.string().max(50).optional().default(""),
  signature: z.string().optional().nullable(),
  address: z.string().max(500).optional().default(""),
});

const declarationSchema = z.object({
  iName: z.string().max(200).optional().default(""),
  onBehalfOf: z.string().max(200).optional().default(""),
  name: z.string().max(200).optional().default(""),
  date: z.string().max(50).optional().default(""),
  signature: z.string().min(1, "Declaration signature is required"),
  address: z.string().max(500).optional().default(""),
});

const projectExperienceRowSchema = z.object({
  id: z.string(),
  projectName: z.string().max(300).optional().default(""),
  value: z.string().max(100).optional().default(""),
  date: z.string().max(50).optional().default(""),
  designer: z.string().max(200).optional().default(""),
});

const currentCommitmentRowSchema = z.object({
  id: z.string(),
  projectName: z.string().max(300).optional().default(""),
  value: z.string().max(100).optional().default(""),
  percentage: z.string().max(50).optional().default(""),
  designer: z.string().max(200).optional().default(""),
});

const submitTenderSchema = z.object({
  agreedName: z.string().min(1, "Name of Contractor / Tenderer is required").max(200),
  agreedDate: z.string().min(1, "Date is required").max(50),
  agreedSignature: z.string().optional().nullable(),
  agreedStampPreview: z.string().optional().nullable(),
  stampPreview: z.string().optional().nullable(),
  lumpSumRaw: z.string().min(1, "Lump sum amount is required"),
  lumpSumFormatted: z.string().optional().nullable(),
  amountInWords: z.string().optional().nullable(),
  mainTenderer: mainTendererSchema,
  witness: witnessSchema.optional().default({ fullName: "", date: "", signature: null, address: "" }),
  declaration: declarationSchema,
  declarationStampPreview: z.string().optional().nullable(),
  projectExperience: z.array(projectExperienceRowSchema).optional().default([]),
  currentCommitment: z.array(currentCommitmentRowSchema).optional().default([]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenderId = parseInt(id);
    if (isNaN(tenderId)) {
      return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
    }
    const contractorId = session.user.id;

    // 1. Verify contractor role (read from the session, consistent with
    // interest/route.ts and tender-requests/route.ts — avoids a redundant
    // DB round-trip and matches the canonical RBAC read-path).
    const userRoleIds = session.user.roleIds || [];
    if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
      return NextResponse.json({ error: "Only contractors can submit tenders" }, { status: 403 });
    }

    // 2. Get and validate request body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const parsed = submitTenderSchema.safeParse(rawBody);
    if (!parsed.success) {
      const formattedErrors = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details: formattedErrors },
        { status: 400 }
      );
    }
    const {
      agreedDate,
      agreedSignature,
      agreedStampPreview,
      stampPreview,
      lumpSumRaw,
      lumpSumFormatted,   // sent from frontend
      amountInWords,
      declarationStampPreview,
    } = parsed.data;

    // Sanitize only the genuine free-text fields - agreedSignature,
    // *StampPreview, and witness/declaration.signature are base64 image
    // data URIs (signature pad captures), not text, and must pass through
    // untouched or the stored signature/stamp images would be corrupted.
    // This data lands in tender_submission.submission_data (jsonb) and is
    // later re-rendered when the submission is reviewed/printed.
    const agreedName = sanitize(parsed.data.agreedName);
    const mainTenderer = {
      ...parsed.data.mainTenderer,
      fullName: sanitize(parsed.data.mainTenderer.fullName),
      position: sanitize(parsed.data.mainTenderer.position),
      companyName: sanitize(parsed.data.mainTenderer.companyName),
      address: sanitize(parsed.data.mainTenderer.address),
    };
    const witness = {
      ...parsed.data.witness,
      fullName: sanitize(parsed.data.witness.fullName),
      address: sanitize(parsed.data.witness.address),
    };
    const declaration = {
      ...parsed.data.declaration,
      iName: sanitize(parsed.data.declaration.iName),
      onBehalfOf: sanitize(parsed.data.declaration.onBehalfOf),
      name: sanitize(parsed.data.declaration.name),
      address: sanitize(parsed.data.declaration.address),
    };
    const projectExperience = parsed.data.projectExperience.map((row) => ({
      ...row,
      projectName: sanitize(row.projectName),
      designer: sanitize(row.designer),
    }));
    const currentCommitment = parsed.data.currentCommitment.map((row) => ({
      ...row,
      projectName: sanitize(row.projectName),
      designer: sanitize(row.designer),
    }));

    // 4. Check tender exists and is open
    await applyScheduledTenderTransitions();
    const tenderCheck = await query(
      `SELECT ts.status_code, t.closing_date, t.tender_name
       FROM tender t
       JOIN tender_status ts ON t.status_id = ts.status_id
       WHERE t.tender_id = $1`,
      [tenderId]
    );
    if (tenderCheck.rows.length === 0) {
      return NextResponse.json({ error: "Tender not found" }, { status: 404 });
    }
    const tender = tenderCheck.rows[0];
    if (tender.status_code !== "Open") {
      return NextResponse.json({ error: "Tender is no longer open for submissions" }, { status: 400 });
    }
    if (new Date() > new Date(tender.closing_date)) {
      return NextResponse.json({ error: "Submission deadline has passed" }, { status: 400 });
    }

    // 5. Prepare JSON data for storage
    const formData = JSON.stringify({
      agreedName,
      agreedDate,
      agreedSignature,
      agreedStampPreview,
      stampPreview,
      lumpSumRaw,
      lumpSumFormatted,
      amountInWords,
      mainTenderer,
      witness,
      declaration,
      declarationStampPreview,
      projectExperience,
      currentCommitment,
    });

    // 6. Find an existing DRAFT submission for this contractor & tender to
    // update in place. A submission that's already Submitted is never
    // overwritten - resubmitting creates a new round instead, so a prior
    // submission is never silently destroyed.
    const existingDraft = await query(
      `SELECT submission_id FROM tender_submission
       WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false AND status = 'Draft'
       ORDER BY created_at DESC LIMIT 1`,
      [tenderId, contractorId]
    );

    let submissionId;
    if (existingDraft.rows.length > 0) {
      // Update the existing draft to "Submitted"
      const updateRes = await query(
        `UPDATE tender_submission
         SET status = $1, submitted_at = NOW(), updated_at = NOW(),
             bq_name = $2, submission_data = $3
         WHERE submission_id = $4
         RETURNING submission_id`,
        ["Submitted", `Submission for Tender ${tenderId}`, formData, existingDraft.rows[0].submission_id]
      );
      submissionId = updateRes.rows[0].submission_id;
    } else {
      // No draft to update - either this is the first submission, or the
      // contractor already has a Submitted round and is submitting again.
      // Either way, create a new round rather than overwriting history.
      const roundRes = await query(
        `SELECT COALESCE(MAX(round_no), 0) + 1 AS next_round
         FROM tender_submission
         WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false`,
        [tenderId, contractorId]
      );
      const nextRound = roundRes.rows[0].next_round;
      const insertRes = await query(
        `INSERT INTO tender_submission
         (tender_id, contractor_id, round_no, status, submitted_at, created_at, updated_at, bq_name, submission_data)
         VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW(), $5, $6)
         RETURNING submission_id`,
        [tenderId, contractorId, nextRound, "Submitted", `Submission for Tender ${tenderId}`, formData]
      );
      submissionId = insertRes.rows[0].submission_id;
    }

    // 7. Insert acknowledgment (required for BQ template page)
    await query(
      `INSERT INTO tender_acknowledgment (tender_id, contractor_id, signature, sections, acknowledged_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tender_id, contractor_id) DO UPDATE SET
         signature = EXCLUDED.signature,
         acknowledged_at = NOW()`,
      [tenderId, contractorId, declaration.signature || agreedName, JSON.stringify({})]
    );

    // Non-blocking: only creates an approval request if an admin has
    // configured a "tender_submission" chain (admin/security > Workflow
    // Config). No chain configured, no-op. Never delays or gates the
    // submission itself — see src/lib/approvals.ts's header comment.
    void createApprovalRequestIfConfigured(
      "tender_submission",
      submissionId,
      contractorId,
      `Bid submission for "${tender.tender_name}"`,
      `/tenders/${tenderId}/submissions`
    );

    return NextResponse.json({ success: true, submissionId }, { status: 200 });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}