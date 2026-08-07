import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS } from "@/lib/roles";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const userId = session.user.id;
  const userRoleIds = (session.user as any).roleIds || [];
  const isContractor = userRoleIds.includes(ROLE_IDS.CONTRACTOR);
  const userDisplayName = session.user.name || session.user.email || "User";

  // ========== CONTRACTOR: real DB ==========
  if (isContractor) {
    try {
      const mySubmissions = await query(
        `SELECT s.submission_id, s.bq_name, s.status, s.updated_at, t.tender_name
         FROM tender_submission s
         JOIN tender t ON s.tender_id = t.tender_id
         WHERE s.contractor_id = $1 AND s.is_deleted = false
         ORDER BY s.updated_at DESC
         LIMIT 10`,
        [userId]
      );

      const activeTenders = await query(
        `SELECT t.tender_id, t.tender_name, t.submission_end, t.estimated_budget,
                EXTRACT(DAY FROM (t.submission_end - NOW())) as days_left
         FROM tender t
         WHERE t.is_deleted = false
           AND t.submission_end > NOW()
           AND t.status_id NOT IN (
             SELECT status_id FROM tender_status WHERE status_code IN ('cancelled', 'awarded')
           )
         ORDER BY t.submission_end ASC`,
        []
      );

      const reminders = activeTenders.rows.map(r => ({
        tender_id: r.tender_id,
        tender_name: r.tender_name,
        submission_end: r.submission_end,
        estimated_budget: r.estimated_budget ? parseFloat(r.estimated_budget) : null,
        days_left: Math.max(0, Math.ceil(parseFloat(r.days_left))),
      }));

      return NextResponse.json(
        {
          userDisplayName,
          mySubmissions: mySubmissions.rows,
          reminders: reminders,
        },
        { headers: corsHeaders }
      );
    } catch (error) {
      console.error("Contractor dashboard error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // ========== INTERNAL STAFF: mock data ==========
  let realActiveTendersCount = 0;
  try {
    const activeTendersQuery = await query(
      `SELECT COUNT(*) FROM tender t
       WHERE t.is_deleted = false
         AND t.submission_end > NOW()
         AND t.status_id NOT IN (
           SELECT status_id FROM tender_status WHERE status_code IN ('cancelled', 'awarded')
         )`
    );
    realActiveTendersCount = parseInt(activeTendersQuery.rows[0].count);
  } catch (err) {
    console.error("Failed to fetch active tenders count:", err);
  }

  // ========== Awarded tenders – real data (tender_award) ==========
  let realAwardedTenders: any[] = [];
  let awarded2026Count = 0;
  try {
    const awardedRes = await query(
      `SELECT ta.tender_id, t.tender_name,
              COALESCE(up.company_name, u.username) AS contractor_name,
              ta.contract_value, ta.awarded_date
       FROM tender_award ta
       JOIN tender t ON ta.tender_id = t.tender_id
       JOIN users u ON ta.winning_contractor_id = u.user_id
       LEFT JOIN user_profile up ON up.user_id = u.user_id
       WHERE t.is_deleted = false
       ORDER BY ta.awarded_date DESC
       LIMIT 15`
    );
    realAwardedTenders = awardedRes.rows.map((r) => ({
      tender_id: r.tender_id,
      tender_name: r.tender_name,
      contractor_name: r.contractor_name,
      contract_value: r.contract_value ? parseFloat(r.contract_value) : 0,
      awarded_date: r.awarded_date,
      document_url: null,
    }));

    const countRes = await query(
      `SELECT COUNT(*) FROM tender_award WHERE EXTRACT(YEAR FROM awarded_date) = 2026`
    );
    awarded2026Count = parseInt(countRes.rows[0].count);
  } catch (err) {
    console.error("Failed to fetch awarded tenders:", err);
  }

  // Notifications mock
  const mockNotifications = [
    {
      id: 1,
      type: "awarded",
      message: "Novelty Project Services PL – awarded for YN - JP – Refurbishment",
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      read: true,
      link: "/admin/tenders/200",
      tender_name: "YN - JP – Refurbishment",
      contractor_name: "Novelty Project Services PL",
      contract_value: 875000,
    },
    {
      id: 2,
      type: "awarded",
      message: "TECK GUANG INTERIOR DESIGN PL – awarded for NYSS - JN – Refurbishment",
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      read: true,
      link: "/admin/tenders/201",
      tender_name: "NYSS - JN – Refurbishment",
      contractor_name: "TECK GUANG INTERIOR DESIGN PL",
      contract_value: 398131,
    },
    {
      id: 3,
      type: "awarded",
      message: "D'CO Solutions – awarded for LWM - LX – Refurbishment",
      created_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
      read: true,
      link: "/admin/tenders/202",
      tender_name: "LWM - LX – Refurbishment",
      contractor_name: "D'CO Solutions",
      contract_value: 60000,
    },
    {
      id: 4,
      type: "submitted",
      message: "KD2 Interior Pte Ltd submitted a BQ for LWM - NC – Refurbishment + Conversion",
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      read: true,
      link: "/admin/bq-by-tender?tender=203",
      tender_name: "LWM - NC – Refurbishment + Conversion",
      contractor_name: "KD2 Interior Pte Ltd",
    },
  ];

  // ========== DLP summary – real data (tender.handover_date) ==========
  // Empty until projects have a recorded handover_date — there's no "mark
  // project handed over" feature yet, tracked separately from awarding.
  let realDlpSummary = { activeCases: 0, nextDueDate: null as string | null, upcomingList: [] as any[] };
  try {
    const dlpRes = await query(
      `SELECT t.tender_id, b.branch_name AS outlet,
              (t.handover_date + (COALESCE(t.defect_liability_months, 12) || ' months')::interval)::date AS due_date
       FROM tender t
       JOIN branch b ON t.branch_id = b.branch_id
       WHERE t.is_deleted = false AND t.handover_date IS NOT NULL`
    );
    const upcomingDlpList = dlpRes.rows
      .map((r) => {
        const dueDate = new Date(r.due_date);
        const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return { outlet: r.outlet, dueDate: r.due_date, daysLeft };
      })
      .filter((item) => item.daysLeft > 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 15);

    realDlpSummary = {
      activeCases: upcomingDlpList.length,
      nextDueDate: upcomingDlpList[0]?.dueDate || null,
      upcomingList: upcomingDlpList,
    };
  } catch (err) {
    console.error("Failed to fetch DLP summary:", err);
  }

  return NextResponse.json(
    {
      userDisplayName,
      totalCompletedProjects2026: awarded2026Count,
      activeTenders: realActiveTendersCount,
      dlpSummary: realDlpSummary,
      awardedTenders: realAwardedTenders,
      notifications: mockNotifications,
    },
    { headers: corsHeaders }
  );
}