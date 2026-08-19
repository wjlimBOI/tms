"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { RefreshCw, SlidersHorizontal, ChevronUp, ChevronDown, X, Pin, Plus } from "lucide-react";
import {
  getBQStatusStyles,
  getBQStatusLabel,
  getDlpStatusBadgeStyle,
} from "@/lib/statusColors";
import { ROLE_IDS, isSuperViewer } from "@/lib/roles";
import { getBrandColor } from "@/lib/brandColors";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useNotify } from "@/components/ui/notification-provider";
import NotificationDetailModal from "@/components/dashboard/NotificationDetailModal";
import { EventDetailModal, type CalendarEventDetail } from "@/components/calendar/EventDetailModal";
import { getEventMainTitle, getEventPeriodLabel, formatEventDateRange } from "@/lib/calendarEvent";
import type { AwardedTenderItem, DashboardNotification } from "@/types/dashboard";

// Registry for the customizable widget section — see the "Customize
// Dashboard" preferences UI below. Persisted via
// /api/user/preferences/dashboard-layout (users.dashboard_layout, a real
// column that already had a working GET/POST API but no frontend ever
// wired to it).
const DASHBOARD_WIDGETS = [
  { id: "activeTenders", label: "Active Tenders" },
  { id: "dlpDeadlines", label: "DLP Deadlines" },
  { id: "upcomingEvents", label: "Upcoming Events" },
  { id: "notifications", label: "Notifications" },
  { id: "awardedTenders", label: "Awarded Tenders" },
] as const;
type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];
const DEFAULT_WIDGET_ORDER: DashboardWidgetId[] = DASHBOARD_WIDGETS.map((w) => w.id);
const WIDGET_ID_SET = new Set<string>(DEFAULT_WIDGET_ORDER);

interface PinnedReminder {
  id: string;
  text: string;
  dueDate?: string;
  createdAt: string;
}

function normalizeBQStatus(rawStatus: string): "draft" | "submitted" {
  const lower = rawStatus?.toLowerCase() || "";
  if (lower === "draft") return "draft";
  if (lower === "submitted") return "submitted";
  return "draft";
}

interface DashboardStats {
  totalCompletedProjectsThisYear?: number;
  activeTenders?: number;
  dlpSummary?: {
    activeCases: number;
    overdueCases?: number;
    nextDueDate?: string;
    upcomingList?: Array<{ outlet: string; brandName?: string; dueDate: string; status?: string; daysLeft: number; daysOverdue?: number }>;
    overdueList?: Array<{ outlet: string; brandName?: string; dueDate: string; status?: string; daysLeft: number; daysOverdue?: number }>;
  };
  awardedTenders?: AwardedTenderItem[];
  notifications?: DashboardNotification[];
  unreadNotificationsCount?: number;
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
  const [selectedNotification, setSelectedNotification] = useState<DashboardNotification | null>(null);

