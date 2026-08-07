"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";

export default function ExtensionApprovalPage() {
  const router = useRouter();
  const { id, requestId } = useParams();
  const { data: session, status: sessionStatus } = useSession();
  const toast = useNotify();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (sessionStatus === "authenticated") {
      fetchRequest();
    }
  }, [sessionStatus, router, requestId]);

  const fetchRequest = async () => {
    try {
      const res = await fetch(`/api/tender-extension/${requestId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch request");
      }
      const data = await res.json();
      setRequest(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (status: "Approved" | "Rejected") => {
    if (status === "Rejected" && !rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/tender-extension/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          reason: status === "Rejected" ? rejectionReason : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to process request");
      }
      // Redirect back to the tender detail page
      router.push(`/admin/tenders/${id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading request details...</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-6 rounded-xl max-w-md">
          <p className="font-bold">Error</p>
          <p>{error || "Request not found"}</p>
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-2 text-sm transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Tender
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Extension Request Review</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Review and respond to the extension request for <strong>{request.tender_name}</strong>.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Status */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Current Status</span>
              <div className="mt-1 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                {request.status}
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Requester</span>
                <p className="text-slate-900 dark:text-white mt-1">{request.requester_name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{request.requester_email}</p>
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Requested Days</span>
                <p className="text-slate-900 dark:text-white mt-1 text-lg font-semibold">{request.requested_days}</p>
              </div>
              <div className="md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Reason</span>
                <p className="text-slate-700 dark:text-slate-300 mt-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-md whitespace-pre-wrap">
                  {request.reason}
                </p>
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Original Closing</span>
                <p className="text-slate-900 dark:text-white mt-1 font-medium">{formatDate(request.original_closing_date)}</p>
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Proposed Closing</span>
                <p className="text-slate-900 dark:text-white mt-1 font-medium">{formatDate(request.proposed_closing_date)}</p>
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Submitted At</span>
                <p className="text-slate-700 dark:text-slate-300 mt-1">{formatDate(request.created_at)}</p>
              </div>
            </div>

            {/* Approval actions */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Decision</h3>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => handleDecision("Approved")}
                  disabled={processing}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-5 h-5" /> Approve
                </button>
                <button
                  onClick={() => setShowRejectionInput(!showRejectionInput)}
                  disabled={processing}
                  className="flex items-center gap-2 px-6 py-3 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" /> Reject
                </button>
              </div>

              {showRejectionInput && (
                <div className="mt-4 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-lg">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Reason for Rejection <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="Explain why this request is rejected..."
                  />
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => handleDecision("Rejected")}
                      disabled={processing}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Submit Rejection
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectionInput(false);
                        setRejectionReason("");
                      }}
                      className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}