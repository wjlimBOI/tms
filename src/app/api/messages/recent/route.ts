// app/api/messages/recent/route.ts
// Cross-tender "recent activity" feed powering the real Navbar inbox
// dropdown. Not a mailbox with read/unread state — genuinely-new-item
// signaling is handled by the existing notifications bell, which already
// fires for every message send (including announcements). This is purely
// "what's been happening across threads I have access to."
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS, isSuperViewer } from "@/lib/roles";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const user = session.user as any;
  const roleIds = (user.roleIds || []) as number[];
  const isContractor = roleIds.includes(ROLE_IDS.CONTRACTOR);
  const isAdmin = isSuperViewer(roleIds);

  const selectBase = `
    SELECT tm.tender_id, t.tender_name, tm.sender_id, COALESCE(sup.full_name, su.display_name, su.username) AS sender_name,
           tm.is_announcement, LEFT(tm.body, 160) AS preview, tm.created_at
    FROM tender_message tm
    JOIN tender t ON t.tender_id = tm.tender_id
    JOIN users su ON su.user_id = tm.sender_id
    LEFT JOIN user_profile sup ON sup.user_id = su.user_id
  `;

  let result;
  if (isContractor) {
    result = await query(
      `${selectBase} WHERE tm.contractor_id = $1 ORDER BY tm.created_at DESC LIMIT 20`,
      [user.id]
    );
  } else if (isAdmin) {
    result = await query(`${selectBase} ORDER BY tm.created_at DESC LIMIT 20`);
  } else {
    // Non-admin staff: scope to tenders they created or are the assigned PM
    // for — the same two-way check canAccessTenderMessages uses for a
    // single tender, applied here to filter the feed across all tenders.
    const tenderIdsRes = await query(
      `SELECT tender_id FROM tender WHERE is_deleted = false AND (created_by = $1 OR project_manager_email = $2)`,
      [user.id, user.email || null]
    );
    const tenderIds = tenderIdsRes.rows.map((r: { tender_id: number }) => r.tender_id);
    if (tenderIds.length === 0) {
      return NextResponse.json({ data: [] }, { headers: corsHeaders });
    }
    result = await query(
      `${selectBase} WHERE tm.tender_id = ANY($1) ORDER BY tm.created_at DESC LIMIT 20`,
      [tenderIds]
    );
  }

  const data = result.rows.map((r: any) => ({
    tender_id: r.tender_id,
    tender_name: r.tender_name,
    sender_name: r.sender_name,
    is_announcement: r.is_announcement,
    preview: r.preview,
    created_at: r.created_at,
    link: `/tenders/${r.tender_id}#messages`,
  }));

  return NextResponse.json({ data }, { headers: corsHeaders });
}
