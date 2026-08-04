import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tenderIdParam = searchParams.get("tender_id");
  const contractorIdParam = searchParams.get("contractor_id");

  if (!tenderIdParam || !contractorIdParam) {
    return NextResponse.json(
      { error: "Missing tender_id or contractor_id" },
      { status: 400 }
    );
  }

  const tenderId = parseInt(tenderIdParam, 10);
  const contractorId = parseInt(contractorIdParam, 10);

  if (isNaN(tenderId) || isNaN(contractorId)) {
    return NextResponse.json(
      { error: "Invalid tender_id or contractor_id (must be numbers)" },
      { status: 400 }
    );
  }

  // Contractors (role 4) may only see their own versions
  if (session.user.role_id === 4 && contractorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await query(
      `SELECT submission_id, round_no, version_name, status, updated_at
       FROM tender_submission
       WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
       ORDER BY round_no DESC`,
      [tenderId, contractorId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching versions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}