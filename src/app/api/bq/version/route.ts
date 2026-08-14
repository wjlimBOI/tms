import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { sanitize } from "@/lib/sanitize";
import { isSuperUser } from "@/lib/roles";

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
    `SELECT ts.tender_id, ts.contractor_id, ts.round_no,
            ts.bq_date, ts.area_size, ts.client_name_override, ts.logo_url,
            ts.renovation_type_override, ts.branch_name_override, ts.bq_name,
            tstat.status_code AS tender_status_code
     FROM tender_submission ts
     JOIN tender t ON t.tender_id = ts.tender_id
     JOIN tender_status tstat ON tstat.status_id = t.status_id
     WHERE ts.submission_id = $1 AND ts.is_deleted = false`,
    [submission_id]
  );
  if (sourceRes.rows.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const source = sourceRes.rows[0];

  // Only the owning contractor (or an admin) may branch a new version off
  // this submission - matches the owner-or-admin pattern in bq/reset/route.ts.
  const userRoleIds = (session.user as any)?.roleIds || [];
  const isAdmin = isSuperUser(userRoleIds);
  const isOwner = String(source.contractor_id) === String(session.user.id);
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const newRound = source.round_no + 1;

  // Once the tender closes, a contractor can no longer spontaneously branch
  // a new round — the only way to resubmit after Closed is a specific,
  // staff-initiated resubmission_request targeting exactly this next round
  // number (2026-08-10 negotiation-workflow decision). Admin/Developer are
  // exempt (they may need to fix things directly).
  if (!isAdmin && source.tender_status_code !== "Open") {
    const grantRes = await query(
      `SELECT 1 FROM resubmission_request
       WHERE tender_id = $1 AND contractor_id = $2 AND next_round_no = $3
       LIMIT 1`,
      [source.tender_id, source.contractor_id, newRound]
    );
    if (grantRes.rows.length === 0) {
      return NextResponse.json(
        { error: "This tender is no longer open for submissions. Contact the project team if you were asked to resubmit." },
        { status: 403 }
      );
    }
  }
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