// app/api/tenders/[id]/close/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logUpdate, logAuthEvent } from "@/lib/audit";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as any).role_id;
  if (userRole !== 1) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, "Non-admin attempted to close tender");
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  // Fetch current tender data for audit log
  const oldDataRes = await query(`SELECT * FROM tender WHERE tender_id = $1 AND is_deleted = false`, [tenderId]);
  if (oldDataRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }
  const oldData = oldDataRes.rows[0];

  // Get the status_id for 'Closed'
  const statusRes = await query(
    `SELECT status_id FROM tender_status WHERE status_code = 'Closed' LIMIT 1`,
    []
  );
  if (statusRes.rows.length === 0) {
    return NextResponse.json({ error: "Closed status not found in system" }, { status: 500 });
  }
  const closedStatusId = statusRes.rows[0].status_id;

  // Prevent closing already closed tender
  if (oldData.status_id === closedStatusId) {
    return NextResponse.json({ error: "Tender is already closed" }, { status: 400 });
  }

  // Update the status
  await query(
    `UPDATE tender SET status_id = $1, updated_at = NOW() WHERE tender_id = $2`,
    [closedStatusId, tenderId]
  );

  // Fetch new data for audit
  const newDataRes = await query(`SELECT * FROM tender WHERE tender_id = $1`, [tenderId]);
  const newData = newDataRes.rows[0];
  await logUpdate("tender", tenderId, oldData, newData, session.user.id, req);

  return NextResponse.json({ success: true, status: "Closed" });
}