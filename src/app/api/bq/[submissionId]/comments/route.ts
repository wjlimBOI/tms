// app/api/bq/[submissionId]/comments/route.ts
//
// Staff notes on a BQ submission, using the real (previously unused)
// review_comment table. Each note is explicitly marked visible-to-contractor
// or internal-only at creation time — contractors only ever see the former
// (2026-08-10). Auto-creates a submission_review row on first comment if the
// submission doesn't already have one (e.g. via a resubmission request).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";
import { createNotification } from "@/lib/notifications";
import { sanitize } from "@/lib/sanitize";
import { logInsert } from "@/lib/audit";
import { canAccessSubmission } from "@/lib/permissions";

const createSchema = z.object({
  comment_body: z.string().min(1).max(4000),
  visible_to_contractor: z.boolean().default(false),
  requires_action: z.boolean().default(false),
  line_item_id: z.number().int().positive(),
});

// ---------- GET — list comments for a submission ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];
  const isContractor = roleIds.includes(ROLE_IDS.CONTRACTOR);

  const { submissionId } = await params;
  const subId = parseInt(submissionId);
  if (isNaN(subId)) {
    return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
  }

  const subRes = await query(
    `SELECT tender_id, contractor_id
     FROM tender_submission
     WHERE submission_id = $1 AND is_deleted = false`,
    [subId]
  );
  if (subRes.rows.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const submission = subRes.rows[0];
  const ownsSubmission = submission.contractor_id === userId;
  const canReadSubmission = isContractor
    ? ownsSubmission
    : await canAccessSubmission(subId, userId, roleIds);
  if (!canReadSubmission) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const visibilityClause = isContractor ? `AND rc.visible_to_contractor = true` : "";
  const result = await query(
    `WITH numbered_categories AS (
       SELECT category_id, ROW_NUMBER() OVER (ORDER BY sort_order) AS cat_num
       FROM (
         SELECT DISTINCT li.category_id, c.sort_order
         FROM bq_line_item li
         JOIN work_category c ON li.category_id = c.category_id
         WHERE li.submission_id = $1
       ) AS category_ordering
     ),
     numbered_items AS (
       SELECT li.line_item_id, li.description,
              CONCAT(nc.cat_num, '.', ROW_NUMBER() OVER (PARTITION BY li.category_id ORDER BY li.sort_order)) AS item_no
       FROM bq_line_item li
       JOIN numbered_categories nc ON li.category_id = nc.category_id
       WHERE li.submission_id = $1
     )
     SELECT rc.comment_id, rc.comment_body, rc.visible_to_contractor, rc.requires_action, rc.created_at,
            rc.line_item_id, rc.contractor_read_at, ni.item_no, ni.description AS item_description,
            u.username AS author_name
     FROM review_comment rc
     JOIN submission_review sr ON sr.review_id = rc.review_id
     JOIN users u ON u.user_id = rc.author_id
     LEFT JOIN numbered_items ni ON ni.line_item_id = rc.line_item_id
     WHERE sr.submission_id = $1 ${visibilityClause}
     ORDER BY rc.created_at ASC`,
    [subId]
  );

  if (!isContractor) {
    return NextResponse.json(result.rows);
  }

  // Contractor branch: flag notes that are about to be marked read for the
  // first time (is_new) using the pre-update state, then mark them read —
  // this lets the same response show a "New" badge exactly once, on the
  // load where the note is actually delivered to the contractor.
  const rows = result.rows.map((r: { comment_id: number; contractor_read_at: string | null }) => ({
    ...r,
    is_new: r.contractor_read_at === null,
  }));
  const unreadIds = rows.filter((r: { is_new: boolean }) => r.is_new).map((r: { comment_id: number }) => r.comment_id);
  if (unreadIds.length > 0) {
    await query(
      `UPDATE review_comment SET contractor_read_at = NOW() WHERE comment_id = ANY($1::int[]) AND contractor_read_at IS NULL`,
      [unreadIds]
    );
  }

  return NextResponse.json(rows);
}

// ---------- POST — add a note (staff only) ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];
  if (roleIds.includes(ROLE_IDS.CONTRACTOR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { submissionId } = await params;
  const subId = parseInt(submissionId);
  if (isNaN(subId)) {
    return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
  }

  const canAccess = await canAccessSubmission(subId, userId, roleIds);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validation = createSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: "Validation failed", details: validation.error.issues }, { status: 400 });
  }
  const { visible_to_contractor, requires_action, line_item_id } = validation.data;
  const commentBody = sanitize(validation.data.comment_body);

  const detailRes = await query(
    `SELECT ts.contractor_id, ts.bq_name, t.tender_id, t.tender_name, u.email AS contractor_email, u.username AS contractor_username
     FROM tender_submission ts
     JOIN tender t ON t.tender_id = ts.tender_id
     JOIN users u ON u.user_id = ts.contractor_id
     WHERE ts.submission_id = $1 AND ts.is_deleted = false`,
    [subId]
  );
  if (detailRes.rows.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const sub = detailRes.rows[0];

  const itemRes = await query(
    `SELECT description FROM bq_line_item WHERE line_item_id = $1 AND submission_id = $2`,
    [line_item_id, subId]
  );
  if (itemRes.rows.length === 0) {
    return NextResponse.json({ error: "Select a valid BQ item to attach this note to." }, { status: 400 });
  }
  const item = itemRes.rows[0];

  // Reuse an existing review for this submission if one exists (e.g. from a
  // prior resubmission request), otherwise create a lightweight one just to
  // anchor this comment thread.
  let reviewId: number;
  const existingReview = await query(
    `SELECT review_id FROM submission_review WHERE submission_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [subId]
  );
  if (existingReview.rows.length > 0) {
    reviewId = existingReview.rows[0].review_id;
  } else {
    const reviewRes = await query(
      `INSERT INTO submission_review (submission_id, reviewed_by, review_role, review_status)
       VALUES ($1, $2, $3, $4)
       RETURNING review_id`,
      [subId, userId, "General", "In Progress"]
    );
    reviewId = reviewRes.rows[0].review_id;
  }

  const commentRes = await query(
    `INSERT INTO review_comment (review_id, author_id, comment_body, visible_to_contractor, requires_action, contractor_notified, line_item_id)
     VALUES ($1, $2, $3, $4, $5, false, $6)
     RETURNING comment_id, created_at`,
    [reviewId, userId, commentBody, visible_to_contractor, requires_action, line_item_id]
  );
  const comment = commentRes.rows[0];

  await logInsert(
    "review_comment",
    comment.comment_id,
    { submission_id: subId, visible_to_contractor, requires_action, line_item_id },
    userId,
    request,
    { action: "add_bq_comment", submission_id: subId, source: "api" }
  );

  if (visible_to_contractor) {
    void (async () => {
      try {
        await createNotification(
          sub.contractor_id,
          "New note on your BQ",
          `A note was added to your submission for "${sub.tender_name}".`,
          `/bq/${subId}/edit`
        );
        await query(`UPDATE review_comment SET contractor_notified = true WHERE comment_id = $1`, [comment.comment_id]);
      } catch (err) {
        console.error(`Comment notification failed for comment ${comment.comment_id}:`, err);
      }
    })();
  }

  return NextResponse.json(
    {
      comment_id: comment.comment_id,
      comment_body: commentBody,
      visible_to_contractor,
      requires_action,
      created_at: comment.created_at,
      author_name: (session.user as any).name || (session.user as any).username,
      line_item_id,
      item_description: item.description,
      contractor_read_at: null,
    },
    { status: 201 }
  );
}
