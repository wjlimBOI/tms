import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";
import { sanitize } from "@/lib/sanitize";

// PUT – rename a version
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !((session.user as any)?.roleIds || []).includes(ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { version_name } = await req.json();
  if (!version_name) {
    return NextResponse.json({ error: "Missing version_name" }, { status: 400 });
  }

  await query(
    `UPDATE tender_submission SET version_name = $1 WHERE submission_id = $2`,
    [sanitize(version_name), id]
  );
  return NextResponse.json({ success: true });
}

// DELETE – remove a version (and all associated data)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !((session.user as any)?.roleIds || []).includes(ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const client = await (await import("@/lib/db")).default.connect();
  try {
    await client.query("BEGIN");
    // Delete line items
    await client.query(`DELETE FROM bq_line_item WHERE submission_id = $1`, [id]);
    // Delete category links
    await client.query(`DELETE FROM submission_category WHERE submission_id = $1`, [id]);
    // Delete the submission itself
    await client.query(`DELETE FROM tender_submission WHERE submission_id = $1`, [id]);
    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Failed to delete version" }, { status: 500 });
  } finally {
    client.release();
  }
}