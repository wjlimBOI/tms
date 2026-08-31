// app/api/tenders/[id]/invite/candidates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { canAccessTenderMessages } from "@/lib/permissions";

// ---------- GET — list registered contractors available to invite to this tender ----------
// Excludes contractors who already have a tender_interest row (invited,
// pending, accepted, or declined) so the picker only shows real candidates.
export async function GET(
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
      return NextResponse.json({ error: "You do not have access to this tender" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const result = await query(
      `SELECT u.user_id, u.email, COALESCE(up.full_name, u.display_name, u.username) AS full_name, up.company_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN user_profile up ON up.user_id = u.user_id
       WHERE ur.role_id = (SELECT role_id FROM roles WHERE role_name = 'Contractor')
         AND u.is_active = true AND u.is_deleted = false
         AND NOT EXISTS (
           SELECT 1 FROM tender_interest ti WHERE ti.tender_id = $1 AND ti.contractor_id = u.user_id
         )
         AND ($2 = '' OR up.full_name ILIKE '%' || $2 || '%' OR up.company_name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
       ORDER BY COALESCE(up.full_name, u.display_name, u.username) ASC
       LIMIT 100`,
      [tenderId, search]
    );

    return NextResponse.json({ candidates: result.rows });
  } catch (error) {
    console.error("Invite candidates GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
