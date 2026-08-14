"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";

interface BqComment {
  comment_id: number;
  comment_body: string;
  visible_to_contractor: boolean;
  requires_action: boolean;
  created_at: string;
  author_name: string;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

// Staff-authored notes on a BQ submission (review_comment table). Staff can
// mark each note visible-to-contractor or internal-only; contractors only
// ever see the former — the GET route already filters this server-side, so
// this component doesn't need to re-check visibility itself (2026-08-10).
export default function BqNotesPanel({ submissionId, canAddNotes }: { submissionId: number; canAddNotes: boolean }) {
  const toast = useNotify();
  const [comments, setComments] = useState<BqComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [visibleToContractor, setVisibleToContractor] = useState(true);
  const [requiresAction, setRequiresAction] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/bq/${submissionId}/comments`);
      if (!res.ok) throw new Error();
      setComments(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleAddComment = async () => {
    if (!newBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bq/${submissionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment_body: newBody.trim(),
          visible_to_contractor: visibleToContractor,
          requires_action: requiresAction,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add note");
      }
      setNewBody("");
      setRequiresAction(false);
      toast.success("Note added");
      await fetchComments();
    } catch (err: any) {
      toast.error(err.message || "Could not add the note. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Nothing to show and nothing to add — don't render an empty panel for a
  // contractor with no notes on their BQ.
  if (!canAddNotes && !loading && comments.length === 0 && !error) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Notes</h2>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
      ) : error ? (
        <div className="text-sm text-rose-600 flex items-center justify-between gap-3">
          <span>Could not load notes.</span>
          <button onClick={fetchComments} className="px-3 py-1.5 text-xs font-medium border border-rose-300 rounded-lg hover:bg-rose-50 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">No notes yet.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {comments.map((c) => (
                <div key={c.comment_id} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-800">{c.author_name}</span>
                      <span className="text-[10px] text-slate-400">{relativeTime(c.created_at)}</span>
                      {c.requires_action && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                          Action needed
                        </span>
                      )}
                      {canAddNotes && !c.visible_to_contractor && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                          Internal only
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{c.comment_body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {canAddNotes && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={2}
                placeholder="Add a note..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={visibleToContractor}
                      onChange={(e) => setVisibleToContractor(e.target.checked)}
                      className="text-cyan-600"
                    />
                    Visible to contractor
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={requiresAction}
                      onChange={(e) => setRequiresAction(e.target.checked)}
                      className="text-cyan-600"
                    />
                    Requires action
                  </label>
                </div>
                <button
                  onClick={handleAddComment}
                  disabled={submitting || !newBody.trim()}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium transition disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add Note"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
