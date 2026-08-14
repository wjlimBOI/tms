// app/api/bq/submission/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { bqSubmissionCreateSchema, bqSubmissionUpdateSchema } from "@/lib/validation";
import { logInsert, logUpdate, logAuthEvent } from "@/lib/audit";
import { canEditSubmission } from "@/lib/permissions";
import { ROLE_IDS, isSuperUser } from "@/lib/roles";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { createApprovalRequestIfConfigured } from "@/lib/approvals";

// GET – fetch BQ submissions for current user
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const userRoleIds = (session.user as any).roleIds || [];
  const pagination = parsePagination(new URL(req.url).searchParams);

  let whereClause = `WHERE ts.is_deleted = false`;
  const params: any[] = [];

  if (userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    // Contractors see only their own submissions
    whereClause += ` AND ts.contractor_id = $1`;
    params.push(userId);
  }
  // Admins see all — this is the unbounded case pagination targets.

  const baseFrom = `
    FROM tender_submission ts
    JOIN tender t ON ts.tender_id = t.tender_id
    JOIN branch b ON t.branch_id = b.branch_id
    JOIN brand br ON b.brand_id = br.brand_id
    ${whereClause}
  `;

  if (!pagination) {
    const result = await query(
      `SELECT ts.submission_id, ts.tender_id, ts.round_no, ts.status, ts.bq_name,
              ts.updated_at, t.tender_name, b.branch_name, br.brand_name
       ${baseFrom}
       ORDER BY ts.updated_at DESC`,
      params
    );
    return NextResponse.json(result.rows);
  }

  const countRes = await query(`SELECT COUNT(*) AS total ${baseFrom}`, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const dataParams = [...params, pagination.limit, pagination.offset];
  const result = await query(
    `SELECT ts.submission_id, ts.tender_id, ts.round_no, ts.status, ts.bq_name,
            ts.updated_at, t.tender_name, b.branch_name, br.brand_name
     ${baseFrom}
     ORDER BY ts.updated_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return NextResponse.json({ data: result.rows, ...paginationMeta(pagination, total) });
}

// POST – create a new BQ submission (auto‑generates title)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoleIds = (session.user as any).roleIds || [];
  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR) && !isSuperUser(userRoleIds)) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, `User ${session.user.id} attempted to create BQ without permission`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Parse JSON body manually (no validateBody) ---
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // --- Validate with Zod's safeParse ---
  const validation = bqSubmissionCreateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.message }, { status: 400 });
  }

  const { tender_id, category_ids, bq_name, copy_from_template } = validation.data;
  const userId = (session.user as any).id;

  // --- Auto‑generate title if not provided ---
  let finalBqName = bq_name?.trim();
  if (!finalBqName) {
    const tenderRes = await query(`SELECT tender_name FROM tender WHERE tender_id = $1 AND is_deleted = false`, [tender_id]);
    if (tenderRes.rows.length === 0) {
      return NextResponse.json({ error: "Tender not found" }, { status: 404 });
    }
    const tenderName = tenderRes.rows[0].tender_name;
    const displayName = (session.user as any).name?.trim() || (session.user as any).username || "Contractor";
    finalBqName = `${displayName} – ${tenderName} – v1`;
  }

  // Verify tender exists
  const tenderCheck = await query(
    `SELECT 1 FROM tender WHERE tender_id = $1 AND is_deleted = false`,
    [tender_id]
  );
  if (tenderCheck.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Get next round number for this contractor
    const roundRes = await client.query(
      `SELECT COALESCE(MAX(round_no), 0) + 1 as next_round
       FROM tender_submission
       WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false`,
      [tender_id, userId]
    );
    const nextRound = roundRes.rows[0].next_round;

    // Insert the submission
    const subRes = await client.query(
      `INSERT INTO tender_submission
         (tender_id, contractor_id, round_no, status, bq_name, created_at, updated_at)
       VALUES ($1, $2, $3, 'Draft', $4, NOW(), NOW())
       RETURNING submission_id`,
      [tender_id, userId, nextRound, finalBqName]
    );
    const submission_id = subRes.rows[0].submission_id;

    // ------------------------------
    // Handle template copying OR manual categories
    // ------------------------------
    if (copy_from_template) {
      const templateItems = await client.query(
        `SELECT item_id, category_id, description, unit, sort_order, parent_item_id, quantity, rate
         FROM bq_template_items WHERE tender_id = $1`,
        [tender_id]
      );

      if (templateItems.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "No BQ template found for this tender. Please contact the administrator." },
          { status: 404 }
        );
      }

      // Insert enabled categories (deduplicated), preserving the tender's configured order
      const uniqueCategories = [...new Set(templateItems.rows.map(item => item.category_id))];
      const catOrderRes = await client.query(
        `SELECT category_id, sort_order FROM tender_work_category WHERE tender_id = $1`,
        [tender_id]
      );
      const catOrder = new Map(catOrderRes.rows.map((r: any) => [r.category_id, r.sort_order]));
      for (const catId of uniqueCategories) {
        await client.query(
          `INSERT INTO submission_category (submission_id, category_id, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (submission_id, category_id) DO NOTHING`,
          [submission_id, catId, catOrder.get(catId) ?? 0]
        );
      }

      // Clone line items into bq_line_item, preserving parent/child hierarchy.
      // Top-level items first so child items can reference the new cloned IDs.
      const oldToNewId = new Map<number, number>();
      const topLevel = templateItems.rows.filter((i: any) => !i.parent_item_id);
      const children = templateItems.rows.filter((i: any) => i.parent_item_id);

      const insertClonedItem = async (item: any, newParentId: number | null) => {
        const quantity = item.quantity ?? 0;
        const unit_price = item.rate ?? 0;
        const amount = quantity * unit_price;
        const res = await client.query(
          `INSERT INTO bq_line_item
             (submission_id, category_id, parent_item_id, location, description, specifications,
              brand, quantity, unit, unit_price, discount, amount, sort_order)
           VALUES ($1, $2, $3, '', $4, '', '', $5, $6, $7, 0, $8, $9)
           RETURNING line_item_id`,
          [submission_id, item.category_id, newParentId, item.description, quantity, item.unit, unit_price, amount, item.sort_order || 0]
        );
        oldToNewId.set(item.item_id, res.rows[0].line_item_id);
      };

      for (const item of topLevel) await insertClonedItem(item, null);
      for (const item of children) await insertClonedItem(item, oldToNewId.get(item.parent_item_id) ?? null);
    } else {
      // Manual category selection
      if (category_ids && category_ids.length > 0) {
        for (const cat_id of category_ids) {
          await client.query(
            `INSERT INTO submission_category (submission_id, category_id, sort_order)
             VALUES ($1, $2, 0)
             ON CONFLICT (submission_id, category_id) DO NOTHING`,
            [submission_id, cat_id]
          );
        }
      } else {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Either category_ids or copy_from_template must be provided" },
          { status: 400 }
        );
      }
    }

    await client.query("COMMIT");
    await logInsert("tender_submission", submission_id, { tender_id, category_ids, bq_name: finalBqName, copy_from_template }, userId, req);
    return NextResponse.json({ submission_id });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating BQ submission:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  } finally {
    client.release();
  }
}

// PUT – update BQ header fields (bq_name is ignored)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = bqSubmissionUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.message }, { status: 400 });
  }

  const { submission_id, ...fields } = validation.data;
  const { bq_name, ...allowedFields } = fields; // bq_name is not allowed to update

  const canEdit = await canEditSubmission(submission_id, session.user.id, (session.user as any).roleIds || []);
  if (!canEdit) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, `User ${session.user.id} attempted to update BQ header ${submission_id}`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const oldDataRes = await query(`SELECT * FROM tender_submission WHERE submission_id = $1`, [submission_id]);
  const oldData = oldDataRes.rows[0];

  // A contractor must have signed the tender's Form of Tender (the real,
  // in-app acknowledgment mechanism — tenders/[id]/edit's signature flow,
  // POST /api/tenders/[id]/submit — writes tender_acknowledgment) before
  // their BQ can move from Draft to Submitted. Staff-driven transitions
  // (e.g. Admin/Developer reverting or otherwise adjusting status) are not
  // gated here — this only fires on the real Draft->Submitted event.
  if (oldData.status !== "Submitted" && allowedFields.status === "Submitted") {
    const ackRes = await query(
      `SELECT 1 FROM tender_acknowledgment WHERE tender_id = $1 AND contractor_id = $2`,
      [oldData.tender_id, oldData.contractor_id]
    );
    if (ackRes.rows.length === 0) {
      return NextResponse.json(
        {
          error: "You must sign the Form of Tender for this project before submitting your BQ.",
          code: "ACKNOWLEDGMENT_REQUIRED",
          tenderId: oldData.tender_id,
        },
        { status: 409 }
      );
    }
  }

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(allowedFields)) {
    if (value !== undefined) {
      updates.push(`${key} = $${idx++}`);
      values.push(value === null ? null : value);
    }
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  updates.push(`updated_at = NOW()`);
  values.push(submission_id);

  await query(`UPDATE tender_submission SET ${updates.join(", ")} WHERE submission_id = $${idx}`, values);

  const newDataRes = await query(`SELECT * FROM tender_submission WHERE submission_id = $1`, [submission_id]);
  const newData = newDataRes.rows[0];
  await logUpdate("tender_submission", submission_id, oldData, newData, session.user.id, req);

  // Non-blocking: only fires on the actual Draft -> Submitted transition
  // (not every unrelated header edit), and only creates an approval request
  // if an admin has configured a "bq_submission" chain (admin/security >
  // Workflow Config). No chain configured, no-op. Never delays or gates the
  // BQ submission itself — see src/lib/approvals.ts's header comment.
  if (oldData.status !== "Submitted" && newData.status === "Submitted") {
    void createApprovalRequestIfConfigured(
      "bq_submission",
      submission_id,
      session.user.id,
      `${newData.bq_name || "BQ"} submission`,
      `/bq/${submission_id}/view`
    );
  }

  return NextResponse.json({ success: true });
}