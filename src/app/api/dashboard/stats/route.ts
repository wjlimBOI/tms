import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS } from "@/lib/roles";
import { getDlpStatus } from "@/lib/dlp";
import { sendDueDlpReminders } from "@/lib/tenderLifecycle";
import type { AwardedTenderItem, DashboardNotification } from "@/types/dashboard";

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

  // Real per-user unread notification count (same query as /api/notifications,
  // which backs the Navbar bell badge) — applies to both contractor and
  // internal-staff branches since both roles receive rows in `notifications`.
  let unreadNotificationsCount = 0;
  try {
    const unreadRes = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    unreadNotificationsCount = parseInt(unreadRes.rows[0].count, 10);
  } catch (err) {
    console.error("Failed to fetch unread notifications count:", err);
  }

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
          unreadNotificationsCount,
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

  // Best-effort, non-blocking — every internal-staff dashboard load
  // opportunistically checks/sends DLP reminders, same lazy no-cron pattern
  // as applyScheduledTenderTransitions().
  void sendDueDlpReminders().catch((err) => console.error("DLP reminder check failed:", err));

  // ========== INTERNAL STAFF: real DB-backed data ==========
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
  let realAwardedTenders: AwardedTenderItem[] = [];
  let awardedThisYearCount = 0;
  const currentYear = new Date().getFullYear();
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
    }));

    const countRes = await query(
      `SELECT COUNT(*) FROM tender_award WHERE EXTRACT(YEAR FROM awarded_date) = $1`,
      [currentYear]
    );
    awardedThisYearCount = parseInt(countRes.rows[0].count);
  } catch (err) {
    console.error("Failed to fetch awarded tenders:", err);
  }

  // ========== Notifications – real data (tender_award + tender_submission) ==========
  // Note: these are derived activity items, not rows from the real per-user
  // `notifications` table, so they have no genuine read/unread state. The
  // "Unread Notifications" KPI is sourced separately from unreadNotificationsCount.
  const awardedNotifications: DashboardNotification[] = realAwardedTenders.map((r) => ({
    id: `awarded-${r.tender_id}`,
    type: "awarded",
    message: `${r.contractor_name} – awarded for ${r.tender_name}`,
    created_at: r.awarded_date,
    link: `/admin/tenders/${r.tender_id}`,
    tender_name: r.tender_name,
    contractor_name: r.contractor_name,
    contract_value: r.contract_value,
  }));

  // Bidder identity per tender is Admin-only, matching admin/bqs/page.tsx's
  // own gate on this same data — any other internal role would otherwise see
  // who's bidding on live, pre-award tenders via this endpoint.
  let submittedNotifications: DashboardNotification[] = [];
  if (userRoleIds.includes(ROLE_IDS.ADMIN)) {
    try {
      const submittedRes = await query(
        `SELECT s.submission_id, s.tender_id, t.tender_name, s.updated_at,
                COALESCE(up.company_name, u.username) AS contractor_name
         FROM tender_submission s
         JOIN tender t ON s.tender_id = t.tender_id
         JOIN users u ON s.contractor_id = u.user_id
         LEFT JOIN user_profile up ON up.user_id = u.user_id
         WHERE s.is_deleted = false
         ORDER BY s.updated_at DESC
         LIMIT 15`
      );
      submittedNotifications = submittedRes.rows.map((r) => ({
        id: `submitted-${r.submission_id}`,
        type: "submitted",
        message: `${r.contractor_name} submitted a BQ for ${r.tender_name}`,
        created_at: r.updated_at,
        link: `/admin/bq-by-tender?tender=${r.tender_id}`,
        tender_name: r.tender_name,
        contractor_name: r.contractor_name,
      }));
    } catch (err) {
      console.error("Failed to fetch submission notifications:", err);
    }
  }

  const notifications = [...awardedNotifications, ...submittedNotifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15);

  // ========== DLP summary – real data (tender.handover_date) ==========
  // Overdue DLPs are surfaced explicitly, not silently dropped — a DLP past
  // its expiry is exactly the case ops most needs to see.
  let realDlpSummary: {
    activeCases: number;
    overdueCases: number;
    nextDueDate: string | null;
    upcomingList: any[];
    overdueList: any[];
  } = { activeCases: 0, overdueCases: 0, nextDueDate: null, upcomingList: [], overdueList: [] };
  try {
    const dlpRes = await query(
      `SELECT t.tender_id, b.branch_name AS outlet,
              (t.handover_date + (COALESCE(t.defect_liability_months, 12) || ' months')::interval)::date AS due_date
       FROM tender t
       JOIN branch b ON t.branch_id = b.branch_id
       WHERE t.is_deleted = false AND t.stage = 3 AND t.handover_date IS NOT NULL`
    );
    const allDlpItems = dlpRes.rows.map((r) => {
      const { status, daysLeft, daysOverdue } = getDlpStatus(new Date(r.due_date));
      return { outlet: r.outlet, dueDate: r.due_date, status, daysLeft, daysOverdue };
    });
    const overdueList = allDlpItems
      .filter((i) => i.status === "overdue")
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    const upcomingList = allDlpItems
      .filter((i) => i.status !== "overdue")
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 15);

    realDlpSummary = {
      activeCases: allDlpItems.length,
      overdueCases: overdueList.length,
      nextDueDate: upcomingList[0]?.dueDate || null,
      upcomingList,
      overdueList: overdueList.slice(0, 15),
    };
  } catch (err) {
    console.error("Failed to fetch DLP summary:", err);
  }

  return NextResponse.json(
    {
      userDisplayName,
      totalCompletedProjectsThisYear: awardedThisYearCount,
      activeTenders: realActiveTendersCount,
      dlpSummary: realDlpSummary,
      awardedTenders: realAwardedTenders,
      notifications,
      unreadNotificationsCount,
    },
    { headers: corsHeaders }
  );
}