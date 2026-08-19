// app/tenders/my/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, isAfter, parseISO, differenceInDays } from "date-fns";
import { getBrandColor } from "@/lib/brandColors";
import { getTenderStatusBadgeStyle, getTenderStatusLabel } from "@/lib/statusColors";
import AlertModal, { AlertModalData } from "@/components/ui/AlertModal";

interface MyTender {
  tender_id: number;
  tender_name: string;
  branch_name: string;
  client_name: string;
  work_type: string;
  closing_date?: string;
  renovation_start_date?: string;
  renovation_end_date?: string;
  display_status: string;      // 'Open', 'Ongoing', 'Closed', 'Upcoming'
  latest_submission_status: string; // 'Draft' or 'Submitted' (we filter)
  last_activity: string;
}

export default function MyTendersListPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [tenders, setTenders] = useState<MyTender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filteredTenders, setFilteredTenders] = useState<MyTender[]>([]);

  // ---- Alert modal state ----
  const [alert, setAlert] = useState<AlertModalData | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user) {
      fetchMyTenders();
    }
  }, [session, sessionStatus, router]);

  const fetchMyTenders = async () => {
    setLoading(true);
    setError(null);
    setAlert(null);
    try {
      const res = await fetch("/api/tenders/my-submission");
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const rawTenders = Array.isArray(data) ? data : [];
      // ✅ Only keep tenders where the latest submission is Draft or Submitted
      const filtered = rawTenders.filter(
        (t: MyTender) => t.latest_submission_status === "Draft" || t.latest_submission_status === "Submitted"
      );
      setTenders(filtered);
      setFilteredTenders(filtered);
    } catch (err) {
      console.error(err);
      setError("Could not load your tenders.");
      setAlert({
        type: "error",
        title: "Unable to Load Your Tenders",
        message: "We couldn't retrieve your tender submissions. Please refresh the page or try again later.",
        details: "If the problem persists, contact your system administrator.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Local search filter
  useEffect(() => {
    if (search.trim() === "") {
      setFilteredTenders(tenders);
    } else {
      const lowerSearch = search.toLowerCase();
      setFilteredTenders(
        tenders.filter(
          (t) =>
            t.tender_name.toLowerCase().includes(lowerSearch) ||
            t.client_name.toLowerCase().includes(lowerSearch) ||
            t.branch_name.toLowerCase().includes(lowerSearch)
        )
      );
    }
  }, [search, tenders]);

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


  // Loading skeleton
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-12 bg-slate-200 rounded-lg w-64 mb-4" />
            <div className="h-6 bg-slate-200 rounded-lg w-96 mb-8" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-5 space-y-3">
                  <div className="h-6 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-full" />
                    <div className="h-4 bg-slate-200 rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If error and no tenders, show a fallback (but modal is also shown)
  if (error && tenders.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-white">
        <AlertModal alert={alert} onClose={() => setAlert(null)} />
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-800">{error}</p>
          <button onClick={fetchMyTenders} className="mt-4 px-4 py-2 bg-[#15406a] text-white rounded-md font-semibold shadow-md hover:-translate-y-0.5 hover:bg-[#0d2d4a] hover:shadow-lg transition-all">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasTenders = filteredTenders.length > 0;
  const showEmptyState = !hasTenders && !loading && tenders.length === 0;
  const showNoSearchResults = !hasTenders && tenders.length > 0 && search !== "";

  const activeTendersCount = filteredTenders.filter(t => t.display_status !== 'Closed').length;

  return (
    <div className="min-h-screen relative overflow-hidden bg-white font-sans text-slate-900">
      <AlertModal alert={alert} onClose={() => setAlert(null)} />

      <div className="relative z-10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 pb-4 border-b border-slate-200">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900">
                  Tender Submissions
                </h1>
                <p className="text-slate-600 mt-2">
                  Track the tenders you've submitted a bid for.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={fetchMyTenders}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-md border border-[#15406a] text-[#15406a] bg-white hover:bg-[#15406a] hover:text-white transition outline-none focus-visible:ring-2 focus-visible:ring-[#15406a]/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                >
                  <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  onClick={() => router.back()}
                  className="px-4 py-2 text-sm font-medium rounded-md border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition outline-none focus-visible:ring-2 focus-visible:ring-[#15406a]/50 focus-visible:ring-offset-2"
                >
                  ← Back
                </button>
              </div>
            </div>
            {hasTenders && (
              <div className="mt-6 flex gap-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{activeTendersCount} active tender{activeTendersCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Deadlines approaching</span>
                </div>
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-8 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by tender name, client, or site..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-md text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#15406a] focus:ring-2 focus:ring-[#15406a]/20 transition"
                />
              </div>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Empty state (no submissions at all) */}
          {showEmptyState && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 mx-auto mb-6 text-slate-400">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="font-serif text-2xl font-semibold text-slate-900">No submissions yet</h2>
                <p className="text-slate-600 mt-2">
                  You haven&apos;t submitted any BQs for tenders. Browse open tenders to get started.
                </p>
                <Link
                  href="/tenders"
                  className="inline-flex items-center gap-2 mt-6 px-6 py-2.5 bg-[#15406a] text-white rounded-md font-bold tracking-wide shadow-md hover:-translate-y-0.5 hover:bg-[#0d2d4a] hover:shadow-lg transition-all"
                >
                  Browse Open Tenders →
                </Link>
              </div>
            </div>
          )}

          {/* No search results */}
          {showNoSearchResults && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-slate-600">No tenders match your search.</p>
              <button onClick={() => setSearch("")} className="mt-3 text-[#15406a] hover:underline">
                Clear search
              </button>
            </div>
          )}

          {/* Tender cards grid */}
          {hasTenders && (
            <div className={filteredTenders.length === 1 
              ? "flex justify-center" 
              : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            }>
              {filteredTenders.map((tender) => {
                const brandColor = getBrandColor(tender.client_name);
                const daysLeft = getDaysLeft(tender.closing_date);
                const isDeadlineSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
                const cardWidthClass = filteredTenders.length === 1
                  ? "w-full max-w-2xl"
                  : "w-full";

                const submissionDisplay = tender.latest_submission_status === "Draft" 
                  ? "Draft" 
                  : tender.latest_submission_status === "Submitted" 
                    ? "Submitted" 
                    : tender.latest_submission_status;
                const submissionColor = tender.latest_submission_status === "Draft"
                  ? "text-slate-600"
                  : "text-amber-600";

                return (
                  <Link
                    key={tender.tender_id}
                    href={`/tenders/my/${tender.tender_id}`}
                    className={`${cardWidthClass} group block relative bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#15406a]/40`}
                    style={{ borderLeftColor: brandColor.borderColor, borderLeftWidth: "4px" }}
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <h2 className="text-xl font-bold text-slate-900 line-clamp-2 flex-1">
                          {tender.tender_name}
                        </h2>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${getTenderStatusBadgeStyle(tender.display_status)}`}>
                          {getTenderStatusLabel(tender.display_status)}
                        </span>
                      </div>

                      <div className="space-y-1 mb-4">
                        <p className="text-sm text-slate-600 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {tender.client_name} – {tender.branch_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {tender.work_type}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                        <div>
                          <span className="text-slate-500">Bid Deadline</span>
                          <p className="font-medium text-slate-800">{formatDate(tender.closing_date)}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Renovation</span>
                          <p className="font-medium text-slate-800">
                            {formatDate(tender.renovation_start_date)} – {formatDate(tender.renovation_end_date)}
                          </p>
                        </div>
                      </div>

                      {tender.closing_date && (
                        <div className={`text-xs font-medium mb-3 p-2 rounded-lg ${
                          isDeadlineSoon
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-50 text-slate-600"
                        }`}>
                          {daysLeft === 0 ? "Deadline passed" : daysLeft === 1 ? "Closes tomorrow" : `Closes in ${daysLeft} days`}
                        </div>
                      )}

                      <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                        <span className="text-slate-500">Your BQ status:</span>
                        <span className={`font-medium ${submissionColor}`}>{submissionDisplay}</span>
                      </div>

                      <div className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#15406a]/5 group-hover:bg-[#15406a] text-[#15406a] group-hover:text-white rounded-md text-sm font-semibold transition-all">
                        View Details
                        <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}