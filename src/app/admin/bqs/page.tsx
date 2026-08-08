"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getBQStatusStyles, getBQStatusLabel } from "@/lib/statusColors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useNotify } from "@/components/ui/notification-provider";

// ------------------------- Types ---------------------------------
interface Tender {
  tender_id: number;
  tender_name: string;
  status_label: string;
  branch_name: string;
  brand_name: string;
}

interface BQ {
  submission_id: number;
  round_no: number;
  version_name?: string;
  status: string;
  updated_at: string;
  created_at: string;
  bq_date?: string;
  area_size?: string;
  client_name: string;
  job_site: string;
  work_type: string;
  contractor_username: string;
  bq_name?: string;
  total_cost?: number;
}

interface BQDetail {
  submission: any;
  categories: any[];
  items: Array<{
    line_item_id: number;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    amount: number;
    item_no?: string;
  }>;
  canEdit: boolean;
}

// ------------------------- Helper: format currency -----------------
const formatCurrency = (value?: number) => {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
};

// ------------------------- Detail Drawer -----------------
const DetailDrawer = ({ isOpen, onClose, bq, bqDetail, loading, onSetStatus }: { isOpen: boolean; onClose: () => void; bq: BQ | null; bqDetail: BQDetail | null; loading: boolean; onSetStatus: (submissionId: number, status: "approved" | "rejected" | "revert") => void }) => {
  if (!bq) return null;
  const totalFromItems = bqDetail?.items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[480px] lg:w-[560px] bg-white/95 backdrop-blur-xl shadow-2xl z-50 border-l border-white/20 flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">BQ Details</h2>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 transition">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {loading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-32 bg-gray-200 rounded" />
                </div>
              ) : bqDetail ? (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getBQStatusStyles(bqDetail.submission.status).bg} ${getBQStatusStyles(bqDetail.submission.status).text}`}>
                        {getBQStatusLabel(bqDetail.submission.status)}
                      </span>
                      <span className="text-xs text-gray-500">#{bqDetail.submission.submission_id}</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">{bqDetail.submission.bq_name || bqDetail.submission.version_name || `BQ #${bqDetail.submission.submission_id}`}</h3>
                    <p className="text-sm text-gray-500 mt-1">{bqDetail.submission.job_site || bq.job_site} • {bq.contractor_username}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">Total Cost</p>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(totalFromItems)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">Area</p>
                      <p className="text-lg font-semibold text-gray-900">{bq.area_size || "—"}</p>
                    </div>
                  </div>

                  {bqDetail.items && bqDetail.items.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Bill of Quantities</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead className="border-b border-gray-200">
                            <tr>
                              <th className="text-left py-2">Item</th>
                              <th className="text-left py-2">Description</th>
                              <th className="text-right py-2">Qty</th>
                              <th className="text-right py-2">Rate</th>
                              <th className="text-right py-2">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bqDetail.items.map((item) => (
                              <tr key={item.line_item_id} className="border-b border-gray-100">
                                <td className="py-2 text-gray-500">{item.item_no || "—"}</td>
                                <td className="py-2 text-gray-700">{item.description}</td>
                                <td className="text-right py-2">{item.quantity} {item.unit}</td>
                                <td className="text-right py-2">{formatCurrency(item.unit_price)}</td>
                                <td className="text-right py-2">{formatCurrency(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-gray-500">Failed to load details.</p>
              )}
            </div>
            {bqDetail && (
              <div className="p-5 border-t border-gray-200 flex items-center justify-end gap-2">
                {bqDetail.submission.status === "Submitted" && (
                  <>
                    <button
                      onClick={() => onSetStatus(bqDetail.submission.submission_id, "rejected")}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => onSetStatus(bqDetail.submission.submission_id, "approved")}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition"
                    >
                      Approve
                    </button>
                  </>
                )}
                {(bqDetail.submission.status === "Approved" || bqDetail.submission.status === "Rejected") && (
                  <button
                    onClick={() => onSetStatus(bqDetail.submission.submission_id, "revert")}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition"
                  >
                    Revert to Submitted
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ------------------------- Collapsible Group -----------------
const CollapsibleGroup = ({ title, status, count, children, defaultOpen = true }: { title: string; status: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const statusStyles = getBQStatusStyles(status);

  return (
    <div className="mb-4 rounded-xl border border-gray-200 overflow-hidden bg-white/40 backdrop-blur-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyles.bg} ${statusStyles.text} ${statusStyles.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyles.dot}`} />
            {title}
          </span>
          <span className="text-sm text-gray-500">{count} BQ{count !== 1 ? 's' : ''}</span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-200">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ------------------------- Loading Skeleton -----------------
const LoadingSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-12 bg-gray-200 rounded-xl w-full max-w-md" />
    <div className="h-64 bg-gray-200 rounded-2xl" />
  </div>
);

// ------------------------- Main Page Component -----------------
export default function AdminTenderBQsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useNotify();

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Draft" | "Submitted" | "Approved" | "Rejected">("All");
  const [bqs, setBqs] = useState<BQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTenders, setLoadingTenders] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBq, setSelectedBq] = useState<BQ | null>(null);
  const [bqDetail, setBqDetail] = useState<BQDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Tender dropdown state
  const [tenderDropdownOpen, setTenderDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);


  // ------------------------- Fetch Tenders -----------------
  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!session || (session.user as any)?.role_id !== 1) {
      router.push("/");
      return;
    }
    const fetchTenders = async () => {
      try {
        const res = await fetch("/api/admin/tenders");
        if (!res.ok) throw new Error("Failed to fetch tenders");
        const data = await res.json();
        setTenders(data);
        if (data.length > 0) setSelectedTenderId(data[0].tender_id);
      } catch (err) {
        setError("Could not load tenders.");
      } finally {
        setLoadingTenders(false);
      }
    };
    fetchTenders();
  }, [session, sessionStatus, router]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setTenderDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ------------------------- Fetch BQs when tender changes -----------------
  useEffect(() => {
    if (selectedTenderId) fetchBQs();
  }, [selectedTenderId]);

  const fetchBQs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenders/${selectedTenderId}/bqs`);
      if (!res.ok) throw new Error("Failed to load BQs");
      const allBqs = await res.json();
      const filtered = allBqs.filter((bq: BQ) =>
        ["Draft", "Submitted", "Approved", "Rejected"].includes(bq.status)
      );
      setBqs(filtered);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter BQs based on status filter and search term
  const filteredBqs = useMemo(() => {
    let filtered = bqs;
    if (statusFilter !== "All") {
      filtered = filtered.filter(bq => bq.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(bq =>
        getBQDisplayName(bq).toLowerCase().includes(term) ||
        bq.contractor_username.toLowerCase().includes(term) ||
        bq.job_site.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [bqs, statusFilter, searchTerm]);

  const groupedBqs = filteredBqs.reduce((acc, bq) => {
    acc[bq.status] = acc[bq.status] || [];
    acc[bq.status].push(bq);
    return acc;
  }, {} as Record<string, BQ[]>);

  // ------------------------- Delete BQ -----------------
  const confirmDelete = async (submissionId: number) => {
    const proceed = await confirm({
      title: "Delete Bill of Quantity",
      description: `Are you sure you want to delete BQ #${submissionId}? This action cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!proceed) return;

    try {
      const res = await fetch(`/api/admin/bqs/${submissionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setBqs(prev => prev.filter(bq => bq.submission_id !== submissionId));
      toast.success(`BQ #${submissionId} has been deleted.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ------------------------- Open Drawer & Fetch Full Details -----------------
  const openDrawer = async (bq: BQ) => {
    setSelectedBq(bq);
    setDrawerOpen(true);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/bq/${bq.submission_id}`);
      if (!res.ok) throw new Error("Failed to load details");
      const data = await res.json();
      setBqDetail(data);
    } catch (err) {
      console.error(err);
      setBqDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // ------------------------- Approve / Reject / Revert -----------------
  const setBqStatus = async (submissionId: number, status: "approved" | "rejected" | "revert") => {
    const labels = { approved: "approve", rejected: "reject", revert: "revert this BQ back to Submitted" };
    const proceed = await confirm({
      title: status === "approved" ? "Approve BQ" : status === "rejected" ? "Reject BQ" : "Revert BQ",
      description: `Are you sure you want to ${labels[status]}?`,
      confirmText: status === "rejected" ? "Reject" : status === "approved" ? "Approve" : "Revert",
      variant: status === "rejected" ? "destructive" : "default",
    });
    if (!proceed) return;

    try {
      const res = await fetch(`/api/bq/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      toast.success(`BQ #${submissionId} is now ${data.status}.`);
      await fetchBQs();
      if (selectedBq?.submission_id === submissionId) await openDrawer({ ...selectedBq, status: data.status });
    } catch (err: any) {
      toast.error(err.message || "Could not update BQ status");
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedBq(null);
    setBqDetail(null);
  };

  // ------------------------- Helpers -----------------
  const formatShortDate = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleDateString() : "—";
  const formatDateTime = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleString() : "—";
  const getBQDisplayName = (bq: BQ) => bq.bq_name || bq.version_name || `BQ #${bq.submission_id}`;

  const selectedTender = tenders.find(t => t.tender_id === selectedTenderId);

  if (sessionStatus === "loading" || loadingTenders) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => router.push("/admin/bq-by-tender")} />;

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Animated background blobs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[35vw] max-w-[540px] max-h-[280px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative z-10 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header & Custom Tender Selector */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">BQs</h1>
                <p className="text-sm text-gray-500 mt-1">Manage and audit Bills of Quantities across tenders</p>
              </div>
              <div className="w-full sm:w-72" ref={dropdownRef}>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Tender</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTenderDropdownOpen(!tenderDropdownOpen)}
                    className="w-full rounded-lg border border-gray-300 bg-white/80 backdrop-blur-sm px-3 py-1.5 text-left text-gray-900 focus:ring-2 focus:ring-cyan-500/50 transition flex items-center justify-between shadow-sm text-sm"
                  >
                    <span className="flex-1 pr-2 truncate" title={selectedTender ? `${selectedTender.tender_name} — ${selectedTender.branch_name} (${selectedTender.brand_name})` : ""}>
                      {selectedTender
                        ? `${selectedTender.tender_name || `Tender #${selectedTender.tender_id}`} — ${selectedTender.branch_name} (${selectedTender.brand_name})`
                        : "Select a tender"}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${tenderDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {tenderDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {tenders.map((tender) => (
                        <button
                          key={tender.tender_id}
                          onClick={() => {
                            setSelectedTenderId(tender.tender_id);
                            setTenderDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition whitespace-normal break-words"
                        >
                          {tender.tender_name || `Tender #${tender.tender_id}`} — {tender.branch_name} ({tender.brand_name})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Status Filter & Search */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter("All")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    statusFilter === "All"
                      ? "bg-cyan-600 text-white shadow-md"
                      : "bg-white/60 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter("Draft")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    statusFilter === "Draft"
                      ? "bg-amber-600 text-white shadow-md"
                      : "bg-white/60 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() => setStatusFilter("Submitted")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    statusFilter === "Submitted"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "bg-white/60 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Submitted
                </button>
                <button
                  onClick={() => setStatusFilter("Approved")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    statusFilter === "Approved"
                      ? "bg-teal-600 text-white shadow-md"
                      : "bg-white/60 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Approved
                </button>
                <button
                  onClick={() => setStatusFilter("Rejected")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    statusFilter === "Rejected"
                      ? "bg-rose-600 text-white shadow-md"
                      : "bg-white/60 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Rejected
                </button>
              </div>
              <div className="flex-1">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by BQ name, contractor, or location..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white/70 backdrop-blur-sm pl-9 pr-4 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* BQ Workspace */}
          {loading ? (
            <LoadingSkeleton />
          ) : filteredBqs.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-white/40 backdrop-blur-sm rounded-2xl border border-dashed border-gray-300">
              <p className="text-gray-500">No BQs match your filters.</p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {["Draft", "Submitted", "Approved", "Rejected"].map((status) => {
                const statusBQs = groupedBqs[status] || [];
                if (statusBQs.length === 0) return null;
                return (
                  <CollapsibleGroup key={status} title={getBQStatusLabel(status)} status={status} count={statusBQs.length} defaultOpen={status === "Submitted"}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50/50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">ID</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">BQ Name / Location</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Contractor</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Version</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Total Cost</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Last Updated</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statusBQs.map((bq) => (
                            <motion.tr
                              key={bq.submission_id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
                              className="border-b border-gray-200 cursor-pointer group"
                              onClick={() => openDrawer(bq)}
                            >
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">{bq.submission_id}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="text-gray-700 font-medium break-words" title={getBQDisplayName(bq)}>
                                    {getBQDisplayName(bq)}
                                  </span>
                                  <span className="text-xs text-gray-400 mt-0.5 break-words" title={bq.job_site}>
                                    {bq.job_site}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{bq.contractor_username}</td>
                              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{bq.version_name || `Round ${bq.round_no}`}</td>
                              <td className="px-4 py-3 font-mono text-gray-900 whitespace-nowrap">{formatCurrency(bq.total_cost)}</td>
                              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatShortDate(bq.bq_date)}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(bq.updated_at)}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openDrawer(bq); }}
                                    className="bg-cyan-100 text-cyan-800 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-cyan-200 transition whitespace-nowrap"
                                  >
                                    Inspect
                                  </button>
                                  {bq.status === "Submitted" && (
                                    <>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setBqStatus(bq.submission_id, "approved"); }}
                                        className="bg-teal-100 text-teal-800 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-teal-200 transition whitespace-nowrap"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setBqStatus(bq.submission_id, "rejected"); }}
                                        className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-amber-200 transition whitespace-nowrap"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {(bq.status === "Approved" || bq.status === "Rejected") && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setBqStatus(bq.submission_id, "revert"); }}
                                      className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-gray-200 transition whitespace-nowrap"
                                    >
                                      Revert
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); confirmDelete(bq.submission_id); }}
                                    className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-rose-200 transition whitespace-nowrap"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleGroup>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <DetailDrawer isOpen={drawerOpen} onClose={closeDrawer} bq={selectedBq} bqDetail={bqDetail} loading={loadingDetail} onSetStatus={setBqStatus} />
    </div>
  );
}

// ------------------------- Error State -----------------
const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
    <div className="bg-red-100 border border-red-300 rounded-2xl p-8 text-center max-w-md">
      <p className="text-red-700">{message}</p>
      <button onClick={onRetry} className="mt-4 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition">
        Back to Tenders
      </button>
    </div>
  </div>
);

