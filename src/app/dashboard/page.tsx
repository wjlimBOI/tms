"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  getBQStatusStyles,
  getBQStatusLabel,
} from "@/lib/statusColors";

function normalizeBQStatus(rawStatus: string): "draft" | "submitted" {
  const lower = rawStatus?.toLowerCase() || "";
  if (lower === "draft") return "draft";
  if (lower === "submitted") return "submitted";
  return "draft";
}

interface DashboardStats {
  totalCompletedProjects2026?: number;
  activeTenders?: number;
  dlpSummary?: {
    activeCases: number;
    nextDueDate?: string;
    upcomingList?: Array<{ outlet: string; dueDate: string; daysLeft: number }>;
  };
  awardedTenders?: any[];
  notifications?: any[];
  mySubmissions?: {
    submission_id: number;
    bq_name: string;
    status: string;
    updated_at: string;
    tender_name: string;
  }[];
  reminders?: {
    tender_id: number;
    tender_name: string;
    submission_end: string;
    estimated_budget?: number;
    days_left: number;
  }[];
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [showDlpModal, setShowDlpModal] = useState(false);

  const [tenders, setTenders] = useState<any[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);

  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const userRole = (session?.user as any)?.role_id;
  const isContractor = userRole === 13;
  const isAdmin = userRole === 1;

