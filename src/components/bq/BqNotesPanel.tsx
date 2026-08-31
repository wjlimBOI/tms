"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";

interface BqComment {
  comment_id: number;
  comment_body: string;
  visible_to_contractor: boolean;
  requires_action: boolean;
  created_at: string;
  author_name: string;
  line_item_id: number | null;
  item_no: string | null;
  item_description: string | null;
  contractor_read_at: string | null;
  is_new?: boolean;
}

interface BqItem {
  line_item_id: number;
  item_no: string;
  description: string;
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

// Staff-authored notes on a BQ submission (review_comment table), each
// attached to a specific line item. Staff can mark each note visible-to-
// contractor or internal-only; contractors only ever see the former — the
// GET route already filters this server-side (2026-08-10). For contractor-
// visible notes, the GET route also marks contractor_read_at the first time
// it delivers a note to the owning contractor, and flags that same response
// with is_new so the "New" badge shows exactly once (2026-08-21).
export default function BqNotesPanel({ submissionId, canAddNotes }: { submissionId: number; canAddNotes: boolean }) {
  const toast = useNotify();
  const [comments, setComments] = useState<BqComment[]>([]);
  const [items, setItems] = useState<BqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [visibleToContractor, setVisibleToContractor] = useState(true);
  const [requiresAction, setRequiresAction] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [commentsRes, itemsRes] = await Promise.all([
        fetch(`/api/bq/${submissionId}/comments`),
        fetch(`/api/bq/${submissionId}/items`),
      ]);
      if (!commentsRes.ok || !itemsRes.ok) throw new Error();
      setComments(await commentsRes.json());
      setItems(await itemsRes.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddComment = async () => {
    if (!newBody.trim() || !selectedItemId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bq/${submissionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment_body: newBody.trim(),
          visible_to_contractor: visibleToContractor,
          requires_action: requiresAction,
          line_item_id: selectedItemId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add note");
      }
      setNewBody("");
      setRequiresAction(false);
      toast.success("Note added");
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Could not add the note. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Group notes by line item; notes with no line_item_id are legacy,
  // pre-per-item notes shown as read-only history.
  const groups = useMemo(() => {
    const byItem = new Map<number, { item_no: string | null; item_description: string | null; notes: BqComment[] }>();
    const legacy: BqComment[] = [];
    for (const c of comments) {
      if (c.line_item_id === null) {
        legacy.push(c);
        continue;
      }
      const existing = byItem.get(c.line_item_id);
      if (existing) {
        existing.notes.push(c);
      } else {
        byItem.set(c.line_item_id, { item_no: c.item_no, item_description: c.item_description, notes: [c] });
      }
    }
    return { byItem: Array.from(byItem.entries()), legacy };
  }, [comments]);

  // Nothing to show and nothing to add — don't render an empty panel for a
  // contractor with no notes on their BQ.
  if (!canAddNotes && !loading && comments.length === 0 && !error) return null;

  const renderNote = (c: BqComment) => (
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
          {c.visible_to_contractor && canAddNotes && (
            c.contractor_read_at ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                Read {relativeTime(c.contractor_read_at)}
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                Unread
              </span>
            )
          )}
          {!canAddNotes && c.is_new && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
              New
            </span>
          )}
        </div>
        <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{c.comment_body}</p>
      </div>
    </div>
  );

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
          <button onClick={fetchData} className="px-3 py-1.5 text-xs font-medium border border-rose-300 rounded-lg hover:bg-rose-50 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">No notes yet.</p>
          ) : (
            <div className="space-y-5 mb-4">
              {groups.byItem.map(([lineItemId, group]) => (
                <div key={lineItemId}>
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    Item {group.item_no} — {group.item_description}
                  </p>
                  <div className="space-y-3 pl-3 border-l-2 border-slate-100">
                    {group.notes.map(renderNote)}
                  </div>
                </div>
              ))}
              {groups.legacy.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">General notes (history)</p>
                  <div className="space-y-3 pl-3 border-l-2 border-slate-100">
                    {groups.legacy.map(renderNote)}
                  </div>
                </div>
              )}
            </div>
          )}

          {canAddNotes && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value ? Number(e.target.value) : "")}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
              >
                <option value="">Select a BQ item...</option>
                {items.map((item) => (
                  <option key={item.line_item_id} value={item.line_item_id}>
                    Item {item.item_no} — {item.description.slice(0, 60)}
                  </option>
                ))}
              </select>
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
                  disabled={submitting || !newBody.trim() || !selectedItemId}
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
