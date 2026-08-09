"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { useNotify } from "@/components/ui/notification-provider";

interface ApprovalRow {
  request_id: number;
  resource_type: string;
  resource_id: number;
  current_step: number | null;
  created_at: string;
  status: string;
  resource_label: string;
  link: string | null;
  can_approve?: boolean;
  can_reject?: boolean;
  requires_comment?: boolean;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  tender_creation: "Tender Creation",
  tender_submission: "Tender Submission",
  bq_submission: "BQ Submission",
};

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium capitalize ${styles[status] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
      {status}
    </span>
  );
}

export default function ApprovalsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useNotify();

  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [pending, setPending] = useState<ApprovalRow[]>([]);
  const [history, setHistory] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    const roleId = (session.user as any)?.role_id;
    if (roleId === 22) {
      // Contractor — this internal-staff approval trail has no relevance to
      // them; redirect rather than show an empty/broken page.
      router.push("/dashboard");
    }
  }, [session, status, router]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [pendingRes, historyRes] = await Promise.all([
        fetch("/api/approval/request/pending"),
        fetch("/api/approval/request/all"),
      ]);
      if (!pendingRes.ok || !historyRes.ok) throw new Error("Failed to load approvals");
      const pendingData = await pendingRes.json();
      const historyData = await historyRes.json();
      setPending(Array.isArray(pendingData) ? pendingData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) fetchAll();
  }, [session, fetchAll]);

  const act = async (row: ApprovalRow, decision: "approve" | "reject") => {
    const comment = commentDrafts[row.request_id]?.trim() || "";
    if (row.requires_comment && !comment) {
      toast.error("A comment is required before you can act on this request.");
      return;
    }
    setActioningId(row.request_id);
    try {
      const res = await fetch("/api/approval/request/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: row.request_id, decision, comment: comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't process this action. Please try again.");
        return;
      }
      toast.success(decision === "approve" ? "Approved" : "Rejected");
      setPending((prev) => prev.filter((r) => r.request_id !== row.request_id));
      fetchAll();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setActioningId(null);
    }
  };

  if (status === "loading" || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const rows = activeTab === "pending" ? pending : history;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-600 mt-1">
            Sign-off requests for tenders and BQ submissions, based on the workflows configured in Workflow Config.
          </p>
        </div>

        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex gap-6">
            <button
              onClick={() => setActiveTab("pending")}
              className={`pb-3 px-1 border-b-2 text-sm font-medium transition ${
                activeTab === "pending" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Pending {pending.length > 0 && <span className="ml-1 text-xs">({pending.length})</span>}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`pb-3 px-1 border-b-2 text-sm font-medium transition ${
                activeTab === "history" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              History
            </button>
          </nav>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-gray-500">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading approvals…
            </div>
          ) : error ? (
            <div className="p-10 text-center">
              <p className="text-gray-500 mb-3">Couldn't load approvals. Please check your connection and try again.</p>
              <Button variant="outline" onClick={fetchAll}>Retry</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              {activeTab === "pending" ? "No approvals waiting on you right now." : "No approval history yet."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((row) => (
                <div key={row.request_id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          {RESOURCE_TYPE_LABELS[row.resource_type] || row.resource_type}
                        </span>
                        <StatusChip status={row.status} />
                      </div>
                      {row.link ? (
                        <Link href={row.link} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                          {row.resource_label}
                        </Link>
                      ) : (
                        <p className="font-medium text-gray-900">{row.resource_label}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Requested {format(new Date(row.created_at), "dd/MM/yyyy HH:mm")}
                        {row.current_step ? ` • Step ${row.current_step}` : ""}
                      </p>
                    </div>

                    {activeTab === "pending" && (
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="flex gap-2">
                          {row.can_reject !== false && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={actioningId === row.request_id}
                              onClick={() => act(row, "reject")}
                            >
                              Reject
                            </Button>
                          )}
                          {row.can_approve !== false && (
                            <Button
                              variant="default"
                              size="sm"
                              disabled={actioningId === row.request_id}
                              onClick={() => act(row, "approve")}
                            >
                              {actioningId === row.request_id ? "Processing…" : "Approve"}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {activeTab === "pending" && (
                    <div className="mt-3">
                      <label htmlFor={`comment-${row.request_id}`} className="sr-only">
                        Comment {row.requires_comment ? "(required)" : "(optional)"}
                      </label>
                      <textarea
                        id={`comment-${row.request_id}`}
                        rows={2}
                        placeholder={row.requires_comment ? "Comment (required before you can act)" : "Comment (optional)"}
                        value={commentDrafts[row.request_id] || ""}
                        onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [row.request_id]: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
