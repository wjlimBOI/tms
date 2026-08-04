import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";

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
  const userRole = (session.user as any).role_id;
  const isContractor = userRole === 13;
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
             SELECT status_id FROM tender_status WHERE status_code IN ('Cancelled', 'Awarded')
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
           SELECT status_id FROM tender_status WHERE status_code IN ('Cancelled', 'Awarded')
         )`
    );
    realActiveTendersCount = parseInt(activeTendersQuery.rows[0].count);
  } catch (err) {
    console.error("Failed to fetch active tenders count:", err);
  }

  // Awarded projects – mock data
  const awardedProjects = [
    { outlet: "YN - JP", nature: "Refurbishment", completionEnd: "2026-04-20", contractor: "Novelty Project Services PL", contractValue: 875000, documentUrl: "/documents/YN-Hair-Care-JP.pdf" },
    { outlet: "NYSS - JN", nature: "Refurbishment", completionEnd: "2026-04-20", contractor: "TECK GUANG INTERIOR DESIGN PL", contractValue: 398131, documentUrl: "/documents/NYSS-JN-Renovation.pdf" },
    { outlet: "LWM - LX", nature: "Refurbishment", completionEnd: "2026-05-04", contractor: "D'CO Solutions", contractValue: 60000, documentUrl: "/documents/LX-Renovation-2026.pdf" },
    { outlet: "LWM - NC", nature: "Refurbishment + Conversion", completionEnd: "2025-03-14", contractor: "KD2 Interior Pte Ltd", contractValue: 1250000, documentUrl: null },
    { outlet: "LWM - TP", nature: "Refurbishment", completionEnd: "2025-05-26", contractor: "Novelty Project Services PL", contractValue: 875000, documentUrl: null },
    { outlet: "LWM - WM", nature: "Refurbishment + Conversion", completionEnd: "2025-04-30", contractor: "TECK GUANG INTERIOR DESIGN PL", contractValue: 624000, documentUrl: null },
    { outlet: "SKR - AJ", nature: "Refurbishment", completionEnd: "2025-07-30", contractor: "D'CO Solutions", contractValue: 60000, documentUrl: null },
    { outlet: "Dorra - J8", nature: "New Reno", completionEnd: "2025-08-16", contractor: "KD2 Interior Pte Ltd", contractValue: 450000, documentUrl: null },
    { outlet: "VP - J8", nature: "New Reno", completionEnd: "2025-08-16", contractor: "Novelty Project Services PL", contractValue: 520000, documentUrl: null },
    { outlet: "YN - PS", nature: "Refurbishment", completionEnd: "2025-08-11", contractor: "TECK GUANG INTERIOR DESIGN PL", contractValue: 380000, documentUrl: null },
    { outlet: "SKR - AB", nature: "New Reno", completionEnd: "2025-09-26", contractor: "D'CO Solutions", contractValue: 290000, documentUrl: null },
    { outlet: "VP - Sun Plaza", nature: "Reinstatement", completionEnd: "2025-09-21", contractor: "KD2 Interior Pte Ltd", contractValue: 215000, documentUrl: null },
    { outlet: "JS - JA", nature: "Refurbishment", completionEnd: "2025-09-15", contractor: "Novelty Project Services PL", contractValue: 164000, documentUrl: null },
  ];

  const completed2026Count = awardedProjects.filter(p => p.completionEnd.startsWith("2026")).length;
  const sortedAwarded = [...awardedProjects].sort((a, b) => new Date(b.completionEnd).getTime() - new Date(a.completionEnd).getTime());

  const mockAwardedTenders = sortedAwarded.map((p, idx) => ({
    tender_id: 200 + idx,
    tender_name: `${p.outlet} – ${p.nature}`,
    contractor_name: p.contractor,
    contract_value: p.contractValue,
    awarded_date: p.completionEnd,
    document_url: p.documentUrl || null,
  }));

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

  // DLP summary
  const upcomingDlpList = awardedProjects
    .map(p => {
      const dueDate = new Date(p.completionEnd);
      dueDate.setFullYear(dueDate.getFullYear() + 1);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return { outlet: p.outlet, dueDate: dueDateStr, daysLeft: Math.max(0, daysLeft) };
    })
    .filter(item => item.daysLeft > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 15);

  const mockDlpSummary = {
    activeCases: upcomingDlpList.length,
    nextDueDate: upcomingDlpList[0]?.dueDate || null,
    upcomingList: upcomingDlpList,
  };

  return NextResponse.json(
    {
      userDisplayName,
      totalCompletedProjects2026: completed2026Count,
      activeTenders: realActiveTendersCount,
      dlpSummary: mockDlpSummary,
      awardedTenders: mockAwardedTenders,
      notifications: mockNotifications,
    },
    { headers: corsHeaders }
  );
}