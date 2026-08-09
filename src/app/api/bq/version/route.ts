import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { sanitize } from "@/lib/sanitize";
import { ROLE_IDS } from "@/lib/roles";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { submission_id, version_name } = await req.json();
  if (!submission_id) {
    return NextResponse.json({ error: "Missing submission_id" }, { status: 400 });
  }

  // Fetch source submission
  const sourceRes = await query(
    `SELECT tender_id, contractor_id, round_no,
            bq_date, area_size, client_name_override, logo_url,
            renovation_type_override, branch_name_override, bq_name
     FROM tender_submission
     WHERE submission_id = $1 AND is_deleted = false`,
    [submission_id]
  );
  if (sourceRes.rows.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const source = sourceRes.rows[0];

  // Only the owning contractor (or an admin) may branch a new version off
  // this submission - matches the owner-or-admin pattern in bq/reset/route.ts.
  const userRoleIds = (session.user as any)?.roleIds || [];
  const isAdmin = userRoleIds.includes(ROLE_IDS.ADMIN);
  const isOwner = String(source.contractor_id) === String(session.user.id);
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const newRound = source.round_no + 1;
  const finalVersionName = version_name?.trim() ? sanitize(version_name.trim()) : `Round ${newRound}`;

  const client = await (await import("@/lib/db")).default.connect();
  try {
    await client.query("BEGIN");

    const newSubRes = await client.query(
      `INSERT INTO tender_submission
        (tender_id, contractor_id, round_no, version_name, status,
         bq_date, area_size, client_name_override, logo_url,
         renovation_type_override, branch_name_override, bq_name,
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Draft', $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING submission_id`,
      [
        source.tender_id,
        source.contractor_id,
        newRound,
        finalVersionName,
        source.bq_date,
        source.area_size,
        source.client_name_override,
        source.logo_url,
        source.renovation_type_override,
        source.branch_name_override,
        source.bq_name,
      ]
    );
    const newSubmissionId = newSubRes.rows[0].submission_id;

    // Copy categories
    await client.query(
      `INSERT INTO submission_category (submission_id, category_id, sort_order)
       SELECT $1, category_id, sort_order
       FROM submission_category
       WHERE submission_id = $2`,
      [newSubmissionId, submission_id]
    );

    // Copy line items - amount is what the edit/view UI actually reads, so it
    // must be carried over explicitly (it is not DB-generated).
    await client.query(
      `INSERT INTO bq_line_item
        (submission_id, category_id, parent_item_id,
         location, description, specifications, brand,
         quantity, unit, unit_price, discount, sort_order, level, total_price, amount)
       SELECT $1, category_id, parent_item_id,
              location, description, specifications, brand,
              quantity, unit, unit_price, discount, sort_order, level, total_price, amount
       FROM bq_line_item
       WHERE submission_id = $2`,
      [newSubmissionId, submission_id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ submission_id: newSubmissionId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error saving new version:", err);
    return NextResponse.json({ error: "Failed to create new version" }, { status: 500 });
  } finally {
    client.release();
  }
}