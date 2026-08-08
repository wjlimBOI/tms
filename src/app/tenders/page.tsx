"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format, isAfter, parseISO, differenceInDays } from "date-fns";
import { getBrandColor } from "@/lib/brandColors";
import { getTenderStatusBadgeStyle, getTenderStatusLabel } from "@/lib/statusColors";
import { getCompanyDetailsByBrand } from "@/lib/companyMapping";
import { MoreVertical, Edit, FileText, Eye, CheckCircle, LayoutDashboard, Clock, Users, UserPlus } from "lucide-react";
import { ROLE_IDS } from "@/lib/roles";
import { useNotify } from "@/components/ui/notification-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import TenderInterestModal from "@/components/tenders/TenderInterestModal";
import AwardTenderModal from "@/components/tenders/AwardTenderModal";

// ---------- Interfaces ----------
interface Tender {
  tender_id: number;
  tender_name: string;
  tender_description: string;
  branch_name: string;
  brand_name: string;
  renovation_type: string;
  status_label: string;
  tender_date?: string;
  renovation_start_date?: string;
  renovation_end_date?: string;
  closing_date?: string;
  stage: number;
  stage_updated_at?: string;
  building_name?: string;
  interest_count?: number;
  has_expressed_interest?: boolean;
}

interface ExtensionStatus {
  id: number;
  status: string | null;
  requestedDays?: number;
  reason?: string;
  createdAt?: string;
}

// ---------- Constants & Helpers ----------
const statusPriority: Record<string, number> = {
  Open: 1,
  Closed: 2,
  Upcoming: 3,
  Awarded: 4,
};

const STAGES = ["Upcoming", "Open", "Closed", "Awarded"];

const getStageFromStatus = (status: string): number => {
  switch (status) {
    case "Upcoming": return 0;
    case "Open": return 1;
    case "Closed": return 2;
    case "Awarded": return 3;
    default: return 0;
  }
};

