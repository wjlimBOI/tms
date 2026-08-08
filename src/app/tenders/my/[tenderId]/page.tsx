// app/tenders/my/[tenderId]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ROLE_IDS } from "@/lib/roles";

// ---- Alert Modal State ----
interface AlertState {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  details?: string;
}

interface TenderDetail {
  tender_id: number;
  tender_name: string;
  description: string;
  deadline: string;
  job_site: string;
  client_name: string;
  work_type: string;
}

interface BQSubmission {
  submission_id: number;
  round_no: number;
  version_name: string;
  status: string;
  bq_name: string;
  updated_at: string;
  created_at: string;
  can_edit: boolean;
}

export default function MyTenderDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const tenderId = parseInt(params.tenderId as string);

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [submissions, setSubmissions] = useState<BQSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Alert modal state ----
  const [alert, setAlert] = useState<AlertState | null>(null);

  // Redirect non‑contractors
  useEffect(() => {
    if (sessionStatus === "authenticated") {
      const roleId = (session?.user as any)?.role_id;
      if (roleId !== ROLE_IDS.CONTRACTOR) {
        router.push("/tenders");
      }
    }
  }, [session, sessionStatus, router]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user && (session.user as any)?.role_id === ROLE_IDS.CONTRACTOR) {
      fetchData();
    }
  }, [session, sessionStatus, router, tenderId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setAlert(null);
    try {
      const tenderRes = await fetch(`/api/tenders/${tenderId}`);
      if (!tenderRes.ok) throw new Error("Failed to fetch tender");
      const tenderData = await tenderRes.json();
      setTender(tenderData);

      const bqRes = await fetch(`/api/tenders/my-submission?tender_id=${tenderId}`);
      if (!bqRes.ok) throw new Error("Failed to fetch BQ submissions");
      const bqData = await bqRes.json();
      setSubmissions(Array.isArray(bqData) ? bqData : []);
    } catch (err) {
      console.error(err);
      setError("Could not load data. Please try again later.");
      setAlert({
        type: "error",
        title: "Unable to Load Tender Details",
        message: "We couldn't retrieve the tender information. Please refresh the page or try again later.",
        details: "If the problem persists, contact your system administrator.",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return format(new Date(dateStr), "dd MMM yyyy, HH:mm");
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Draft: "bg-yellow-100 text-yellow-800 border-yellow-300",
      Submitted: "bg-green-100 text-green-800 border-green-300",
      Approved: "bg-blue-100 text-blue-800 border-blue-300",
      Rejected: "bg-red-100 text-red-800 border-red-300",
    };
    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || "bg-gray-100 text-gray-700 border-gray-300"}`;
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

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  // If there's an error and no tender, show a fallback (modal is already shown)
  if (error && !tender) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        {renderAlertModal()}
        <div className="bg-red-100 border border-red-300 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-800">{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {renderAlertModal()}
        <p className="text-gray-600">Tender not found or you don’t have access.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-50">
      {renderAlertModal()}

      <div className="relative z-10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Back link */}
          <Link href="/tenders/my" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 text-sm transition">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to my tenders
          </Link>

          {/* Tender header */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{tender.tender_name}</h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {tender.job_site}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {tender.client_name}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {tender.work_type}
              </span>
              <span className="flex items-center gap-1 text-amber-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Deadline: {formatDate(tender.deadline)}
              </span>
            </div>
            {tender.description && (
              <p className="mt-3 text-sm text-gray-600 border-l-2 border-blue-500 pl-3">
                {tender.description}
              </p>
            )}
          </div>

          {/* BQ Submissions */}
          <div className="bg-white backdrop-blur-sm rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Your BQ Submissions</h2>
              <Link
                href={`/bq/new?tender_id=${tender.tender_id}`}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition"
              >
                + New BQ Submission
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Round</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {submissions.map((sub) => (
                    <tr key={sub.submission_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sub.bq_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{sub.round_no ?? "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getStatusBadge(sub.status)}>{sub.status}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(sub.created_at)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/bq/${sub.submission_id}/view`}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200 transition"
                          >
                            View
                          </Link>
                          {sub.can_edit && (
                            <Link
                              href={`/bq/${sub.submission_id}/edit`}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition"
                            >
                              Edit
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No BQ submissions yet.
                        <Link href={`/bq/new?tender_id=${tender.tender_id}`} className="ml-2 text-blue-600 hover:underline">
                          Create your first submission
                        </Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}