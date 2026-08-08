// app/api/tenders/[id]/messages/contractors/route.ts
// Staff-only: the list of contractors who have a private message thread on
// this tender (i.e. anyone who could plausibly have asked a question),
// populated from the union of every table that links a contractor to a
// tender. Powers the thread picker in the tender detail page's Messages
// section.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { canAccessTenderMessages } from "@/lib/permissions";

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
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400, headers: corsHeaders });
  }

  const access = await canAccessTenderMessages(tenderId, user.id, user.email, user.roleIds || []);
  if (!access.allowed || !access.isStaff) {
    return NextResponse.json({ error: "Only staff can view the contractor list" }, { status: 403, headers: corsHeaders });
  }

  const result = await query(
    `SELECT u.user_id AS contractor_id, u.username AS contractor_name,
            (SELECT COUNT(*) FROM tender_message tm WHERE tm.tender_id = $1 AND tm.contractor_id = u.user_id) AS message_count,
            (SELECT MAX(tm.created_at) FROM tender_message tm WHERE tm.tender_id = $1 AND tm.contractor_id = u.user_id) AS last_message_at
     FROM users u
     WHERE u.user_id IN (
       SELECT contractor_id FROM tender_submission WHERE tender_id = $1 AND is_deleted = false
       UNION SELECT contractor_id FROM tender_interest WHERE tender_id = $1
       UNION SELECT contractor_id FROM tender_contractor WHERE tender_id = $1
       UNION SELECT winning_contractor_id AS contractor_id FROM tender_award WHERE tender_id = $1
     )
     ORDER BY last_message_at DESC NULLS LAST, contractor_name ASC`,
    [tenderId]
  );

  return NextResponse.json({ data: result.rows }, { headers: corsHeaders });
}
