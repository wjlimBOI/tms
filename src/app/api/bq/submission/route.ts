// app/api/bq/submission/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { bqSubmissionCreateSchema, bqSubmissionUpdateSchema } from "@/lib/validation";
import { logInsert, logUpdate, logAuthEvent } from "@/lib/audit";
import { canEditSubmission } from "@/lib/permissions";

// GET – fetch BQ submissions for current user
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role_id;

  let sql = `
    SELECT 
      ts.submission_id,
      ts.tender_id,
      ts.round_no,
      ts.status,
      ts.bq_name,
      ts.updated_at,
      t.tender_name,
      b.branch_name,
      br.brand_name
    FROM tender_submission ts
    JOIN tender t ON ts.tender_id = t.tender_id
    JOIN branch b ON t.branch_id = b.branch_id
    JOIN brand br ON b.brand_id = br.brand_id
    WHERE ts.is_deleted = false
  `;
  const params: any[] = [];

  if (userRole === 13) {
    // Contractors see only their own submissions
    sql += ` AND ts.contractor_id = $1`;
    params.push(userId);
  }
  // Admins see all

  sql += ` ORDER BY ts.updated_at DESC`;

  const result = await query(sql, params);
  return NextResponse.json(result.rows);
}

// POST – create a new BQ submission (auto‑generates title)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRole = (session.user as any).role_id;
  if (userRole !== 13 && userRole !== 1) {
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
        `SELECT * FROM bq_template_item WHERE tender_id = $1 AND is_deleted = false`,
        [tender_id]
      );

      if (templateItems.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "No BQ template found for this tender. Please contact the administrator." },
          { status: 404 }
        );
      }

      // Insert categories (deduplicated) – skip sort_order
      const uniqueCategories = [...new Set(templateItems.rows.map(item => item.category_id))];
      for (const catId of uniqueCategories) {
        await client.query(
          `INSERT INTO bq_submission_categories (submission_id, category_id)
           VALUES ($1, $2)
           ON CONFLICT (submission_id, category_id) DO NOTHING`,
          [submission_id, catId]
        );
      }

      // Clone line items into bq_line_item (for manual editing)
      for (const item of templateItems.rows) {
        await client.query(
          `INSERT INTO bq_line_item
             (submission_id, category_id, parent_item_id, location, description, specifications,
              brand, quantity, unit, unit_price, discount, amount, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                   (SELECT COALESCE(MAX(sort_order),0)+1 FROM bq_line_item WHERE submission_id=$1 AND category_id=$2))`,
          [
            submission_id,
            item.category_id,
            null,
            item.location,
            item.description,
            item.specifications,
            item.brand,
            item.quantity,
            item.unit,
            item.unit_price,
            item.discount,
            item.amount,
          ]
        );
      }
    } else {
      // Manual category selection – skip sort_order
      if (category_ids && category_ids.length > 0) {
        for (const cat_id of category_ids) {
          await client.query(
            `INSERT INTO bq_submission_categories (submission_id, category_id)
             VALUES ($1, $2)
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

  const canEdit = await canEditSubmission(submission_id, session.user.id, (session.user as any).role_id);
  if (!canEdit) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, `User ${session.user.id} attempted to update BQ header ${submission_id}`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const oldDataRes = await query(`SELECT * FROM tender_submission WHERE submission_id = $1`, [submission_id]);
  const oldData = oldDataRes.rows[0];

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

  return NextResponse.json({ success: true });
}