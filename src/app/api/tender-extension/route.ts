// app/api/tender-extension/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logInsert } from "@/lib/audit";
import { sendExtensionRequestEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notifications";
import { ROLE_IDS } from "@/lib/roles";
import { getExtensionApproverRoleIds } from "@/lib/permissions";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { sanitize } from "@/lib/sanitize";

// ===== POST: Request a time extension =====
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  // Allow only contractors
  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    return NextResponse.json({ error: "Only contractors can request extensions" }, { status: 403 });
  }

  const body = await req.json();
  const { tender_id, requested_days } = body;

  // Validate required fields
  if (!tender_id || !requested_days || !body.reason) {
    return NextResponse.json(
      { error: "Missing required fields: tender_id, requested_days, reason" },
      { status: 400 }
    );
  }
  const reason = sanitize(body.reason);

  if (requested_days < 1) {
    return NextResponse.json({ error: "Requested days must be at least 1" }, { status: 400 });
  }

  const userId = (session.user as any).id;

  await applyScheduledTenderTransitions();

  // 1. Fetch tender details and validate existence
  const tenderRes = await query(
    `SELECT t.tender_id, t.tender_name, t.closing_date, t.status_id
     FROM tender t
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tender_id]
  );
  if (tenderRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }
  const tender = tenderRes.rows[0];

  // 2. Check if tender is "Open"
  const statusRes = await query(
    `SELECT status_code FROM tender_status WHERE status_id = $1`,
    [tender.status_id]
  );
  if (statusRes.rows.length === 0 || statusRes.rows[0].status_code !== 'Open') {
    return NextResponse.json(
      { error: "Tender is not open for extension requests" },
      { status: 400 }
    );
  }

  // 3. Check if closing date has already passed
  const now = new Date();
  const closingDate = new Date(tender.closing_date);
  if (closingDate < now) {
    return NextResponse.json(
      { error: "The tender closing date has already passed. Extensions are no longer available." },
      { status: 400 }
    );
  }

  // 3b. EOT requests are a last-chance window, not something to lodge weeks
  // out — only accepted within 48 hours of closing.
  const EOT_WINDOW_MS = 48 * 60 * 60 * 1000;
  const eotWindowOpensAt = new Date(closingDate.getTime() - EOT_WINDOW_MS);
  if (now < eotWindowOpensAt) {
    return NextResponse.json(
      {
        error: `Extension requests can only be submitted within 48 hours of the closing time. This tender closes on ${closingDate.toLocaleString()}.`,
      },
      { status: 400 }
    );
  }

  // 4. Check if this tender has already been extended once (approved request exists)
  const approvedRes = await query(
    `SELECT id FROM tender_extension_requests WHERE tender_id = $1 AND status = 'Approved'`,
    [tender_id]
  );
  if (approvedRes.rows.length > 0) {
    return NextResponse.json(
      { error: "This tender has already been extended. Further extensions are not allowed." },
      { status: 400 }
    );
  }

  // 5. Check for any pending request
  const pendingRes = await query(
    `SELECT id FROM tender_extension_requests WHERE tender_id = $1 AND status = 'Pending'`,
    [tender_id]
  );
  if (pendingRes.rows.length > 0) {
    return NextResponse.json(
      { error: "A pending extension request already exists for this tender" },
      { status: 400 }
    );
  }

  // 6. Compute proposed closing date
  const closing = new Date(tender.closing_date);
  closing.setDate(closing.getDate() + requested_days);
  const proposedClosing = closing.toISOString();

  // 7. Insert extension request
  const result = await query(
    `INSERT INTO tender_extension_requests
       (tender_id, requested_by, requested_days, reason,
        original_closing_date, proposed_closing_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
     RETURNING id`,
    [
      tender_id,
      userId,
      requested_days,
      reason,
      tender.closing_date,
      proposedClosing,
    ]
  );
  const requestId = result.rows[0].id;

  // Audit log with extra details
  await logInsert(
    "tender_extension_requests",
    requestId,
    { tender_id, requested_days, reason, original_closing: tender.closing_date, proposed_closing: proposedClosing },
    userId,
    req,
    { action: "request_extension", tender_name: tender.tender_name }
  );

  // 8. Send email notifications
  try {
    // Retrieve approver and CC role IDs from settings (or fallback to hardcoded)
    const settingsRes = await query(
      `SELECT role_id, is_cc FROM tender_extension_settings`
    );
    const ccRoleIds = settingsRes.rows
      .filter(r => r.is_cc)
      .map(r => r.role_id);

    // Single source of truth for "who can approve" — same helper the actual
    // approval gate (tender-extension/[id]/route.ts) uses, so this
    // notification list can never drift from who's really authorized.
    const finalApproverRoles = await getExtensionApproverRoleIds();
    const finalCcRoles = ccRoleIds.length > 0 ? ccRoleIds : [10, 8];

    // Get approver and CC user info
    const usersQuery = `
      SELECT u.user_id, u.email, u.username FROM users u
      JOIN user_roles ur ON u.user_id = ur.user_id
      WHERE ur.role_id = ANY($1) AND u.is_active = true
    `;
    const approvers = await query(usersQuery, [finalApproverRoles]);
    const ccUsers = await query(usersQuery, [finalCcRoles]);

    // Requester info
    const requesterName = (session.user as any).username || "Contractor";

    // Prepare email data – use the imported function
    await sendExtensionRequestEmail({
      tenderName: tender.tender_name,
      tenderId: tender.tender_id,
      requestedBy: requesterName,
      requestedDays: requested_days,
      reason,
      originalClosing: tender.closing_date,
      proposedClosing,
      approverEmails: approvers.rows.map(r => r.email),
      ccEmails: ccUsers.rows.map(r => r.email),
      requestId,
    });

    const allRecipientIds = [...new Set([...approvers.rows, ...ccUsers.rows].map((r) => r.user_id))];
    await notifyUsers(
      allRecipientIds,
      "Tender extension request",
      `${requesterName} requested a ${requested_days}-day extension for "${tender.tender_name}".`,
      `/admin/tenders/${tender.tender_id}/extensions/${requestId}`
    );
  } catch (emailError) {
    console.error("Failed to send extension notification email:", emailError);
    // Do not fail the request – just log the error
  }

  return NextResponse.json({ success: true, requestId });
}

// ===== GET: Check extension status for a tender (includes id for approval link) =====
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const tenderId = parseInt(url.searchParams.get("tender_id") || "0");
  if (!tenderId) {
    return NextResponse.json(
      { error: "tender_id query parameter is required" },
      { status: 400 }
    );
  }

  const result = await query(
    `SELECT id, status, requested_days, reason, requested_by, created_at
     FROM tender_extension_requests
     WHERE tender_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenderId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ status: null });
  }

  const row = result.rows[0];
  // reason is the requester's private free-text justification - only the
  // requester themselves or staff (non-Contractor roles) may see it; other
  // participants on the tender only need to know a request is pending.
  const roleIds = ((session.user as any).roleIds || []) as number[];
  const isStaff = !roleIds.includes(ROLE_IDS.CONTRACTOR);
  const isRequester = row.requested_by === session.user.id;
  return NextResponse.json({
    id: row.id,
    status: row.status,
    requestedDays: row.requested_days,
    reason: isStaff || isRequester ? row.reason : null,
    createdAt: row.created_at,
  });
}