// app/api/messages/conversations/[id]/read/route.ts
// Marks a conversation as read (up to now) for the calling participant.
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

  await query(
    `UPDATE conversation_participant SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, user.id]
  );

  return NextResponse.json({ success: true }, { headers: corsHeaders });
}
