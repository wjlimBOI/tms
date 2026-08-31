// app/api/tenders/[id]/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { canAccessTenderMessages } from "@/lib/permissions";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { notifyUsers, sendTrackedEmail } from "@/lib/notifications";
import { sendInvitationEmail } from "@/lib/email";
import { logInsert } from "@/lib/audit";
import { z } from "zod";

const inviteBodySchema = z.object({
  contractor_ids: z.array(z.number().int().positive()).min(1).max(50),
});

const INVITE_TOKEN_TTL_DAYS = 14;

// ---------- POST — staff invites specific contractors to a tender ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenderId = parseInt(id);
    if (isNaN(tenderId)) {
      return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
    }

    const user = session.user as any;
    const access = await canAccessTenderMessages(tenderId, user.id, user.email, user.roleIds || []);
    if (!access.allowed || !access.isStaff) {
      return NextResponse.json({ error: "You do not have access to invite contractors on this tender" }, { status: 403 });
    }

    const raw = await request.json().catch(() => null);
    const parsed = inviteBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Select at least one contractor to invite" }, { status: 400 });
    }
    const { contractor_ids } = parsed.data;

    await applyScheduledTenderTransitions();
    const tenderRes = await query(
      `SELECT t.tender_id, t.tender_name, ts.status_code
       FROM tender t
       JOIN tender_status ts ON t.status_id = ts.status_id
       WHERE t.tender_id = $1 AND t.is_deleted = false`,
      [tenderId]
    );
    if (tenderRes.rows.length === 0) {
      return NextResponse.json({ error: "Tender not found" }, { status: 404 });
    }
    const tender = tenderRes.rows[0];
    if (tender.status_code !== "Open") {
      return NextResponse.json({ error: "Invitations can only be sent while this tender is open" }, { status: 400 });
    }

    const contractorsRes = await query(
      `SELECT u.user_id, u.email, COALESCE(up.full_name, u.display_name, u.username) AS full_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN user_profile up ON up.user_id = u.user_id
       WHERE u.user_id = ANY($1::int[]) AND ur.role_id = (SELECT role_id FROM roles WHERE role_name = 'Contractor')
         AND u.is_active = true AND u.is_deleted = false`,
      [contractor_ids]
    );
    if (contractorsRes.rows.length === 0) {
      return NextResponse.json({ error: "None of the selected contractors could be found" }, { status: 400 });
    }

    const templateRes = await query(
      `SELECT subject, body FROM tender_invitation_template ORDER BY id ASC LIMIT 1`
    );
    const template = templateRes.rows[0] || {
      subject: "You've been invited to submit a tender",
      body: 'Dear {contractor_name},\n\nYou have been invited to express interest in "{tender_name}".',
    };

    const invited: { contractor_id: number; interest_id: number }[] = [];
    for (const contractor of contractorsRes.rows) {
      const token = crypto.randomBytes(32).toString("hex");
      const upsertRes = await query(
        `INSERT INTO tender_interest (tender_id, contractor_id, invited_by, invited_at, invite_token, invite_token_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), $4, NOW() + INTERVAL '${INVITE_TOKEN_TTL_DAYS} days', NOW(), NOW())
         ON CONFLICT (tender_id, contractor_id) DO UPDATE
           SET invited_by = EXCLUDED.invited_by,
               invited_at = EXCLUDED.invited_at,
               invite_token = EXCLUDED.invite_token,
               invite_token_expires_at = EXCLUDED.invite_token_expires_at,
               invite_token_used_at = NULL,
               declined_at = NULL,
               updated_at = NOW()
         RETURNING interest_id`,
        [tenderId, contractor.user_id, user.id, token]
      );
      const interestId = upsertRes.rows[0].interest_id;
      invited.push({ contractor_id: contractor.user_id, interest_id: interestId });

      await logInsert(
        "tender_interest",
        interestId,
        { tender_id: tenderId, contractor_id: contractor.user_id },
        user.id,
        request,
        { action: "invite_contractor" }
      );

      void sendTrackedEmail(
        "tender_invitation",
        { userId: contractor.user_id, email: contractor.email },
        tenderId,
        () =>
          sendInvitationEmail({
            to: contractor.email,
            contractorName: contractor.full_name,
            tenderName: tender.tender_name,
            token,
            subject: template.subject,
            body: template.body,
          }),
        "announcements"
      ).catch((err) => console.error(`Invitation email dispatch failed for tender ${tenderId}:`, err));
    }

    void notifyUsers(
      invited.map((i) => i.contractor_id),
      `You've been invited: ${tender.tender_name}`,
      "You have been invited to express interest in this tender. Check your email or log in to respond.",
      `/tenders/${tenderId}`
    ).catch((err) => console.error(`Invitation notification failed for tender ${tenderId}:`, err));

    return NextResponse.json({ success: true, invitedCount: invited.length });
  } catch (error) {
    console.error("Tender invite POST error:", error);
    return NextResponse.json({ error: "Unable to send invitations. Please try again." }, { status: 500 });
  }
}
