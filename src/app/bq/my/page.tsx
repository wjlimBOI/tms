"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { getBQStatusBadgeStyle, getBQStatusLabel } from "@/lib/statusColors";
import { getBrandColor } from "@/lib/brandColors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Search, Download, Printer, ChevronDown, Eye, Pencil, Plus, X } from "lucide-react";

interface Submission {
  submission_id: number;
  tender_id?: number;
  contractor_id: number;
  round_no?: number;
  version_name?: string;
  status: string;
  updated_at: string;
  created_at: string;
  bq_date?: string;
  area_size?: string;
  client_name: string;
  job_site: string;
  work_type: string;
  can_edit: boolean;
  bq_name: string;
  tender_name?: string;
}

interface LineItem {
  line_item_id: number;
  item_no: string;
  description: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  discount: number | string;
  amount: number | string;
  category_name?: string;
}

interface SubmissionDetail {
  submission: any;
  items: LineItem[];
  categories: any[];
  canEdit: boolean;
}

const ROLE_CONTRACTOR = 13;
const ROLE_ADMIN = 1;
const ITEMS_PER_PAGE = 12;

// Helper: convert any value to a number, default 0
const toNumber = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export default function BQWorkspacePage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);

  // Filters
  const [clientFilter, setClientFilter] = useState(searchParams.get("client") || "");
  const [jobSiteFilter, setJobSiteFilter] = useState(searchParams.get("jobSite") || "");
  const [workTypeFilter, setWorkTypeFilter] = useState(searchParams.get("workType") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const from = searchParams.get("fromDate");
    return from ? new Date(from) : null;
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    const to = searchParams.get("toDate");
    return to ? new Date(to) : null;
  });

  const handleDebouncedSearch = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setter(value);
      setCurrentPage(1);
    }, 400);
  };

  const updateUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (clientFilter) params.set("client", clientFilter);
    if (jobSiteFilter) params.set("jobSite", jobSiteFilter);
    if (workTypeFilter) params.set("workType", workTypeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (startDate) params.set("fromDate", format(startDate, "yyyy-MM-dd"));
    if (endDate) params.set("toDate", format(endDate, "yyyy-MM-dd"));
    if (currentPage > 1) params.set("page", currentPage.toString());
    router.replace(`/bq/my?${params.toString()}`, { scroll: false });
  }, [clientFilter, jobSiteFilter, workTypeFilter, statusFilter, startDate, endDate, currentPage, router]);

  useEffect(() => {
    updateUrl();
  }, [updateUrl]);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (clientFilter) query.set("client", clientFilter);
    if (jobSiteFilter) query.set("jobSite", jobSiteFilter);
    if (workTypeFilter) query.set("workType", workTypeFilter);
    if (statusFilter) query.set("status", statusFilter);
    if (startDate) query.set("fromDate", format(startDate, "yyyy-MM-dd"));
    if (endDate) query.set("toDate", format(endDate, "yyyy-MM-dd"));
    query.set("page", currentPage.toString());
    query.set("limit", ITEMS_PER_PAGE.toString());

    try {
      const res = await fetch(`/api/bq/my-submissions?${query.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch BQ submissions");
      const data = await res.json();
      setSubmissions(data.data || []);
      setTotalItems(data.total || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error(err);
      setError("Could not load submissions. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [clientFilter, jobSiteFilter, workTypeFilter, statusFilter, startDate, endDate, currentPage]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user) {
      fetchSubmissions();
    }
  }, [session, sessionStatus, router, fetchSubmissions]);

  // Fetch detailed BQ when a submission is selected
  useEffect(() => {
    if (!selectedSubmissionId) {
      setSelectedDetail(null);
      return;
    }
    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/bq/${selectedSubmissionId}`);
        if (!res.ok) throw new Error("Failed to fetch BQ details");
        const data = await res.json();
        setSelectedDetail({
          submission: data.submission,
          items: data.items || [],
          categories: data.categories || [],
          canEdit: data.canEdit || false,
        });
      } catch (err) {
        console.error(err);
        setSelectedDetail(null);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selectedSubmissionId]);

  const clearFilters = () => {
    setClientFilter("");
    setJobSiteFilter("");
    setWorkTypeFilter("");
    setStatusFilter("");
    setStartDate(null);
    setEndDate(null);
    setCurrentPage(1);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "dd MMM yyyy");
    } catch {
      return "Invalid date";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const userRoleId = (session?.user as any)?.role_id;
  const canCreate = userRoleId === ROLE_CONTRACTOR || userRoleId === ROLE_ADMIN;

  const selectedSubmission = submissions.find(s => s.submission_id === selectedSubmissionId);
  const filteredItems = selectedDetail?.items.filter(
    (item) =>
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.item_no.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];
  
  // Convert numeric fields safely for display
  const safeItems = filteredItems.map(item => ({
    ...item,
    quantity: toNumber(item.quantity),
    unit_price: toNumber(item.unit_price),
    amount: toNumber(item.amount),
  }));
  const totalCost = safeItems.reduce((sum, item) => sum + item.amount, 0);

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="w-10 h-10 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="bg-rose-50/80 dark:bg-rose-900/20 backdrop-blur-sm border border-rose-200 dark:border-rose-800 rounded-xl p-8 text-center shadow-sm">
          <p className="text-rose-800 dark:text-rose-200">{error}</p>
          <Button onClick={fetchSubmissions} variant="default" className="mt-4 bg-rose-600 hover:bg-rose-700 text-white">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-4 border-b border-slate-200/50 dark:border-slate-800/50 pb-4">
          <div className="animate-fade-in-up">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
              Bill of Quantities
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {selectedDetail?.submission?.bq_name
                ? `${selectedDetail.submission.bq_name} – ${selectedDetail.submission.client_name_override || selectedDetail.submission.brand_name || "—"}`
                : 'Select a BQ submission to view line items'}
            </p>
          </div>
          <div className="flex gap-2 animate-fade-in">
            {selectedDetail && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => window.open(`/api/bq/export?submissionId=${selectedSubmissionId}`, "_blank")}
                >
                  <Download className="h-4 w-4" /> Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => window.open(`/bq/${selectedSubmissionId}/view?print=1`, "_blank")}
                >
                  <Printer className="h-4 w-4" /> Print
                </Button>
                {selectedDetail.canEdit && (
                  <Link href={`/bq/${selectedSubmissionId}/edit`}>
                    <Button variant="default" size="sm" className="gap-1 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 text-white shadow-sm transition-all hover:-translate-y-0.5">
                      <Pencil className="h-4 w-4" /> Edit BQ
                    </Button>
                  </Link>
                )}
              </>
            )}
            {canCreate && !selectedDetail && (
              <Link href="/bq/new" className="inline-block">
                <Button variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all hover:-translate-y-0.5">
                  <Plus className="h-4 w-4" /> New BQ
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Filter Section (unchanged) */}
        <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm transition-all duration-300">
          <button
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className="w-full flex justify-between items-center p-4 text-left"
          >
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filters</span>
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isFiltersOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isFiltersOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="p-4 pt-0 border-t border-slate-200/50 dark:border-slate-800/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Client</label>
                  <input
                    type="text"
                    placeholder="Search by client"
                    defaultValue={clientFilter}
                    onChange={(e) => handleDebouncedSearch(setClientFilter)(e.target.value)}
                    className="w-full bg-white/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Job Site</label>
                  <input
                    type="text"
                    placeholder="Search by branch"
                    defaultValue={jobSiteFilter}
                    onChange={(e) => handleDebouncedSearch(setJobSiteFilter)(e.target.value)}
                    className="w-full bg-white/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Work Type</label>
                  <input
                    type="text"
                    placeholder="e.g., Renovation"
                    defaultValue={workTypeFilter}
                    onChange={(e) => handleDebouncedSearch(setWorkTypeFilter)(e.target.value)}
                    className="w-full bg-white/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full bg-white/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <DateRangePicker
                  label="BQ Date Range"
                  startDate={startDate}
                  endDate={endDate}
                  onRangeChange={({ start, end }) => { setStartDate(start); setEndDate(end); setCurrentPage(1); }}
                  placeholder="Select date range"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button 
                  onClick={() => { setCurrentPage(1); fetchSubmissions(); }} 
                  variant="default" 
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all hover:-translate-y-0.5"
                >
                  Apply Filters
                </Button>
                <Button variant="outline" onClick={clearFilters} className="text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Clear</Button>
              </div>
            </div>
          </div>
        </div>

        {/* Two‑column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Submissions List (unchanged) */}
          <div className="lg:col-span-1 space-y-3">
            {loading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-32 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl backdrop-blur-sm" />
                ))}
              </div>
            ) : submissions.length === 0 ? (
              <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-200/50 dark:border-slate-800/50 p-8 text-center">
                <p className="text-slate-500 dark:text-slate-400">No submissions found</p>
                {canCreate && (
                  <Link href="/bq/new" className="inline-block mt-3 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">
                    Create your first BQ
                  </Link>
                )}
              </div>
            ) : (
              submissions.map((sub, idx) => {
                const brandColor = getBrandColor(sub.client_name);
                const statusBadgeClass = getBQStatusBadgeStyle(sub.status);
                const statusLabel = getBQStatusLabel(sub.status);
                const isSelected = selectedSubmissionId === sub.submission_id;
                return (
                  <div
                    key={sub.submission_id}
                    onClick={() => setSelectedSubmissionId(sub.submission_id)}
                    className={`group relative cursor-pointer rounded-xl border transition-all duration-300 transform ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30 shadow-md scale-[1.02]'
                        : 'border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm hover:shadow-md hover:-translate-y-1'
                    }`}
                    style={{ borderLeftWidth: '4px', borderLeftColor: brandColor.borderColor }}
                  >
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-cyan-700 dark:group-hover:text-cyan-300 transition-colors">
                          {sub.bq_name}
                        </h3>
                        <Badge variant="secondary" className={statusBadgeClass}>{statusLabel}</Badge>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{sub.client_name} – {sub.job_site}</p>
                      <p className="text-xs text-slate-400 mt-2">BQ Date: {formatDate(sub.bq_date)}</p>
                      <div className="flex gap-3 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Link href={`/bq/${sub.submission_id}/view`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                          <Eye className="h-3 w-3" /> View
                        </Link>
                        {sub.can_edit && (
                          <Link href={`/bq/${sub.submission_id}/edit`} className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1">
                            <Pencil className="h-3 w-3" /> Edit
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Prev
                </button>
                <span className="px-3 py-1 text-sm text-slate-600 dark:text-slate-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Right: Detailed BQ Table */}
          <div className="lg:col-span-2">
            {selectedDetail ? (
              <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm overflow-hidden transition-all duration-500 animate-fade-in">
                <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Line Items</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Detailed breakdown</p>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Search items..."
                      className="pl-8 bg-white/50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-cyan-500 transition"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {detailLoading ? (
                  <div className="p-8 text-center">
                    <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-slate-500">Loading items...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm sticky top-0">
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Item No.</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Description</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Qty</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Unit</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Unit Price ($)</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Total ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {safeItems.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No items match your search.</td>
                          </tr>
                        ) : (
                          safeItems.map((item, idx) => (
                            <tr
                              key={item.line_item_id}
                              className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all duration-200"
                              style={{ animationDelay: `${idx * 30}ms` }}
                            >
                              <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{item.item_no}</td>
                              <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{item.description}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{item.quantity.toLocaleString()}</td>
                              <td className="px-4 py-3 text-left text-slate-500 dark:text-slate-400">{item.unit}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{item.unit_price.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">{item.amount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm border-t-2 border-slate-300 dark:border-slate-700">
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">Total Estimated Cost</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white text-lg">{formatCurrency(totalCost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-200/50 dark:border-slate-800/50 p-12 text-center transition-all duration-300">
                <div className="space-y-3">
                  <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                    <Eye className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">Select a BQ submission from the list to view its bill of quantities.</p>
                  {canCreate && (
                    <Link href="/bq/new" className="inline-block mt-2 text-sm text-cyan-600 dark:text-cyan-400 hover:underline flex items-center justify-center gap-1">
                      <Plus className="h-4 w-4" /> Create new BQ
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}