  // ========== CONTRACTORS REDIRECT TO /tenders ==========
  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (isContractor) {
      router.push("/tenders");
      return;
    }
    fetchDashboardData();
    if (isAdmin) {
      fetchTenders();
      fetchCalendarEvents();
    }
  }, [session, status, router, isContractor, isAdmin]);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const data = await res.json();
      if (data.reminders) {
        data.reminders = data.reminders.map((r: any) => ({
          ...r,
          days_left: Math.max(0, Math.ceil((new Date(r.submission_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
        }));
      }
      setStats(data);
    } catch (err) {
      console.error(err);
      setError("Could not load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const fetchTenders = async () => {
    try {
      const res = await fetch("/api/tenders?limit=100");
      if (!res.ok) throw new Error("Failed to fetch tenders");
      const data = await res.json();
      setTenders(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTendersLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    try {
      const now = new Date();
      const start = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
      const end = format(new Date(now.getFullYear(), now.getMonth() + 2, 0), "yyyy-MM-dd");
      const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`);
      if (!res.ok) throw new Error("Failed to fetch calendar events");
      const data = await res.json();
      const nowStr = format(now, "yyyy-MM-dd");
      const upcoming = data
        .filter((e: any) => e.start_date >= nowStr)
        .sort((a: any, b: any) => (a.start_date < b.start_date ? -1 : 1))
        .slice(0, 6);
      setUpcomingEvents(upcoming);
    } catch (err) {
      console.error("Error fetching calendar events:", err);
    } finally {
      setEventsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const getUrgencyColor = (daysLeft: number) => {
    if (daysLeft <= 2) return "text-rose-700 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30";
    if (daysLeft <= 5) return "text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30";
    return "text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30";
  };

  const getDaysLeft = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 0;
    const diff = differenceInDays(date, new Date());
    return diff;
  };

  const activeTendersList = isAdmin
    ? tenders.filter((t) => t.status_label !== "Closed" && t.status_label !== "Cancelled")
    : [];

  const metrics = {
    totalCompleted: stats?.totalCompletedProjects2026 ?? 0,
    activeTendersCount: stats?.activeTenders ?? 0,
    dlpActive: stats?.dlpSummary?.activeCases ?? 0,
    pendingNotifications: stats?.notifications?.filter((n: any) => !n.read).length ?? 0,
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-rose-600 dark:text-rose-400 text-center">{error}</div>
      </div>
    );
  }

  if (!session) return null;

  const userName = session.user?.name || "User";

  if (isContractor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Redirecting to tenders...</p>
        </div>
      </div>
    );
  }

  // ========== INTERNAL STAFF DASHBOARD ==========
  const openNotificationModal = (notif: any) => setSelectedNotification(notif);
  const closeNotificationModal = () => setSelectedNotification(null);

  return (
    <>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-[1920px] mx-auto">
          {/* Header – unchanged */}
          <div className="mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Welcome back, {userName}
            </h1>
          </div>

          {/* ===== TIER 1: KEY METRICS – unchanged ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed 2026</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.totalCompleted}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Tenders</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics.activeTendersCount}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">DLP Active</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.dlpActive}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unread Notifications</p>
              <p className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">{metrics.pendingNotifications}</p>
            </div>
          </div>

          {/* ===== TIER 2: PRIMARY TASKS ===== */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-4 sm:mb-6">
            {/* ===== ACTIVE TENDERS – Brutalist header only ===== */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Active Tenders
                </h2>
                <Link href="/tenders" className="text-[10px] sm:text-xs text-cyan-600 dark:text-cyan-400 hover:underline">View all →</Link>
              </div>
              <div className="flex-1 p-3 sm:p-4 overflow-auto max-h-[220px] sm:max-h-[280px]">
                {tendersLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">Loading...</div>
                ) : activeTendersList.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No active tenders</div>
                ) : (
                  <div className="space-y-3">
                    {activeTendersList.slice(0, 5).map((tender) => {
                      const endDate = tender.submission_end || tender.closing_date;
                      const daysLeft = getDaysLeft(endDate);
                      const isPast = daysLeft < 0;

                      const renoStart = tender.renovation_start || tender.renovation_start_date;
                      const renoEnd = tender.renovation_end || tender.renovation_end_date;
                      const isValidStart = renoStart && !isNaN(new Date(renoStart).getTime());
                      const isValidEnd = renoEnd && !isNaN(new Date(renoEnd).getTime());
                      const hasValidRenovation = isValidStart && isValidEnd;
                      const renovationPeriod = hasValidRenovation
                        ? `${formatDate(renoStart)} – ${formatDate(renoEnd)}`
                        : null;

                      const hasClosingData = endDate || tender.estimated_budget;

                      return (
                        <div key={tender.tender_id} className="flex flex-col border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-white truncate flex-1 min-w-0"
                              title={tender.tender_name}
                            >
                              {tender.tender_name}
                            </p>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {isPast ? (
                                <span className="inline-block px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                  Past due
                                </span>
                              ) : (
                                <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-medium border ${getUrgencyColor(daysLeft)}`}>
                                  {daysLeft}d
                                </span>
                              )}
                              <Link href={`/tenders/${tender.tender_id}`} className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline font-medium flex-shrink-0">
                                View
                              </Link>
                            </div>
                          </div>

                          {renovationPeriod && (
                            <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-cyan-700 dark:text-cyan-300 mt-0.5">
                              <span>🛠️ Renovation: {renovationPeriod}</span>
                            </div>
                          )}

                          {hasClosingData && (
                            <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {endDate && <span>{formatDate(endDate)}</span>}
                              {endDate && tender.estimated_budget && (
                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                              )}
                              {tender.estimated_budget && (
                                <span className="font-mono">{formatCurrency(tender.estimated_budget)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* DLP Deadlines – Brutalist header only */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  DLP Deadlines
                </h2>
                <button
                  onClick={() => setShowDlpModal(true)}
                  className="text-[10px] sm:text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="flex-1 p-3 sm:p-4 overflow-auto max-h-[220px] sm:max-h-[280px]">
                {!stats?.dlpSummary?.upcomingList?.length ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No upcoming DLP deadlines.</div>
                ) : (
                  <div className="space-y-2">
                    {stats.dlpSummary.upcomingList.slice(0, 5).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-[180px]">{item.outlet}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Due: {formatDate(item.dueDate)}</p>
                        </div>
                        <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-medium ${item.daysLeft <= 30 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'}`}>
                          {item.daysLeft}d
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Events – Brutalist header only */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Upcoming Events
                </h2>
                <Link href="/calendar" className="text-[10px] sm:text-xs text-cyan-600 dark:text-cyan-400 hover:underline">View all →</Link>
              </div>
              <div className="flex-1 p-3 sm:p-4 overflow-auto max-h-[220px] sm:max-h-[280px]">
                {eventsLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">Loading...</div>
                ) : upcomingEvents.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No upcoming events</div>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.slice(0, 5).map((event) => (
                      <div key={event.event_id} className="flex items-center gap-2 sm:gap-3 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] sm:text-xs font-bold text-cyan-700 dark:text-cyan-300">
                            {format(new Date(event.start_date), "dd")}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-[200px]">{event.title}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            {format(new Date(event.start_date), "MMM d")}
                            {event.brand_name && ` · ${event.brand_name}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== TIER 3: SECONDARY INFO ===== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {/* Notifications – Brutalist header only */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Notifications
                </h2>
              </div>
              <div className="flex-1 p-3 sm:p-4 overflow-auto max-h-[180px] sm:max-h-[200px]">
                {!stats?.notifications?.length ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No new notifications</div>
                ) : (
                  <div className="space-y-2">
                    {stats.notifications.slice(0, 4).map((notif: any) => (
                      <div key={notif.id} className="flex items-start gap-2 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                        <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-cyan-600 dark:bg-cyan-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 dark:text-slate-200 truncate text-xs sm:text-sm">{notif.message}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">{formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}</p>
                        </div>
                        <button
                          onClick={() => openNotificationModal(notif)}
                          className="text-cyan-600 dark:text-cyan-400 text-xs hover:underline flex-shrink-0 font-medium"
                        >
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Awarded Tenders – Brutalist header only */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Awarded Tenders
                </h2>
                <Link href="/admin/awards" className="text-[10px] sm:text-xs text-cyan-600 dark:text-cyan-400 hover:underline">View all →</Link>
              </div>
              <div className="flex-1 p-3 sm:p-4 overflow-auto max-h-[180px] sm:max-h-[200px]">
                {!stats?.awardedTenders?.length ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No awarded tenders yet.</div>
                ) : (
                  <div className="space-y-2">
                    {stats.awardedTenders.slice(0, 4).map((item: any) => (
                      <div key={item.tender_id} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p
                            className="font-medium text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-[200px]"
                            title={item.tender_name}
                          >
                            {item.tender_name}
                          </p>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">{item.contractor_name}</p>
                        </div>
                        <span className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap ml-2">
                          {formatCurrency(item.contract_value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Modal – unchanged */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full mx-auto border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-t-lg flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tender Submission Details</h3>
              <button onClick={closeNotificationModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Event Type</label>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1 capitalize">{selectedNotification.type}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Message</label>
                <p className="text-sm text-slate-900 dark:text-white mt-1">{selectedNotification.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Tender Name</label>
                  <p className="text-sm text-slate-900 dark:text-white mt-1">{selectedNotification.tender_name || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Contractor</label>
                  <p className="text-sm text-slate-900 dark:text-white mt-1">{selectedNotification.contractor_name || "—"}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">BQ Summary</label>
                {selectedNotification.type === "awarded" && selectedNotification.contract_value ? (
                  (() => {
                    const subtotal = selectedNotification.contract_value;
                    const gst = subtotal * 0.09;
                    const grandTotal = subtotal + gst;
                    return (
                      <div className="mt-2 bg-slate-50 dark:bg-slate-800/30 rounded-md p-3 text-sm text-slate-600 dark:text-slate-300">
                        <p><span className="font-medium">Total Line Items:</span> 12</p>
                        <p><span className="font-medium">Subtotal:</span> {formatCurrency(subtotal)}</p>
                        <p><span className="font-medium">GST (9%):</span> {formatCurrency(gst)}</p>
                        <p className="pt-2 font-semibold border-t border-slate-200 dark:border-slate-700 mt-2">Grand Total: {formatCurrency(grandTotal)}</p>
                      </div>
                    );
                  })()
                ) : selectedNotification.type === "submitted" ? (
                  <div className="mt-2 bg-slate-50 dark:bg-slate-800/30 rounded-md p-3 text-sm text-slate-600 dark:text-slate-300">
                    <p>The contractor has submitted a BQ for this tender. Please review the details on the tender page.</p>
                  </div>
                ) : (
                  <div className="mt-2 bg-slate-50 dark:bg-slate-800/30 rounded-md p-3 text-sm text-slate-600 dark:text-slate-300">
                    <p>No BQ details available.</p>
                  </div>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">* This is a mock preview. Actual BQ data can be viewed in the full tender page.</p>
              </div>
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
                {selectedNotification.link && (
                  <Link href={selectedNotification.link} className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium rounded-md transition">
                    Go to Tender Page
                  </Link>
                )}
                <button onClick={closeNotificationModal} className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium rounded-md transition">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DLP Modal – unchanged */}
      {showDlpModal && stats?.dlpSummary?.upcomingList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full mx-auto border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Upcoming DLP Deadlines</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Defect Liability Period expiry dates</p>
              </div>
              <button onClick={() => setShowDlpModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/30">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Outlet</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">DLP Due Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Days Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {stats.dlpSummary.upcomingList.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{item.outlet}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatDate(item.dueDate)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.daysLeft <= 30 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'}`}>
                            {item.daysLeft} days left
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stats.dlpSummary.upcomingList.length === 0 && (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">No upcoming DLP deadlines.</div>
              )}
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-end">
              <button onClick={() => setShowDlpModal(false)} className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium rounded-lg transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}