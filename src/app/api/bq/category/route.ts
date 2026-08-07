import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { canEditSubmission } from "@/lib/permissions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { submission_id, category_id } = await req.json();
  if (!submission_id || !category_id) {
    return NextResponse.json({ error: "Missing submission_id or category_id" }, { status: 400 });
  }

  const canEdit = await canEditSubmission(submission_id, session.user.id, session.user.roleIds || []);
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden – you cannot modify this BQ" }, { status: 403 });
  }

  try {
    const workCatRes = await query(
      `SELECT sort_order FROM work_category WHERE category_id = $1`,
      [category_id]
    );
    if (workCatRes.rows.length === 0) {
      return NextResponse.json({ error: "Invalid category_id" }, { status: 400 });
    }
    const workSortOrder = workCatRes.rows[0].sort_order;

    await query(
      `INSERT INTO submission_category (submission_id, category_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (submission_id, category_id) DO NOTHING`,
      [submission_id, category_id, workSortOrder]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding category:", error);
    return NextResponse.json({ error: "Failed to add category" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { submission_id, category_id } = await req.json();
  if (!submission_id || !category_id) {
    return NextResponse.json({ error: "Missing submission_id or category_id" }, { status: 400 });
  }

  const canEdit = await canEditSubmission(submission_id, session.user.id, session.user.roleIds || []);
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden – you cannot modify this BQ" }, { status: 403 });
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM bq_line_item WHERE submission_id = $1 AND category_id = $2`,
      [submission_id, category_id]
    );
    await client.query(
      `DELETE FROM submission_category WHERE submission_id = $1 AND category_id = $2`,
      [submission_id, category_id]
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error removing category:", error);
    return NextResponse.json({ error: "Failed to remove category" }, { status: 500 });
  } finally {
    client.release();
  }
}