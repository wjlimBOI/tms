// app/api/tenders/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS } from "@/lib/roles";
import { canAccessTenderMessages } from "@/lib/permissions";
import { validateBody, tenderMessageSchema } from "@/lib/validation";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { notifyUsers, sendTrackedEmail } from "@/lib/notifications";
import { sendAnnouncementEmail } from "@/lib/email";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- GET — list one contractor's private thread on a tender ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const user = session.user as any;
  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400, headers: corsHeaders });
  }

  const searchParams = request.nextUrl.searchParams;
  const isContractor = ((user.roleIds || []) as number[]).includes(ROLE_IDS.CONTRACTOR);
  const contractorId = isContractor
    ? user.id
    : parseInt(searchParams.get("contractor_id") || "");

  if (!isContractor && isNaN(contractorId)) {
    return NextResponse.json(
      { error: "contractor_id is required to view a contractor's thread" },
      { status: 400, headers: corsHeaders }
    );
  }

  const access = await canAccessTenderMessages(tenderId, user.id, user.email, user.roleIds || [], contractorId);
  if (!access.allowed) {
    return NextResponse.json({ error: "You do not have access to this thread" }, { status: 403, headers: corsHeaders });
  }

  const pagination = parsePagination(searchParams);
  const baseFrom = `
    FROM tender_message tm
    JOIN users u ON u.user_id = tm.sender_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    WHERE tm.tender_id = $1 AND tm.contractor_id = $2
  `;

  if (!pagination) {
    const result = await query(
      `SELECT tm.message_id, tm.tender_id, tm.contractor_id, tm.sender_id, COALESCE(up.full_name, u.display_name, u.username) AS sender_name,
              tm.is_announcement, tm.body, tm.created_at
       ${baseFrom}
       ORDER BY tm.created_at ASC`,
      [tenderId, contractorId]
    );
    return NextResponse.json({ data: result.rows, isStaff: access.isStaff }, { headers: corsHeaders });
  }

  const countRes = await query(`SELECT COUNT(*) AS total ${baseFrom}`, [tenderId, contractorId]);
  const total = parseInt(countRes.rows[0].total, 10);

  const result = await query(
    `SELECT tm.message_id, tm.tender_id, tm.contractor_id, tm.sender_id, COALESCE(up.full_name, u.display_name, u.username) AS sender_name,
            tm.is_announcement, tm.body, tm.created_at
     ${baseFrom}
     ORDER BY tm.created_at ASC
     LIMIT $3 OFFSET $4`,
    [tenderId, contractorId, pagination.limit, pagination.offset]
  );

  return NextResponse.json(
    { data: result.rows, isStaff: access.isStaff, ...paginationMeta(pagination, total) },
    { headers: corsHeaders }
  );
}

