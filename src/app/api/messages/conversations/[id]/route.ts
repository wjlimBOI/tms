// app/api/messages/conversations/[id]/route.ts
// Conversation metadata (title, participants) for the thread header.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { canAccessConversation } from "@/lib/permissions";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

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

  const conversationRes = await query(
    `SELECT conversation_id, is_group, title, created_by, created_at, updated_at FROM conversation WHERE conversation_id = $1`,
    [conversationId]
  );
  if (conversationRes.rows.length === 0) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404, headers: corsHeaders });
  }
  const conversation = conversationRes.rows[0];

  const participantsRes = await query(
    `SELECT u.user_id, u.username, u.display_name, up.full_name
     FROM conversation_participant cp
     JOIN users u ON u.user_id = cp.user_id
     LEFT JOIN user_profile up ON up.user_id = u.user_id
     WHERE cp.conversation_id = $1`,
    [conversationId]
  );
  const participants = participantsRes.rows;
  const others = participants.filter((p: { user_id: number }) => p.user_id !== user.id);
  const displayTitle = conversation.is_group
    ? conversation.title || others.map((p: any) => p.full_name || p.display_name || p.username).join(", ") || "Group chat"
    : others[0]?.full_name || others[0]?.display_name || others[0]?.username || "Conversation";

  return NextResponse.json(
    { data: { ...conversation, title: displayTitle, participants } },
    { headers: corsHeaders }
  );
}
