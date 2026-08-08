// app/tenders/my/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, isAfter, parseISO, differenceInDays } from "date-fns";
import { getBrandColor } from "@/lib/brandColors";
import { getTenderStatusBadgeStyle, getTenderStatusLabel } from "@/lib/statusColors";

// ---- Alert Modal State ----
interface AlertState {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  details?: string;
}

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
  const [alert, setAlert] = useState<AlertState | null>(null);

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

  // ---- Alert Modal renderer ----
  const renderAlertModal = () => {
    if (!alert) return null;
    const { type, title, message, details } = alert;
    let bgColor, borderColor, icon;
    switch (type) {
      case "success":
        bgColor = "bg-emerald-50";
        borderColor = "border-emerald-500";
        icon = "✅";
        break;
      case "error":
        bgColor = "bg-red-50";
        borderColor = "border-red-500";
        icon = "⚠️";
        break;
      case "warning":
        bgColor = "bg-amber-50";
        borderColor = "border-amber-500";
        icon = "⚠️";
        break;
      case "info":
      default:
        bgColor = "bg-blue-50";
        borderColor = "border-blue-500";
        icon = "ℹ️";
        break;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className={`w-full max-w-md ${bgColor} border-l-4 ${borderColor} rounded-2xl shadow-2xl p-6`}>
          <div className="flex items-start gap-4">
            <span className="text-3xl">{icon}</span>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-700 mt-1">{message}</p>
              {details && <p className="text-xs text-gray-600 mt-2">{details}</p>}
            </div>
            <button
              onClick={() => setAlert(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setAlert(null)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Loading skeleton
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-200 rounded-lg w-64 mb-4" />
            <div className="h-6 bg-gray-200 rounded-lg w-96 mb-8" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-5 space-y-3">
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-5/6" />
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
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        {renderAlertModal()}
        <div className="bg-red-100 border border-red-300 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-800">{error}</p>
          <button onClick={fetchMyTenders} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
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
    <div className="min-h-screen relative overflow-hidden bg-gray-50">
      {renderAlertModal()}

      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[35vw] max-w-[540px] max-h-[280px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none hidden" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl animate-pulse pointer-events-none hidden" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none hidden" />

      <div className="relative z-10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 pb-4 border-b border-gray-200">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  My Tender Submissions
                </h1>
                <p className="text-gray-600 mt-2">
                  Track the tenders you have submitted a Bill of Quantities for (Draft or Submitted)
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={fetchMyTenders}
                  className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
                <button
                  onClick={() => router.back()}
                  className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  ← Back
                </button>
              </div>
            </div>
            {hasTenders && (
              <div className="mt-6 flex gap-4 text-sm text-gray-600">
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
          <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-gray-200 p-4 mb-8 shadow-lg">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by tender name, client, or site..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Empty state (no submissions at all) */}
          {showEmptyState && (
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-gray-200 p-12 text-center shadow-xl">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 mx-auto mb-6 text-gray-400">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">No submissions yet</h2>
                <p className="text-gray-600 mt-2">
                  You haven&apos;t submitted any BQs for tenders. Browse open tenders to get started.
                </p>
                <Link
                  href="/tenders"
                  className="inline-block mt-6 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg transition"
                >
                  Browse Open Tenders →
                </Link>
              </div>
            </div>
          )}

          {/* No search results */}
          {showNoSearchResults && (
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-200 p-8 text-center">
              <p className="text-gray-600">No tenders match your search.</p>
              <button onClick={() => setSearch("")} className="mt-3 text-blue-600 hover:underline">
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
                  ? "text-gray-600" 
                  : "text-amber-600";

                return (
                  <Link
                    key={tender.tender_id}
                    href={`/tenders/my/${tender.tender_id}`}
                    className={`${cardWidthClass} group block relative bg-white backdrop-blur-sm rounded-2xl border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 hover:border-cyan-400`}
                    style={{ borderLeftColor: brandColor.borderColor, borderLeftWidth: "4px" }}
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <h2 className="text-xl font-bold text-gray-900 line-clamp-2 flex-1">
                          {tender.tender_name}
                        </h2>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getTenderStatusBadgeStyle(tender.display_status)}`}>
                          {getTenderStatusLabel(tender.display_status)}
                        </span>
                      </div>

                      <div className="space-y-1 mb-4">
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {tender.client_name} – {tender.branch_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {tender.work_type}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                        <div>
                          <span className="text-gray-500">Bid Deadline</span>
                          <p className="font-medium text-gray-800">{formatDate(tender.closing_date)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Renovation</span>
                          <p className="font-medium text-gray-800">
                            {formatDate(tender.renovation_start_date)} – {formatDate(tender.renovation_end_date)}
                          </p>
                        </div>
                      </div>

                      {tender.closing_date && (
                        <div className={`text-xs font-medium mb-3 p-2 rounded-lg ${
                          isDeadlineSoon 
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-gray-50 text-gray-600"
                        }`}>
                          {daysLeft === 0 ? "Deadline passed" : daysLeft === 1 ? "Closes tomorrow" : `Closes in ${daysLeft} days`}
                        </div>
                      )}

                      <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
                        <span className="text-gray-500">Your BQ status:</span>
                        <span className={`font-medium ${submissionColor}`}>{submissionDisplay}</span>
                      </div>

                      <div className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 group-hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition">
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