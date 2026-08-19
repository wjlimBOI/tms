// app/api/messages/conversations/[id]/messages/route.ts
// List/send messages within one conversation. Membership-gated only — no
// Admin/Developer bypass (see canAccessConversation in src/lib/permissions.ts).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { canAccessConversation } from "@/lib/permissions";
import { validateBody, directMessageSchema } from "@/lib/validation";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { notifyUsers } from "@/lib/notifications";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- GET — list messages in a conversation ----------
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
  const conversationId = parseInt(id);
  if (isNaN(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400, headers: corsHeaders });
  }

  const allowed = await canAccessConversation(conversationId, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "You do not have access to this conversation" }, { status: 403, headers: corsHeaders });
  }

  const searchParams = request.nextUrl.searchParams;
  const pagination = parsePagination(searchParams);
  const baseFrom = `
    FROM message m
    JOIN users u ON u.user_id = m.sender_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    WHERE m.conversation_id = $1
  `;

  if (!pagination) {
    const result = await query(
      `SELECT m.message_id, m.conversation_id, m.sender_id, u.username AS sender_name, COALESCE(up.full_name, u.display_name) AS sender_display_name,
              m.body, m.created_at
       ${baseFrom}
       ORDER BY m.created_at ASC`,
      [conversationId]
    );
    return NextResponse.json({ data: result.rows }, { headers: corsHeaders });
  }

  const countRes = await query(`SELECT COUNT(*) AS total ${baseFrom}`, [conversationId]);
  const total = parseInt(countRes.rows[0].total, 10);
  const result = await query(
    `SELECT m.message_id, m.conversation_id, m.sender_id, u.username AS sender_name, COALESCE(up.full_name, u.display_name) AS sender_display_name,
            m.body, m.created_at
     ${baseFrom}
     ORDER BY m.created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, pagination.limit, pagination.offset]
  );

  return NextResponse.json(
    { data: result.rows, ...paginationMeta(pagination, total) },
    { headers: corsHeaders }
  );
}

// ---------- POST — send a message ----------
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
  const conversationId = parseInt(id);
  if (isNaN(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400, headers: corsHeaders });
  }

  const allowed = await canAccessConversation(conversationId, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "You do not have access to this conversation" }, { status: 403, headers: corsHeaders });
  }

  const validation = await validateBody(request, directMessageSchema);
  if (!validation.success) {
    const response = validation.response;
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  const { body } = validation.data;

  const inserted = await query(
    `INSERT INTO message (conversation_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING message_id, conversation_id, sender_id, body, created_at`,
    [conversationId, user.id, body]
  );
  await query(`UPDATE conversation SET updated_at = now() WHERE conversation_id = $1`, [conversationId]);

  const otherParticipantsRes = await query(
    `SELECT user_id FROM conversation_participant WHERE conversation_id = $1 AND user_id != $2`,
    [conversationId, user.id]
  );
  const otherUserIds = otherParticipantsRes.rows.map((r: { user_id: number }) => r.user_id);

  void notifyUsers(
    otherUserIds,
    `New message from ${user.name || user.email}`,
    body.slice(0, 200),
    `/messages?conversation=${conversationId}`
  ).catch((err) => console.error(`Message notification failed for conversation ${conversationId}:`, err));

  return NextResponse.json({ success: true, message: inserted.rows[0] }, { status: 201, headers: corsHeaders });
}
