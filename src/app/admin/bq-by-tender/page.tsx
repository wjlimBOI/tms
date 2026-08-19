"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getBQStatusStyles, getBQStatusLabel } from "@/lib/statusColors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useNotify } from "@/components/ui/notification-provider";
import { isSuperUser } from "@/lib/roles";

interface Tender {
  tender_id: number;
  tender_name: string;
  tender_description: string;
  branch_name: string;
  brand_name: string;
  renovation_type: string;
  status_label: string;
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
  line_item_count: number;
  contractor_id: number;
  contractor_username: string;
  bq_name?: string;
  total_amount?: number;
}

export default function AdminBQByTenderPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const confirmDialog = useConfirm();
  const toast = useNotify();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [bqsMap, setBqsMap] = useState<Record<number, BQ[]>>({});
  const [expandedTender, setExpandedTender] = useState<number | null>(null);
  const [loadingTenders, setLoadingTenders] = useState(true);
  const [loadingBQs, setLoadingBQs] = useState<Record<number, boolean>>({});
  const [deletingBqId, setDeletingBqId] = useState<number | null>(null);
  const [tenderError, setTenderError] = useState<string | null>(null);

  const isDeletingRef = useRef(false);

  // Use the main /api/tenders endpoint which is known to work with pagination
  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!session || !isSuperUser((session.user as any)?.roleIds || [])) {
      router.push("/");
      return;
    }

    const fetchTenders = async () => {
      setLoadingTenders(true);
      setTenderError(null);
      try {
        // Use the main tenders endpoint (not /admin/tenders) to avoid validation issues
        const res = await fetch("/api/tenders?page=1&limit=100", {
          credentials: "include",
        });

        if (!res.ok) {
          let errorMsg = `HTTP ${res.status}`;
          try {
            const errorData = await res.json();
            errorMsg = errorData.error || errorData.message || errorMsg;
          } catch {
            // ignore
          }
          throw new Error(errorMsg);
        }

        const data = await res.json();
        // The API returns { data: [...], total, page, limit }
        setTenders(data.data || []);
      } catch (err: any) {
        console.error("Failed to load tenders:", err);
        const message = err.message || "Failed to load tenders";
        setTenderError(message);
        toast.error(message);
      } finally {
        setLoadingTenders(false);
      }
    };

    fetchTenders();
  }, [session, sessionStatus, router, toast]);

  const fetchBQsForTender = async (tenderId: number, force = false) => {
    if (!force && bqsMap[tenderId]) return;
    setLoadingBQs(prev => ({ ...prev, [tenderId]: true }));
    try {
      const res = await fetch(`/api/admin/tenders/${tenderId}/bqs`, {
        credentials: "include",
      });
      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch {
          // ignore
        }
        throw new Error(errorMsg);
      }
      const data = await res.json();
      const bqArray = Array.isArray(data) ? data : [];
      const filteredBqs = bqArray.filter((bq: BQ) => 
        bq.status === 'Draft' || bq.status === 'Submitted'
      );
      setBqsMap(prev => ({ ...prev, [tenderId]: filteredBqs }));
    } catch (err: any) {
      console.error(`Error loading BQs for tender ${tenderId}:`, err);
      toast.error(err.message || "Failed to load BQs for this tender");
      setBqsMap(prev => ({ ...prev, [tenderId]: [] }));
    } finally {
      setLoadingBQs(prev => ({ ...prev, [tenderId]: false }));
    }
  };

  const toggleTender = (tenderId: number) => {
    if (expandedTender === tenderId) {
      setExpandedTender(null);
    } else {
      setExpandedTender(tenderId);
      fetchBQsForTender(tenderId);
    }
  };

  const getBQDisplayName = (bq: BQ): string => {
    if (bq.bq_name) return bq.bq_name;
    if (bq.version_name) return bq.version_name;
    return `BQ #${bq.submission_id}`;
  };

  const performDelete = async (bq: BQ, tenderId: number) => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;
    setDeletingBqId(bq.submission_id);

    try {
      const res = await fetch(`/api/admin/bqs/${bq.submission_id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch {
          // keep errorMsg
        }
        throw new Error(errorMsg);
      }

      await fetchBQsForTender(tenderId, true);

      toast.success(`BQ "${getBQDisplayName(bq)}" has been deleted.`);
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(err.message || "Something went wrong while deleting the BQ.");
    } finally {
      isDeletingRef.current = false;
      setDeletingBqId(null);
    }
  };

  const confirmDelete = async (bq: BQ, tenderId: number) => {
    if (isDeletingRef.current) return;
    const proceed = await confirmDialog({
      title: "Confirm Delete",
      description: `Are you sure you want to delete "${getBQDisplayName(bq)}"? This action cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!proceed) return;
    performDelete(bq, tenderId);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  };

  const formatShortDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return "—";
    const abs = Math.abs(amount);
    const formatted = abs.toFixed(2);
    if (amount < 0) {
      return `($ ${formatted})`;
    }
    return `$ ${formatted}`;
  };

  const getContractorLetterMap = (bqs: BQ[]): Map<number, string> => {
    const uniqueContractors = bqs
      .filter((bq, index, self) => self.findIndex(b => b.contractor_id === bq.contractor_id) === index);
    
    const map = new Map<number, string>();
    uniqueContractors.forEach((bq) => {
      const id = bq.contractor_id;
      const letter = String.fromCharCode(65 + (id % 26));
      map.set(id, `Contractor ${letter}`);
    });
    return map;
  };

  if (sessionStatus === "loading" || loadingTenders) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading tenders…</p>
        </div>
      </div>
    );
  }

  if (tenderError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="bg-white rounded-xl border border-red-200 p-6 max-w-md text-center shadow-sm">
          <div className="text-red-600 text-lg font-semibold mb-2">Unable to load tenders</div>
          <p className="text-gray-600 text-sm">{tenderError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-[#15406a] hover:bg-[#0d2d4a] text-white rounded-md transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 py-6 px-4 sm:px-6 lg:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              BQs by Tender
            </h1>
          </div>
          <div className="text-sm text-gray-500">
            {tenders.length} {tenders.length === 1 ? 'tender' : 'tenders'} found
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {tenders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <div className="text-gray-500 text-lg font-medium">No tenders available</div>
          </div>
        ) : (
          <div className="space-y-4">
            {tenders.map((tender) => {
              const filteredBqs = bqsMap[tender.tender_id] || [];
              const contractorLetterMap = getContractorLetterMap(filteredBqs);
              const isExpanded = expandedTender === tender.tender_id;

              return (
                <div
                  key={tender.tender_id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200"
                >
                  {/* Header row */}
                  <div
                    className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => toggleTender(tender.tender_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                          {tender.tender_name}
                        </h2>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                          {tender.status_label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                        <span>{tender.brand_name}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-400" />
                        <span>{tender.branch_name}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-400" />
                        <span>{tender.renovation_type}</span>
                        {filteredBqs.length > 0 && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-gray-400" />
                            <span className="font-medium text-[#15406a]">
                              {filteredBqs.length} BQ{filteredBqs.length !== 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <svg
                        className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 px-5 py-4">
                      {/* Action bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span className="font-medium">Masked contractors:</span>
                          <span className="flex flex-wrap gap-1">
                            {Array.from(contractorLetterMap.values()).map((label, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#15406a]" />
                                {label}
                              </span>
                            ))}
                          </span>
                        </div>
                        <Link
                          href={`/admin/bqs?tender_id=${tender.tender_id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#15406a] hover:bg-[#0d2d4a] text-white transition shadow-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>View all BQs</span>
                        </Link>
                      </div>

                      {loadingBQs[tender.tender_id] ? (
                        <div className="flex justify-center py-10">
                          <div className="w-8 h-8 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : filteredBqs.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          No Draft or Submitted BQs for this tender.
                        </div>
                      ) : (
                        <div className="overflow-x-auto -mx-5 sm:mx-0">
                          <table className="min-w-[1000px] sm:min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50">
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">ID</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">BQ Name</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Job Site</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Contractor</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Version</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Area</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Work Type</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Last Updated</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {filteredBqs.map((bq) => {
                                const statusStyles = getBQStatusStyles(bq.status);
                                const statusLabel = getBQStatusLabel(bq.status);
                                const bqDisplayName = getBQDisplayName(bq);
                                const isDeletingThisBq = deletingBqId === bq.submission_id;
                                const maskedContractor = contractorLetterMap.get(bq.contractor_id) || `Contractor ?`;
                                return (
                                  <tr key={bq.submission_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">{bq.submission_id}</td>
                                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate" title={bqDisplayName}>
                                      {bqDisplayName}
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 max-w-[150px] truncate" title={bq.job_site}>
                                      {bq.job_site}
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-[#15406a]" />
                                        {maskedContractor}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">{bq.version_name || `Round ${bq.round_no}`}</td>
                                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
                                      {formatCurrency(bq.total_amount)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${statusStyles.bg} ${statusStyles.text} ${statusStyles.border}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyles.dot}`} />
                                        {statusLabel}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatShortDate(bq.bq_date)}</td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{bq.area_size || "—"}</td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{bq.work_type}</td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(bq.updated_at)}</td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      <Link href={`/bq/${bq.submission_id}/view`} className="text-[#15406a] hover:text-[#0d2d4a] mr-3 transition text-xs font-medium">
                                        View
                                      </Link>
                                      <button
                                        type="button"
                                        onClick={() => confirmDelete(bq, tender.tender_id)}
                                        disabled={isDeletingThisBq}
                                        className="text-red-600 hover:text-red-700 transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isDeletingThisBq ? "Deleting..." : "Delete"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
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
  );
}