  const [tenders, setTenders] = useState<any[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [tendersError, setTendersError] = useState<string | null>(null);

  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDetail | null>(null);
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const toast = useNotify();
  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetId[]>(DEFAULT_WIDGET_ORDER);
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<DashboardWidgetId>>(new Set());
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [draftOrder, setDraftOrder] = useState<DashboardWidgetId[]>(DEFAULT_WIDGET_ORDER);
  const [draftHidden, setDraftHidden] = useState<Set<DashboardWidgetId>>(new Set());
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Prototype only — see the "Pinned & Reminders" section below. Stored in
  // localStorage per-user for now, no backend yet, so it won't sync across
  // devices. First iteration on the pin/reminder idea; expanding this to
  // pin specific tenders/notifications/DLP items directly is a follow-up.
  const [pinnedReminders, setPinnedReminders] = useState<PinnedReminder[]>([]);
  const [newReminderText, setNewReminderText] = useState("");
  const [newReminderDate, setNewReminderDate] = useState("");

  const userRole = (session?.user as any)?.role_id;
  const roleIds = ((session?.user as any)?.roleIds || []) as number[];
  const isContractor = userRole === ROLE_IDS.CONTRACTOR;
  const isAdmin = isSuperViewer(roleIds);

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
      fetchDashboardPreferences();
    }
  }, [session, status, router, isContractor, isAdmin]);

  const reminderStorageKey = session?.user?.id ? `dashboard-reminders-${session.user.id}` : null;

  useEffect(() => {
    if (!reminderStorageKey) return;
    try {
      const raw = window.localStorage.getItem(reminderStorageKey);
      setPinnedReminders(raw ? JSON.parse(raw) : []);
    } catch (err) {
      console.error("Failed to load pinned reminders:", err);
    }
  }, [reminderStorageKey]);

  const addReminder = () => {
    const text = newReminderText.trim();
    if (!text || !reminderStorageKey) return;
    const next: PinnedReminder[] = [
      ...pinnedReminders,
      { id: crypto.randomUUID(), text, dueDate: newReminderDate || undefined, createdAt: new Date().toISOString() },
    ];
    setPinnedReminders(next);
    window.localStorage.setItem(reminderStorageKey, JSON.stringify(next));
    setNewReminderText("");
    setNewReminderDate("");
  };

  const removeReminder = (id: string) => {
    if (!reminderStorageKey) return;
    const next = pinnedReminders.filter((r) => r.id !== id);
    setPinnedReminders(next);
    window.localStorage.setItem(reminderStorageKey, JSON.stringify(next));
  };

  // Loads the saved widget order/visibility, if any. A missing or
  // corrupted layout (e.g. an old widget id no longer in DASHBOARD_WIDGETS)
  // silently falls back to the default order instead of breaking the page.
  const fetchDashboardPreferences = async () => {
    try {
      const res = await fetch("/api/user/preferences/dashboard-layout");
      if (!res.ok) return;
      const data = await res.json();
      const layout = data?.layout;
      if (!layout || typeof layout !== "object") return;

      const savedOrder: string[] = Array.isArray(layout.order) ? layout.order : [];
      const validOrder = savedOrder.filter((id): id is DashboardWidgetId => WIDGET_ID_SET.has(id));
      const missing = DEFAULT_WIDGET_ORDER.filter((id) => !validOrder.includes(id));
      setWidgetOrder([...validOrder, ...missing]);

      const savedHidden: string[] = Array.isArray(layout.hidden) ? layout.hidden : [];
      setHiddenWidgets(new Set(savedHidden.filter((id): id is DashboardWidgetId => WIDGET_ID_SET.has(id))));
    } catch (err) {
      console.error("Failed to load dashboard preferences:", err);
    }
  };

  const openCustomizeModal = () => {
    setDraftOrder(widgetOrder);
    setDraftHidden(new Set(hiddenWidgets));
    setShowCustomizeModal(true);
  };

  useEffect(() => {
    if (!showCustomizeModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !savingPrefs) setShowCustomizeModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showCustomizeModal, savingPrefs]);

  const moveDraftWidget = (index: number, direction: -1 | 1) => {
    setDraftOrder((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleDraftHidden = (id: DashboardWidgetId) => {
    setDraftHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveDashboardPreferences = async () => {
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/user/preferences/dashboard-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: { order: draftOrder, hidden: Array.from(draftHidden) } }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setWidgetOrder(draftOrder);
      setHiddenWidgets(draftHidden);
      setShowCustomizeModal(false);
      toast.success("Dashboard preferences saved.");
    } catch (err) {
      console.error("Failed to save dashboard preferences:", err);
      toast.error("Couldn't save your dashboard preferences. Please try again.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
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
      setError("We couldn't load your dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTenders = async () => {
    setTendersLoading(true);
    setTendersError(null);
    try {
      const res = await fetch("/api/tenders?limit=100");
      if (!res.ok) throw new Error("Failed to fetch tenders");
      const data = await res.json();
      setTenders(data.data || []);
    } catch (err) {
      console.error(err);
      setTendersError("Couldn't load active tenders.");
    } finally {
      setTendersLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    setEventsLoading(true);
    setEventsError(null);
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
      setEventsError("Couldn't load upcoming events.");
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

  const BrandBadge = ({ brandName }: { brandName?: string | null }) => {
    if (!brandName) return null;
    // Original bright brand color, softened with alpha so it doesn't shout
    // on a white card - full white text kept legible over it.
    const { borderColor } = getBrandColor(brandName);
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap flex-shrink-0 text-white"
        style={{ backgroundColor: `${borderColor}bf` }}
        title={brandName}
      >
        {brandName}
      </span>
    );
  };

  const getUrgencyColor = (daysLeft: number) => {
    if (daysLeft <= 2) return "text-rose-700 bg-rose-100/80 border-rose-200";
    if (daysLeft <= 5) return "text-amber-700 bg-amber-100/80 border-amber-200";
    return "text-emerald-700 bg-emerald-100/80 border-emerald-200";
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
    totalCompleted: stats?.totalCompletedProjectsThisYear ?? 0,
    activeTendersCount: stats?.activeTenders ?? 0,
    dlpActive: stats?.dlpSummary?.activeCases ?? 0,
    pendingNotifications: stats?.unreadNotificationsCount ?? 0,
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-sm px-4">
          <p className="text-rose-600 mb-4">{error}</p>
          <Button onClick={fetchDashboardData} disabled={loading} className="bg-[#15406a] hover:bg-[#0d2d4a] text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const userName = session.user?.name || "User";

  if (isContractor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Redirecting to tenders...</p>
        </div>
      </div>
    );
  }

  // ========== INTERNAL STAFF DASHBOARD ==========
  const openNotificationModal = (notif: DashboardNotification) => setSelectedNotification(notif);
  const closeNotificationModal = () => setSelectedNotification(null);

  return (
    <>
      <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-[1920px] mx-auto">
          {/* Header */}
          <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-serif text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
              Welcome back, {userName}
            </h1>
            {isAdmin && (
              <button
                onClick={openCustomizeModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-[#15406a] text-[#15406a] bg-white hover:bg-[#15406a] hover:text-white transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Customize Dashboard
              </button>
            )}
          </div>

          {/* ===== PINNED & REMINDERS (prototype) ===== */}
          <Card className="bg-white border-slate-200 shadow-none p-0 gap-0 mb-4 sm:mb-6 overflow-hidden">
            <CardHeader className="flex-row justify-between items-center space-y-0 px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 border-b border-slate-200">
              <CardTitle className="text-base sm:text-lg font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Pin className="w-4 h-4 text-[#15406a]" aria-hidden="true" />
                Pinned &amp; Reminders
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addReminder();
                }}
                className="flex flex-wrap items-center gap-2 mb-3"
              >
                <label htmlFor="new-reminder-text" className="sr-only">Reminder text</label>
                <input
                  id="new-reminder-text"
                  type="text"
                  value={newReminderText}
                  onChange={(e) => setNewReminderText(e.target.value)}
                  placeholder="Add a reminder..."
                  maxLength={140}
                  className="flex-1 min-w-[160px] text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-transparent"
                />
                <label htmlFor="new-reminder-date" className="sr-only">Due date (optional)</label>
                <input
                  id="new-reminder-date"
                  type="date"
                  value={newReminderDate}
                  onChange={(e) => setNewReminderDate(e.target.value)}
                  className="text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-transparent"
                />
                <Button type="submit" size="sm" disabled={!newReminderText.trim()} className="bg-[#15406a] hover:bg-[#0d2d4a] text-white flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </form>

              {pinnedReminders.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-3">
                  Nothing pinned yet. Add a reminder above to try it out.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {pinnedReminders.map((r) => (
                    <div
                      key={r.id}
                      className="group flex items-center gap-2 max-w-full border border-slate-200 rounded-full pl-3 pr-1.5 py-1 bg-slate-50"
                    >
                      <span className="text-sm text-slate-800 truncate max-w-[240px]" title={r.text}>{r.text}</span>
                      {r.dueDate && (
                        <span className="text-[10px] font-medium text-[#15406a] bg-[#15406a1a] px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {formatDate(r.dueDate)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeReminder(r.id)}
                        aria-label={`Remove reminder: ${r.text}`}
                        className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex-shrink-0"
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ===== TIER 1: KEY METRICS ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <Card className="bg-white border-slate-200 shadow-none p-3 sm:p-4 gap-0">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Awarded {new Date().getFullYear()}</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">{metrics.totalCompleted}</p>
            </Card>
            <Card className="bg-white border-slate-200 shadow-none p-3 sm:p-4 gap-0">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Active Tenders</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600">{metrics.activeTendersCount}</p>
            </Card>
            <Card className="bg-white border-slate-200 shadow-none p-3 sm:p-4 gap-0">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">DLP Active</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{metrics.dlpActive}</p>
            </Card>
            <Card className="bg-white border-slate-200 shadow-none p-3 sm:p-4 gap-0">
              <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Unread Notifications</p>
              <p className="text-xl sm:text-2xl font-bold text-purple-600">{metrics.pendingNotifications}</p>
            </Card>
          </div>

          {/* ===== CUSTOMIZABLE WIDGETS ===== */}
          {(() => {
            const widgetRenderers: Record<DashboardWidgetId, () => React.ReactNode> = {
              activeTenders: () => (
            <Card className="bg-white border-slate-200 shadow-none overflow-hidden flex flex-col p-0 gap-0">
              <CardHeader className="flex-row justify-between items-center space-y-0 px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 border-b border-slate-200">
                <CardTitle className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800">
                  Active Tenders
                </CardTitle>
                <Link href="/tenders" className="text-[10px] sm:text-xs text-[#15406a] hover:underline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15406a]">View all →</Link>
              </CardHeader>
              <CardContent className="flex-1 p-3 sm:p-4 overflow-auto max-h-[220px] sm:max-h-[280px]">
                {tendersLoading ? (
                  <div className="text-sm text-slate-500 text-center py-4">Loading...</div>
                ) : tendersError ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-rose-600 mb-2">{tendersError}</p>
                    <Button size="sm" variant="outline" onClick={fetchTenders}>
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </Button>
                  </div>
                ) : activeTendersList.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-4">No active tenders</div>
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
                        <div key={tender.tender_id} className="flex flex-col border-b border-slate-100 pb-2 last:border-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <BrandBadge brandName={tender.brand_name} />
                              <p
                                className="text-sm font-medium text-slate-900 truncate min-w-0"
                                title={tender.tender_name}
                              >
                                {tender.tender_name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {isPast ? (
                                <span className="inline-block px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-200 text-slate-600">
                                  Closed
                                </span>
                              ) : (
                                <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-medium border ${getUrgencyColor(daysLeft)}`}>
                                  {daysLeft}d
                                </span>
                              )}
                              <Link href={`/tenders/${tender.tender_id}`} className="text-xs text-[#15406a] hover:underline font-medium flex-shrink-0">
                                View
                              </Link>
                            </div>
                          </div>

                          {renovationPeriod && (
                            <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-slate-500 mt-0.5">
                              <span>Renovation: {renovationPeriod}</span>
                            </div>
                          )}

                          {hasClosingData && (
                            <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-slate-500 mt-0.5">
                              {endDate && <span>Closes: {formatDate(endDate)}</span>}
                              {endDate && tender.estimated_budget && (
                                <span className="w-1 h-1 rounded-full bg-slate-300" />
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
              </CardContent>
            </Card>
              ),
              dlpDeadlines: () => (
            <Card className="bg-white border-slate-200 shadow-none overflow-hidden flex flex-col p-0 gap-0">
              <CardHeader className="flex-row justify-between items-center space-y-0 px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 border-b border-slate-200">
                <CardTitle className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800">
                  DLP Deadlines
                </CardTitle>
                <Link href="/admin/dlp-deadlines" className="text-[10px] sm:text-xs text-[#15406a] hover:underline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15406a]">View all →</Link>
              </CardHeader>
              <CardContent className="flex-1 p-3 sm:p-4 overflow-auto max-h-[220px] sm:max-h-[280px]">
                {!stats?.dlpSummary?.upcomingList?.length ? (
                  <div className="text-sm text-slate-500 text-center py-4">No upcoming DLP deadlines.</div>
                ) : (
                  <div className="space-y-2">
                    {stats.dlpSummary.upcomingList
                      .slice(0, 5)
                      .map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center gap-2 text-sm border-b border-slate-100 pb-2 last:border-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <BrandBadge brandName={item.brandName} />
                              <p className="font-medium text-slate-900 truncate" title={item.outlet}>{item.outlet}</p>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-500">Due: {formatDate(item.dueDate)}</p>
                          </div>
                          <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0 ${getDlpStatusBadgeStyle(item.status || 'upcoming')}`}>
                            {item.daysLeft}d
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
              ),
              upcomingEvents: () => (
            <Card className="bg-white border-slate-200 shadow-none overflow-hidden flex flex-col p-0 gap-0">
              <CardHeader className="flex-row justify-between items-center space-y-0 px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 border-b border-slate-200">
                <CardTitle className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800">
                  Upcoming Events
                </CardTitle>
                <Link href="/calendar/upcoming" className="text-[10px] sm:text-xs text-[#15406a] hover:underline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15406a]">View all →</Link>
              </CardHeader>
              <CardContent className="flex-1 p-3 sm:p-4 overflow-auto max-h-[220px] sm:max-h-[280px]">
                {eventsLoading ? (
                  <div className="text-sm text-slate-500 text-center py-4">Loading...</div>
                ) : eventsError ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-rose-600 mb-2">{eventsError}</p>
                    <Button size="sm" variant="outline" onClick={fetchCalendarEvents}>
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </Button>
                  </div>
                ) : upcomingEvents.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-4">No upcoming events</div>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.slice(0, 5).map((event) => {
                      const mainTitle = getEventMainTitle(event.title, event.tender_name);
                      const periodLabel = getEventPeriodLabel(event.title, event.tender_name);
                      const dateRange = formatEventDateRange(event.start_date, event.end_date);
                      return (
                        <button
                          key={event.event_id}
                          type="button"
                          onClick={() => {
                            setSelectedEvent(event);
                            setEventDetailOpen(true);
                          }}
                          className="w-full flex items-center gap-2 text-sm text-left border-b border-slate-100 pb-2 last:border-0 rounded-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15406a] transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <BrandBadge brandName={event.brand_name} />
                              <p className="font-medium text-slate-900 truncate text-xs sm:text-sm" title={mainTitle}>{mainTitle}</p>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                              {periodLabel ? `${periodLabel}: ` : ""}{dateRange}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
              ),
              notifications: () => (
            <Card className="bg-white border-slate-200 shadow-none overflow-hidden flex flex-col p-0 gap-0">
              <CardHeader className="flex-row justify-between items-center space-y-0 px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 border-b border-slate-200">
                <CardTitle className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800">
                  Notifications
                </CardTitle>
                <Link href="/admin/notifications" className="text-[10px] sm:text-xs text-[#15406a] hover:underline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15406a]">View all →</Link>
              </CardHeader>
              <CardContent className="flex-1 p-3 sm:p-4 overflow-auto max-h-[180px] sm:max-h-[200px]">
                {!stats?.notifications?.length ? (
                  <div className="text-sm text-slate-500 text-center py-4">No new notifications</div>
                ) : (
                  <div className="space-y-2">
                    {stats.notifications.slice(0, 4).map((notif) => (
                      <div key={notif.id} className="flex items-start gap-2 text-sm border-b border-slate-100 pb-2 last:border-0">
                        <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#15406a] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 truncate text-xs sm:text-sm">{notif.message}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500">{formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}</p>
                        </div>
                        <Button
                          variant="link"
                          size="inline"
                          onClick={() => openNotificationModal(notif)}
                          className="text-[#15406a] text-xs no-underline hover:underline flex-shrink-0 font-medium"
                        >
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
              ),
              awardedTenders: () => (
            <Card className="bg-white border-slate-200 shadow-none overflow-hidden flex flex-col p-0 gap-0">
              <CardHeader className="flex-row justify-between items-center space-y-0 px-4 sm:px-5 py-2.5 sm:py-3 bg-slate-50/80 border-b border-slate-200">
                <CardTitle className="text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider text-slate-800">
                  Awarded Tenders
                </CardTitle>
                <Link href="/admin/awards" className="text-[10px] sm:text-xs text-[#15406a] hover:underline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15406a]">View all →</Link>
              </CardHeader>
              <CardContent className="flex-1 p-3 sm:p-4 overflow-auto max-h-[180px] sm:max-h-[200px]">
                {!stats?.awardedTenders?.length ? (
                  <div className="text-sm text-slate-500 text-center py-4">No awarded tenders yet.</div>
                ) : (
                  <div className="space-y-2">
                    {stats.awardedTenders.slice(0, 4).map((item) => (
                      <div key={item.tender_id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <BrandBadge brandName={item.brand_name} />
                            <p
                              className="font-medium text-slate-900 truncate"
                              title={item.tender_name}
                            >
                              {item.tender_name}
                            </p>
                          </div>
                          <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                            {item.contractor_name}
                            {item.awarded_date && ` · Awarded: ${formatDate(item.awarded_date)}`}
                          </p>
                        </div>
                        <span className="text-xs sm:text-sm font-semibold text-emerald-700 whitespace-nowrap ml-2 flex-shrink-0">
                          {formatCurrency(item.contract_value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
              ),
            };

            const visibleWidgets = widgetOrder.filter((id) => !hiddenWidgets.has(id));

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {visibleWidgets.length === 0 ? (
                  <Card className="bg-white border-slate-200 shadow-none p-8 text-center md:col-span-2 lg:col-span-3">
                    <p className="text-sm text-slate-500">
                      All dashboard sections are hidden. Use &ldquo;Customize Dashboard&rdquo; above to show some again.
                    </p>
                  </Card>
                ) : (
                  visibleWidgets.map((id) => <div key={id}>{widgetRenderers[id]()}</div>)
                )}
              </div>
            );
          })()}
        </div>
      </div>

      <NotificationDetailModal notification={selectedNotification} onClose={closeNotificationModal} />
      <EventDetailModal
        event={selectedEvent}
        open={eventDetailOpen}
        onClose={() => setEventDetailOpen(false)}
      />

      {/* Customize Dashboard Modal — a plain hand-built card instead of the
          shared base-ui Dialog. Same fix already applied to
          confirm-dialog.tsx and AgreementAcknowledgementModal for the
          "crosshair" rendering artifact (moire lines from the shared
          Dialog's ring/backdrop compositing over a busy background) —
          removing just backdrop-blur wasn't enough there, so this one
          skips the shared Dialog/ring/grid machinery entirely. */}
      {showCustomizeModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !savingPrefs) setShowCustomizeModal(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="customize-dashboard-title"
              className="w-full max-w-md rounded-lg bg-white shadow-lg border border-slate-200"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h2 id="customize-dashboard-title" className="text-lg font-semibold text-slate-900">
                  Customize Dashboard
                </h2>
                <button
                  onClick={() => !savingPrefs && setShowCustomizeModal(false)}
                  aria-label="Close dialog"
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-6 space-y-2">
                <p className="text-xs text-slate-500 mb-3">
                  Choose which sections to show, and use the arrows to reorder them.
                </p>
                {draftOrder.map((id, idx) => {
                  const widget = DASHBOARD_WIDGETS.find((w) => w.id === id)!;
                  const isHidden = draftHidden.has(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2"
                    >
                      <label className="flex items-center gap-2 text-sm text-slate-800 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => toggleDraftHidden(id)}
                          className="text-[#15406a] focus:ring-[#15406a]"
                        />
                        <span className={`truncate ${isHidden ? "text-slate-400" : ""}`}>{widget.label}</span>
                      </label>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveDraftWidget(idx, -1)}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                          aria-label={`Move ${widget.label} up`}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === draftOrder.length - 1}
                          onClick={() => moveDraftWidget(idx, 1)}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                          aria-label={`Move ${widget.label} down`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowCustomizeModal(false)} disabled={savingPrefs}>
                  Cancel
                </Button>
                <Button
                  onClick={saveDashboardPreferences}
                  disabled={savingPrefs}
                  className="bg-[#15406a] hover:bg-[#0d2d4a] text-white"
                >
                  {savingPrefs ? "Saving…" : "Save Preferences"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}