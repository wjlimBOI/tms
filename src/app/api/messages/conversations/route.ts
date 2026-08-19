// app/api/messages/conversations/route.ts
// List the caller's conversations (1:1 + group), and start new ones.
// Fully independent of tender_message/TenderMessagesPanel — see
// prisma/schema.prisma's conversation/conversation_participant/message
// models and docs/pending-migrations.md's 2026-08-19 entry.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { validateBody, createConversationSchema } from "@/lib/validation";
import { parsePagination, paginationMeta } from "@/lib/pagination";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- GET — list the caller's conversations ----------
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const user = session.user as any;
  const searchParams = request.nextUrl.searchParams;
  const pagination = parsePagination(searchParams);

  const baseFrom = `
    FROM conversation_participant my_cp
    JOIN conversation c ON c.conversation_id = my_cp.conversation_id
    WHERE my_cp.user_id = $1
  `;

  const listQuery = `
    SELECT c.conversation_id, c.is_group, c.title, c.created_at, c.updated_at,
           my_cp.last_read_at
    ${baseFrom}
    ORDER BY c.updated_at DESC
    ${pagination ? "LIMIT $2 OFFSET $3" : ""}
  `;
  const listParams = pagination ? [user.id, pagination.limit, pagination.offset] : [user.id];
  const conversationsRes = await query(listQuery, listParams);
  const conversationIds = conversationsRes.rows.map((r: { conversation_id: number }) => r.conversation_id);

  if (conversationIds.length === 0) {
    return NextResponse.json({ data: [], ...(pagination ? paginationMeta(pagination, 0) : {}) }, { headers: corsHeaders });
  }

  const [participantsRes, lastMessagesRes, unreadRes] = await Promise.all([
    query(
      `SELECT cp.conversation_id, u.user_id, u.username, u.display_name, up.full_name
       FROM conversation_participant cp
       JOIN users u ON u.user_id = cp.user_id
       LEFT JOIN user_profile up ON up.user_id = u.user_id
       WHERE cp.conversation_id = ANY($1)`,
      [conversationIds]
    ),
    query(
      `SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.sender_id, COALESCE(up.full_name, u.display_name, u.username) AS sender_name,
              LEFT(m.body, 160) AS preview, m.created_at
       FROM message m
       JOIN users u ON u.user_id = m.sender_id
       LEFT JOIN user_profile up ON up.user_id = u.user_id
       WHERE m.conversation_id = ANY($1)
       ORDER BY m.conversation_id, m.created_at DESC`,
      [conversationIds]
    ),
    query(
      `SELECT m.conversation_id, COUNT(*) AS unread_count
       FROM message m
       JOIN conversation_participant cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $2
       WHERE m.conversation_id = ANY($1) AND m.sender_id != $2
         AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
       GROUP BY m.conversation_id`,
      [conversationIds, user.id]
    ),
  ]);

  const participantsByConversation = new Map<number, { user_id: number; username: string; display_name: string | null; full_name: string | null }[]>();
  for (const row of participantsRes.rows) {
    const list = participantsByConversation.get(row.conversation_id) || [];
    list.push({ user_id: row.user_id, username: row.username, display_name: row.display_name, full_name: row.full_name });
    participantsByConversation.set(row.conversation_id, list);
  }
  const lastMessageByConversation = new Map(lastMessagesRes.rows.map((r: any) => [r.conversation_id, r]));
  const unreadByConversation = new Map(unreadRes.rows.map((r: any) => [r.conversation_id, parseInt(r.unread_count, 10)]));

  const data = conversationsRes.rows.map((c: any) => {
    const participants = (participantsByConversation.get(c.conversation_id) || []).filter((p) => p.user_id !== user.id);
    const displayTitle = c.is_group
      ? c.title || participants.map((p) => p.full_name || p.display_name || p.username).join(", ") || "Group chat"
      : participants[0]?.full_name || participants[0]?.display_name || participants[0]?.username || "Conversation";

    return {
      conversation_id: c.conversation_id,
      is_group: c.is_group,
      title: displayTitle,
      participants,
      last_message: lastMessageByConversation.get(c.conversation_id) || null,
      unread_count: unreadByConversation.get(c.conversation_id) || 0,
      updated_at: c.updated_at,
    };
  });

  return NextResponse.json(
    { data, ...(pagination ? paginationMeta(pagination, data.length) : {}) },
    { headers: corsHeaders }
  );
}

// ---------- POST — start a new conversation (1:1 or group) ----------
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const user = session.user as any;

  const validation = await validateBody(request, createConversationSchema);
  if (!validation.success) {
    const response = validation.response;
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  const { title } = validation.data;

  const otherUserIds = Array.from(new Set(validation.data.participant_user_ids)).filter((id) => id !== user.id);
  if (otherUserIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one other person to message" },
      { status: 400, headers: corsHeaders }
    );
  }

  const usersRes = await query(
    `SELECT user_id FROM users WHERE user_id = ANY($1) AND is_deleted = false`,
    [otherUserIds]
  );
  if (usersRes.rows.length !== otherUserIds.length) {
    return NextResponse.json(
      { error: "One or more selected users could not be found" },
      { status: 400, headers: corsHeaders }
    );
  }

  const isGroup = otherUserIds.length > 1;

  // 1:1 idempotency — reuse an existing exactly-2-participant, non-group
  // conversation between these two users rather than creating a duplicate
  // every time someone clicks "message" on the same person.
  if (!isGroup) {
    const existing = await query(
      `SELECT c.conversation_id
       FROM conversation c
       JOIN conversation_participant cp1 ON cp1.conversation_id = c.conversation_id AND cp1.user_id = $1
       JOIN conversation_participant cp2 ON cp2.conversation_id = c.conversation_id AND cp2.user_id = $2
       WHERE c.is_group = false
         AND (SELECT COUNT(*) FROM conversation_participant WHERE conversation_id = c.conversation_id) = 2
       LIMIT 1`,
      [user.id, otherUserIds[0]]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ conversation_id: existing.rows[0].conversation_id, existing: true }, { headers: corsHeaders });
    }
  }

  const allParticipantIds = [user.id, ...otherUserIds];
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const conversationRes = await client.query(
      `INSERT INTO conversation (is_group, title, created_by) VALUES ($1, $2, $3) RETURNING conversation_id`,
      [isGroup, isGroup ? title || null : null, user.id]
    );
    const conversationId = conversationRes.rows[0].conversation_id;

    const values = allParticipantIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await client.query(
      `INSERT INTO conversation_participant (conversation_id, user_id) VALUES ${values}`,
      [conversationId, ...allParticipantIds]
    );
    await client.query("COMMIT");

    return NextResponse.json({ conversation_id: conversationId, existing: false }, { status: 201, headers: corsHeaders });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Conversation creation error:", err);
    return NextResponse.json({ error: "Unable to start the conversation. Please try again." }, { status: 500, headers: corsHeaders });
  } finally {
    client.release();
  }
}