const getStagePillStyle = (stage: string): string => {
  switch (stage) {
    case "Upcoming":
      return "bg-slate-100 text-slate-700";
    case "Open":
      return "bg-emerald-50 text-emerald-700";
    case "Closed":
      return "bg-amber-50 text-amber-700";
    case "Awarded":
      return "bg-indigo-50 text-indigo-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

// ---------- Deadline color helper ----------
const getDeadlineColor = (daysLeft: number | null): string => {
  if (daysLeft === null) return "text-slate-400";
  if (daysLeft === 0) return "text-rose-600";
  if (daysLeft <= 3) return "text-amber-600";
  return "text-emerald-600";
};

// ---------- Dropdown Component (with portal and responsive positioning) ----------
function DropdownActions({
  children,
  trigger,
}: {
  children: React.ReactNode;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [dropdownWidth, setDropdownWidth] = useState(224);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      // Responsive dropdown width
      let width = 224;
      if (viewportWidth < 640) width = 200;
      if (viewportWidth < 400) width = 180;
      setDropdownWidth(width);
      
      // Calculate position to keep dropdown in viewport
      let left = rect.right - width;
      if (left < 10) left = 10;
      if (left + width > viewportWidth - 10) left = viewportWidth - width - 10;
      
      let top = rect.bottom + window.scrollY;
      // If dropdown would go below viewport, position it above
      if (top + 200 > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - 200;
      }
      
      setPosition({
        top: top,
        left: left,
      });
    }
  }, [open]);

  return (
    <div className="relative" ref={triggerRef}>
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            className="fixed z-[999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 max-h-[300px] overflow-y-auto"
            style={{ 
              top: position.top, 
              left: position.left, 
              width: dropdownWidth,
              maxWidth: 'calc(100vw - 20px)'
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

// ---------- Main Component ----------
export default function TendersListPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---------- State ----------
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [filteredTenders, setFilteredTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "");
  const [totalPages, setTotalPages] = useState(1);
  const [totalTenders, setTotalTenders] = useState(0);
  const limit = 9;

  // Editing dates state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const [extensionStatuses, setExtensionStatuses] = useState<Record<number, ExtensionStatus>>({});
  const [loadingExtensions, setLoadingExtensions] = useState(false);

  const [applyingInterestId, setApplyingInterestId] = useState<number | null>(null);
  const [interestModalTender, setInterestModalTender] = useState<Tender | null>(null);
  const [awardModalTender, setAwardModalTender] = useState<Tender | null>(null);

  const toast = useNotify();
  const confirm = useConfirm();

  const userRole = (session?.user as any)?.role_id;
  const isAdmin = userRole === ROLE_IDS.ADMIN;
  const isContractor = userRole === ROLE_IDS.CONTRACTOR;
  const canManageStage = userRole === ROLE_IDS.ADMIN;

  // ---------- Data fetching ----------
  const fetchTenders = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", limit.toString());
    if (search) params.set("search", search);
    if (statusFilter && statusFilter !== "All") params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/tenders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch tenders");
      const data = await res.json();
      setTenders(data.data || []);
      setTotalPages(data.totalPages || 1);
      setTotalTenders(data.total || 0);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load tenders");
      toast.error("We couldn't retrieve your tenders. Please refresh the page or try again later.");
    } finally {
      setLoading(false);
    }
  };

  const fetchExtensionStatuses = async (tenderList: Tender[]) => {
    if (!isAdmin) return;
    setLoadingExtensions(true);
    try {
      const statusMap: Record<number, ExtensionStatus> = {};
      await Promise.all(
        tenderList.map(async (tender) => {
          try {
            const res = await fetch(`/api/tender-extension?tender_id=${tender.tender_id}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.status) {
                statusMap[tender.tender_id] = data;
              }
            }
          } catch (e) {
            // ignore
          }
        })
      );
      setExtensionStatuses(statusMap);
    } catch (err) {
      console.error("Failed to fetch extension statuses:", err);
    } finally {
      setLoadingExtensions(false);
    }
  };

  // ---------- Effects ----------
  useEffect(() => {
    if (tenders.length > 0 && isAdmin) {
      fetchExtensionStatuses(tenders);
    }
  }, [tenders, isAdmin]);

  useEffect(() => {
    let result = [...tenders];
    if (search && search.trim()) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.tender_name.toLowerCase().includes(lowerSearch) ||
          t.tender_description?.toLowerCase().includes(lowerSearch) ||
          t.brand_name.toLowerCase().includes(lowerSearch)
      );
    }
    if (statusFilter && statusFilter !== "All") {
      result = result.filter((t) => t.status_label === statusFilter);
    }

    if (isAdmin) {
      result.sort((a, b) => {
        const priorityA = statusPriority[a.status_label] ?? 99;
        const priorityB = statusPriority[b.status_label] ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        if (a.closing_date && b.closing_date) {
          return new Date(a.closing_date).getTime() - new Date(b.closing_date).getTime();
        }
        return 0;
      });
    } else {
      result.sort((a, b) => {
        if (a.closing_date && b.closing_date) {
          return new Date(a.closing_date).getTime() - new Date(b.closing_date).getTime();
        }
        return 0;
      });
    }
    setFilteredTenders(result);
  }, [tenders, search, statusFilter, isAdmin]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.push("/login");
    if (session?.user) fetchTenders();
  }, [session, sessionStatus, router, page, search, statusFilter]);

  const updateUrl = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter && statusFilter !== "All") params.set("status", statusFilter);
    if (page > 1) params.set("page", page.toString());
    router.push(`/tenders?${params.toString()}`);
  };

  useEffect(() => {
    updateUrl();
  }, [search, statusFilter, page]);

  // ---------- Date editing ----------
  const startEdit = (tender: Tender) => {
    setEditingId(tender.tender_id);
    setEditStart(tender.renovation_start_date ? tender.renovation_start_date.split('T')[0] : "");
    setEditEnd(tender.renovation_end_date ? tender.renovation_end_date.split('T')[0] : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditStart("");
    setEditEnd("");
  };

  const saveEdit = async (tender: Tender) => {
    if (!editStart || !editEnd) {
      toast.error("Both the start and end dates must be provided.");
      return;
    }

    const startISO = editStart ? new Date(editStart + 'T00:00:00').toISOString() : null;
    const endISO = editEnd ? new Date(editEnd + 'T00:00:00').toISOString() : null;

    setSaving(true);
    try {
      const res = await fetch(`/api/tenders/${tender.tender_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({
          renovation_start_date: startISO,
          renovation_end_date: endISO,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || "Update failed");
      }

      setTenders(prev =>
        prev.map(t =>
          t.tender_id === tender.tender_id
            ? { ...t, renovation_start_date: startISO || "", renovation_end_date: endISO || "" }
            : t
        )
      );
      toast.success("Renovation dates were updated successfully.");
      cancelEdit();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Something went wrong while updating the dates.");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Interest (contractor apply / admin view) ----------
  const registerInterest = async (tender: Tender) => {
    const proceed = await confirm({
      title: "Register interest",
      description: `Register your company's interest in "${tender.tender_name}"? The tender team will be able to see that you've applied.`,
      confirmText: "Register Interest",
    });
    if (!proceed) return;

    setApplyingInterestId(tender.tender_id);
    try {
      const res = await fetch(`/api/tenders/${tender.tender_id}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Unable to register interest.");
      }
      setTenders(prev =>
        prev.map(t =>
          t.tender_id === tender.tender_id
            ? { ...t, has_expressed_interest: true, interest_count: (t.interest_count || 0) + 1 }
            : t
        )
      );
      toast.success("Your interest has been registered.");
    } catch (err: any) {
      toast.error(err.message || "Unable to register interest.");
    } finally {
      setApplyingInterestId(null);
    }
  };

  // ---------- Helpers ----------
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy");
    } catch {
      return "Invalid date";
    }
  };

  const getDaysLeft = (closingDate?: string) => {
    if (!closingDate) return null;
    const today = new Date();
    const closing = parseISO(closingDate);
    if (isAfter(today, closing)) return 0;
    return differenceInDays(closing, today);
  };

  const statusCounts = tenders.reduce((acc, t) => {
    acc[t.status_label] = (acc[t.status_label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ---------- Loading & Error States ----------
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-6" />
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-4">
                <div className="h-6 bg-slate-200 rounded w-full sm:w-1/4" />
                <div className="h-6 bg-slate-200 rounded w-full sm:w-1/4" />
                <div className="h-6 bg-slate-200 rounded w-full sm:w-1/4" />
                <div className="h-6 bg-slate-200 rounded w-full sm:w-1/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center max-w-md">
          <p className="text-red-800">{error}</p>
          <button onClick={fetchTenders} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasTenders = filteredTenders.length > 0;
  const showEmptyState = !hasTenders && !loading;

  // ---------- Main Render ----------
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto py-4 px-3 sm:py-6 sm:px-4 lg:px-6">
        {/* ===== TOP SECTION ===== */}
        <div className="bg-gradient-to-br from-blue-100/80 via-white/95 to-cyan-100/80 rounded-xl border border-blue-200/60 shadow-lg shadow-blue-100/30 p-3 sm:p-4 mb-4 sm:mb-6">
          {/* Bento Box: Header */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="lg:col-span-2 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/80 shadow-sm p-3 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                    <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                      Tender Management
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      View and manage all tenders
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <Link
                    href="/tenders/new"
                    className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
                  >
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    New Tender
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-4 mt-2 sm:mt-3 text-xs sm:text-sm text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full" />
                  Open: {statusCounts["Open"] || 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-500 rounded-full" />
                  Upcoming: {statusCounts["Upcoming"] || 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-rose-500 rounded-full" />
                  Closed: {statusCounts["Closed"] || 0}
                </span>
                <span className="text-slate-400 hidden sm:inline">|</span>
                <span className="text-slate-400">Total: {totalTenders}</span>
              </div>
            </div>

            {/* Tender Progress Section - COMMENTED OUT for future use */}
            {/* 
            {isAdmin && filteredTenders.length > 0 && (
              <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/80 shadow-sm p-3 sm:p-4 flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 rounded-lg">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-semibold text-slate-800">Tender Progress</h2>
                    <p className="text-[8px] sm:text-[10px] text-slate-500">
                      {filteredTenders.length} tender{filteredTenders.length > 1 ? 's' : ''} in workflow
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {upcomingCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-medium bg-slate-100 text-slate-600">
                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                      Upcoming: {upcomingCount}
                    </span>
                  )}
                  {activeBreakdown.map(({ stage, count }) => {
                    if (count === 0) return null;
                    return (
                      <span
                        key={stage}
                        className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-medium ${getStagePillStyle(stage)}`}
                      >
                        <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                        {stage}: {count}
                      </span>
                    );
                  })}
                  {activeBreakdown.every(s => s.count === 0) && upcomingCount === 0 && (
                    <span className="text-[8px] sm:text-[10px] text-slate-400">No active stages</span>
                  )}
                </div>
              </div>
            )}
            */}
          </div>

          {/* Search & Filters */}
          <div className="bg-white/90 backdrop-blur-sm border border-slate-200/80 rounded-md p-2 sm:p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search tenders..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-7 pr-2 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPage(1); fetchTenders(); }}
                  className="px-2 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition shadow-sm"
                >
                  Apply
                </button>
                <button
                  onClick={() => { setSearch(""); setStatusFilter(""); setPage(1); }}
                  className="px-2 sm:px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-md text-xs font-medium hover:bg-slate-50 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-200">
                {["All", "Upcoming", "Open", "Closed"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setStatusFilter(opt === "All" ? "" : opt); setPage(1); }}
                    className={`px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-medium rounded-full border transition ${
                      (statusFilter === opt) || (opt === "All" && !statusFilter)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ===== CONTRACTOR INFO ===== */}
        {isContractor && hasTenders && (
          <div className="flex flex-wrap gap-2 sm:gap-3 mb-3 sm:mb-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Open: {filteredTenders.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> Deadlines approaching
            </span>
          </div>
        )}

        {/* ===== EMPTY STATE ===== */}
        {showEmptyState && (
          <div className="bg-white border border-slate-200 rounded-md p-6 sm:p-8 text-center shadow-sm">
            <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">No tenders found</h3>
            <p className="text-sm text-slate-500">
              {isAdmin ? "Create your first tender using the button above." : "Check back later for new opportunities."}
            </p>
            {isAdmin && (
              <Link href="/tenders/new" className="inline-block mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition">
                Create New Tender
              </Link>
            )}
          </div>
        )}

        {/* ===== TENDER TABLE ===== */}
        {hasTenders && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[600px] text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Tender Name
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Branch
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Building
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Renovation Period
                  </th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenders.map((item) => {
                  const daysLeft = getDaysLeft(item.closing_date);
                  const deadlineColor = getDeadlineColor(daysLeft);
                  const targetUrl = `/tenders/${item.tender_id}`;

                  const stageIdx = item.stage !== undefined ? item.stage : getStageFromStatus(item.status_label);

                  const isEditing = editingId === item.tender_id;

                  const brandColor = getBrandColor(item.brand_name);
                  const companyDetails = getCompanyDetailsByBrand(item.brand_name);
                  const fullCompanyName = companyDetails?.companyName || item.brand_name;

                  const extension = extensionStatuses[item.tender_id];
                  const hasPendingExtension = extension && extension.status === "Pending";
                  const extensionId = extension?.id;

                  let deadlineText = "No deadline";
                  if (daysLeft !== null) {
                    if (daysLeft === 0) deadlineText = "Deadline passed";
                    else if (daysLeft === 1) deadlineText = "1 day left";
                    else deadlineText = `${daysLeft} days left`;
                  }

                  return (
                    <tr
                      key={item.tender_id}
                      className={`hover:bg-slate-50 transition ${
                        isEditing ? "bg-blue-50" : ""
                      }`}
                    >
                      {/* Tender Name - Centered with brand color */}
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                        <div className="flex flex-col items-center">
                          <Link
                            href={targetUrl}
                            className="font-medium text-slate-900 hover:text-blue-600 transition text-xs sm:text-sm"
                          >
                            {item.tender_name}
                          </Link>
                          <span
                            className="text-[9px] sm:text-xs font-medium mt-0.5"
                            style={{ color: brandColor.borderColor }}
                          >
                            {fullCompanyName}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInterestModalTender(item);
                              }}
                              className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-medium transition ${
                                item.interest_count
                                  ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}
                            >
                              <Users className="w-2.5 h-2.5" />
                              {item.interest_count ? `${item.interest_count} interested` : "No interest yet"}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Branch - Centered */}
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-slate-700 text-[10px] sm:text-xs">
                        {item.branch_name}
                      </td>

                      {/* Building - Centered */}
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-slate-700 text-[10px] sm:text-xs">
                        {item.building_name || "—"}
                      </td>

                      {/* Renovation Period - Centered */}
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center min-w-[140px] sm:min-w-[180px]">
                        {isEditing ? (
                          <div className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col xs:flex-row items-center gap-0.5 xs:gap-1">
                              <span className="text-[8px] xs:text-[10px] text-slate-500">From:</span>
                              <input
                                type="date"
                                value={editStart}
                                onChange={(e) => setEditStart(e.target.value)}
                                className="w-20 xs:w-24 sm:w-28 border border-slate-300 rounded px-0.5 xs:px-1 py-0.5 bg-white text-slate-900 text-[10px] xs:text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div className="flex flex-col xs:flex-row items-center gap-0.5 xs:gap-1">
                              <span className="text-[8px] xs:text-[10px] text-slate-500">To:</span>
                              <input
                                type="date"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className="w-20 xs:w-24 sm:w-28 border border-slate-300 rounded px-0.5 xs:px-1 py-0.5 bg-white text-slate-900 text-[10px] xs:text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div className="flex gap-1 mt-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  saveEdit(item);
                                }}
                                disabled={saving}
                                className="px-1.5 sm:px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[8px] xs:text-[10px] transition disabled:opacity-50"
                              >
                                {saving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelEdit();
                                }}
                                className="px-1.5 sm:px-2 py-0.5 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded text-[8px] xs:text-[10px] transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] xs:text-xs text-slate-700">
                            {formatDate(item.renovation_start_date)} – {formatDate(item.renovation_end_date)}
                          </span>
                        )}
                      </td>

                      {/* Actions - Centered with improved dropdown */}
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center relative overflow-visible">
                        <div className="flex items-center justify-center gap-1 sm:gap-2">
                          {isAdmin && hasPendingExtension && extensionId && (
                            <Link
                              href={`/admin/tenders/${item.tender_id}/extensions/${extensionId}`}
                              className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 text-amber-800 text-[8px] sm:text-[9px] font-medium rounded border border-amber-200 hover:bg-amber-200 transition whitespace-nowrap"
                            >
                              <span className="animate-pulse">⏳</span>
                              <span className="hidden sm:inline">Extension</span>
                              <span className="sm:hidden">Ext</span>
                            </Link>
                          )}

                          {(isAdmin || canManageStage || (isContractor && item.status_label === "Open")) && (
                            <DropdownActions
                              trigger={
                                <button className="p-0.5 sm:p-1 rounded-md hover:bg-slate-100 transition">
                                  <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
                                </button>
                              }
                            >
                              {isAdmin && !isEditing && (
                                <>
                                  <div className="px-2 sm:px-3 py-0.5 text-[8px] sm:text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Tender Management
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(item);
                                    }}
                                    className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                                  >
                                    <Edit className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Edit Dates
                                  </button>
                                  <Link
                                    href={`/admin/tenders/${item.tender_id}/bq-template`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                                  >
                                    <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> BQ Template
                                  </Link>
                                  <Link
                                    href={`/tenders/${item.tender_id}/submissions`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                                  >
                                    <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Submissions
                                  </Link>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInterestModalTender(item);
                                    }}
                                    className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                                  >
                                    <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                    View Interest {item.interest_count ? `(${item.interest_count})` : ""}
                                  </button>
                                  {canManageStage && <hr className="my-1 border-slate-200" />}
                                </>
                              )}

                              {canManageStage && !isEditing && (
                                <>
                                  <div className="px-2 sm:px-3 py-0.5 text-[8px] sm:text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Stage Management
                                  </div>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (stageIdx === 2) {
                                        setAwardModalTender(item);
                                        return;
                                      }
                                      try {
                                        const res = await fetch(`/api/tenders/${item.tender_id}/stage`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ action: 'advance' }),
                                        });
                                        if (!res.ok) {
                                          const err = await res.json();
                                          toast.error(err.error || "Unable to advance the stage.");
                                        } else {
                                          toast.success("The stage was advanced successfully.");
                                          fetchTenders();
                                        }
                                      } catch {
                                        toast.error("Could not connect to the server. Try again later.");
                                      }
                                    }}
                                    disabled={stageIdx >= 3}
                                    className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                    {stageIdx === 0 ? "Open Tender" : stageIdx === 1 ? "Close Tender" : stageIdx === 2 ? "Award Tender" : "Advance"}
                                  </button>
                                </>
                              )}

                              {isContractor && item.status_label === "Open" && !isEditing && (
                                <>
                                  <div className="px-2 sm:px-3 py-0.5 text-[8px] sm:text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Contractor Actions
                                  </div>
                                  <Link
                                    href={targetUrl}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                                  >
                                    <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> View Details
                                  </Link>
                                  {item.has_expressed_interest ? (
                                    <div className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-emerald-600 flex items-center gap-1.5">
                                      <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Interest Registered
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        registerInterest(item);
                                      }}
                                      disabled={applyingInterestId === item.tender_id}
                                      className="w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      <UserPlus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                      {applyingInterestId === item.tender_id ? "Registering…" : "Register Interest"}
                                    </button>
                                  )}
                                </>
                              )}

                            </DropdownActions>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ========== PAGINATION ========== */}
        {totalPages > 1 && (
          <div className="mt-4 sm:mt-6 flex flex-wrap justify-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 sm:px-3 py-1 rounded bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm disabled:opacity-40 hover:bg-slate-50 transition"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = page;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-xs sm:text-sm ${
                    p === page
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 sm:px-3 py-1 rounded bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm disabled:opacity-40 hover:bg-slate-50 transition"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {interestModalTender && (
        <TenderInterestModal
          tenderId={interestModalTender.tender_id}
          tenderName={interestModalTender.tender_name}
          onClose={() => setInterestModalTender(null)}
        />
      )}

      {awardModalTender && (
        <AwardTenderModal
          tenderId={awardModalTender.tender_id}
          tenderName={awardModalTender.tender_name}
          onClose={() => setAwardModalTender(null)}
          onAwarded={fetchTenders}
        />
      )}
    </div>
  );
}