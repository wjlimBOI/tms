// app/api/tender-extension/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logUpdate } from "@/lib/audit";
import { sendExtensionDecisionEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notifications";
import { canApproveExtension } from "@/lib/permissions";
import { sanitize } from "@/lib/sanitize";

// GET – fetch a single extension request (unchanged)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!(await canApproveExtension(userRoleIds))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const requestId = parseInt(id, 10);
  if (isNaN(requestId)) {
    return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  }

  const result = await query(
    `SELECT 
       r.*,
       t.tender_name,
       t.tender_id,
       u.username AS requester_name,
       u.email AS requester_email
     FROM tender_extension_requests r
     JOIN tender t ON r.tender_id = t.tender_id
     JOIN users u ON r.requested_by = u.user_id
     WHERE r.id = $1`,
    [requestId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

// PUT – approve or reject a request (with audit logging)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!(await canApproveExtension(userRoleIds))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const requestId = parseInt(id, 10);
  if (isNaN(requestId)) {
    return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  }

  const body = await req.json();
  const { status } = body; // status: 'Approved' | 'Rejected'
  const reason = body.reason ? sanitize(body.reason) : body.reason;
  if (!status || !['Approved', 'Rejected'].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // 1. Fetch current request (old data)
  const requestRes = await query(
    `SELECT * FROM tender_extension_requests WHERE id = $1`,
    [requestId]
  );
  if (requestRes.rows.length === 0) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  const oldData = requestRes.rows[0];
  if (oldData.status !== 'Pending') {
    return NextResponse.json({ error: "Request already processed" }, { status: 400 });
  }

  // 2. Fetch tender name for email
  const tenderRes = await query(
    `SELECT tender_name FROM tender WHERE tender_id = $1`,
    [oldData.tender_id]
  );
  const tenderName = tenderRes.rows[0]?.tender_name || 'Unknown Tender';

  // 3. Update request
  const now = new Date().toISOString();
  await query(
    `UPDATE tender_extension_requests
     SET status = $1, approved_by = $2, approved_at = $3, updated_at = $4
     WHERE id = $5`,
    [status, (session.user as any).id, now, now, requestId]
  );

  // 4. If approved, update the tender's closing_date
  if (status === 'Approved') {
    await query(
      `UPDATE tender
       SET closing_date = $1, updated_at = $2
       WHERE tender_id = $3`,
      [oldData.proposed_closing_date, now, oldData.tender_id]
    );
  }

  // 5. Audit log
  const newData = {
    status,
    approved_by: (session.user as any).id,
    approved_at: now,
    ...(status === 'Rejected' && { rejection_reason: reason || null }),
  };
  // oldData already has the full row; we can pass it as is
  await logUpdate(
    "tender_extension_requests", // table_name
    requestId,
    oldData,
    newData,
    (session.user as any).id,
    req
  );

  // 6. Send email + in-app notification to the requester
  try {
    const userRes = await query(
      `SELECT email, username FROM users WHERE user_id = $1`,
      [oldData.requested_by]
    );
    const requester = userRes.rows[0];
    if (requester) {
      await sendExtensionDecisionEmail({
        tenderName,
        requesterEmail: requester.email,
        requesterName: requester.username,
        status,
        reason: reason || '',
        originalClosing: oldData.original_closing_date,
        proposedClosing: oldData.proposed_closing_date,
        tenderId: oldData.tender_id,
      });
      await notifyUsers(
        [oldData.requested_by],
        `Extension request ${status.toLowerCase()}`,
        `Your extension request for "${tenderName}" was ${status.toLowerCase()}.`,
        `/tenders/${oldData.tender_id}`
      );
    }
  } catch (emailError) {
    console.error("Failed to send decision email:", emailError);
  }

  return NextResponse.json({ success: true, status });
}