// ---------- POST — send a message (reply, question, or staff announcement) ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const user = session.user as any;
  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400, headers: corsHeaders });
  }

  const validation = await validateBody(request, tenderMessageSchema);
  if (!validation.success) {
    const response = validation.response;
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
  const { body, ...rest } = validation.data;
  const isContractorCaller = ((user.roleIds || []) as number[]).includes(ROLE_IDS.CONTRACTOR);

  const tenderRes = await query(
    `SELECT tender_id, tender_name, created_by, project_manager_email
     FROM tender WHERE tender_id = $1 AND is_deleted = false`,
    [tenderId]
  );
  if (tenderRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: corsHeaders });
  }
  const tender = tenderRes.rows[0];

  // ---------- Contractor posting to their own thread ----------
  if (isContractorCaller) {
    const access = await canAccessTenderMessages(tenderId, user.id, user.email, user.roleIds || [], user.id);
    if (!access.allowed) {
      return NextResponse.json({ error: "You do not have access to this thread" }, { status: 403, headers: corsHeaders });
    }

    const inserted = await query(
      `INSERT INTO tender_message (tender_id, contractor_id, sender_id, is_announcement, body)
       VALUES ($1, $2, $2, false, $3)
       RETURNING message_id, tender_id, contractor_id, sender_id, is_announcement, body, created_at`,
      [tenderId, user.id, body]
    );

    void notifyStaffOfMessage(tenderId, tender, user.id).catch((err) =>
      console.error(`Message notification failed for tender ${tenderId}:`, err)
    );

    return NextResponse.json({ success: true, message: inserted.rows[0] }, { status: 201, headers: corsHeaders });
  }

  // ---------- Staff posting (reply to one contractor, or announcement to all) ----------
  const access = await canAccessTenderMessages(tenderId, user.id, user.email, user.roleIds || []);
  if (!access.allowed || !access.isStaff) {
    return NextResponse.json({ error: "You do not have access to this tender's messages" }, { status: 403, headers: corsHeaders });
  }

  if (rest.is_announcement === true) {
    const contractorsRes = await query(
      `SELECT DISTINCT ac.contractor_id, u.email, COALESCE(up.full_name, u.display_name, u.username) AS username
       FROM (
         SELECT contractor_id FROM tender_submission WHERE tender_id = $1 AND is_deleted = false
         UNION SELECT contractor_id FROM tender_interest WHERE tender_id = $1
         UNION SELECT contractor_id FROM tender_contractor WHERE tender_id = $1
         UNION SELECT winning_contractor_id AS contractor_id FROM tender_award WHERE tender_id = $1
       ) AS ac
       JOIN users u ON u.user_id = ac.contractor_id
       LEFT JOIN user_profile up ON up.user_id = u.user_id`,
      [tenderId]
    );
    const contractorIds: number[] = contractorsRes.rows.map((r: { contractor_id: number }) => r.contractor_id);

    if (contractorIds.length === 0) {
      return NextResponse.json({ error: "No contractors are associated with this tender yet" }, { status: 400, headers: corsHeaders });
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const inserted: any[] = [];
      for (const contractorId of contractorIds) {
        const res = await client.query(
          `INSERT INTO tender_message (tender_id, contractor_id, sender_id, is_announcement, body)
           VALUES ($1, $2, $3, true, $4)
           RETURNING message_id, tender_id, contractor_id, sender_id, is_announcement, body, created_at`,
          [tenderId, contractorId, user.id, body]
        );
        inserted.push(res.rows[0]);
      }
      await client.query("COMMIT");

      void notifyUsers(
        contractorIds,
        `Announcement: ${tender.tender_name}`,
        body.slice(0, 200),
        `/tenders/${tenderId}#messages`
      ).catch((err) => console.error(`Announcement notification failed for tender ${tenderId}:`, err));

      void (async () => {
        for (const c of contractorsRes.rows) {
          await sendTrackedEmail(
            "announcement",
            { userId: c.contractor_id, email: c.email },
            tenderId,
            (ccEmails) => sendAnnouncementEmail({ to: c.email, recipientName: c.username, tenderName: tender.tender_name, tenderId, body, cc: ccEmails }),
            "announcements"
          );
        }
      })().catch((err) => console.error(`Announcement email dispatch failed for tender ${tenderId}:`, err));

      return NextResponse.json(
        { success: true, messages: inserted, notifiedCount: contractorIds.length },
        { status: 201, headers: corsHeaders }
      );
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Announcement send error:", err);
      return NextResponse.json({ error: "Unable to send the announcement. Please try again." }, { status: 500, headers: corsHeaders });
    } finally {
      client.release();
    }
  }

  // Regular staff reply to one contractor's thread
  const contractorId = rest.contractor_id;
  if (!contractorId) {
    return NextResponse.json(
      { error: "contractor_id is required when replying to a contractor" },
      { status: 400, headers: corsHeaders }
    );
  }

  const inserted = await query(
    `INSERT INTO tender_message (tender_id, contractor_id, sender_id, is_announcement, body)
     VALUES ($1, $2, $3, false, $4)
     RETURNING message_id, tender_id, contractor_id, sender_id, is_announcement, body, created_at`,
    [tenderId, contractorId, user.id, body]
  );

  void notifyUsers(
    [contractorId],
    `New reply on ${tender.tender_name}`,
    body.slice(0, 200),
    `/tenders/${tenderId}#messages`
  ).catch((err) => console.error(`Reply notification failed for tender ${tenderId}:`, err));

  return NextResponse.json({ success: true, message: inserted.rows[0] }, { status: 201, headers: corsHeaders });
}

// Notifies every Admin, the tender's creator, and the matching PM (if their
// email resolves to a real user account) that a contractor posted a message.
// Best-effort — a lookup miss (e.g. no user matches project_manager_email)
// is silently skipped rather than failing the request.
async function notifyStaffOfMessage(
  tenderId: number,
  tender: { tender_name: string; created_by: number; project_manager_email: string | null },
  contractorId: number
): Promise<void> {
  const recipientIds = new Set<number>();

  const adminRes = await query(`SELECT user_id FROM users WHERE role_id = $1 AND is_active = true`, [ROLE_IDS.ADMIN]);
  adminRes.rows.forEach((r: { user_id: number }) => recipientIds.add(r.user_id));

  if (tender.created_by) recipientIds.add(tender.created_by);

  if (tender.project_manager_email) {
    const pmUserRes = await query(`SELECT user_id FROM users WHERE email = $1`, [tender.project_manager_email]);
    pmUserRes.rows.forEach((r: { user_id: number }) => recipientIds.add(r.user_id));
  }

  await notifyUsers(
    Array.from(recipientIds),
    `New message on ${tender.tender_name}`,
    `A contractor asked a question about this tender.`,
    `/tenders/${tenderId}#messages`
  );
}
