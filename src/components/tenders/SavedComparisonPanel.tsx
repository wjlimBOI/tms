"use client";

import { useEffect, useState, useCallback } from "react";
import { Scale } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";

interface ComparisonItem {
  item_id: number;
  contractor_id: number;
  submission_id: number;
  compared_total: number | null;
  rank: number | null;
  reno_notes: string | null;
  contractor_username: string;
}

interface SavedComparison {
  comparison_id: number;
  title: string | null;
  notes: string | null;
  created_by_name: string;
  updated_at: string;
  items: ComparisonItem[];
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "SGD", minimumFractionDigits: 2 }).format(value);
}

// Persisted comparison snapshot (reno_comparison / reno_comparison_item) —
// a durable, annotatable record distinct from bq/compare's live view, so
// staff can revisit "here's our official comparison for this tender"
// without recomputing it each time (2026-08-10).
export default function SavedComparisonPanel({ tenderId, canManage }: { tenderId: number; canManage: boolean }) {
  const toast = useNotify();
  const [comparison, setComparison] = useState<SavedComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessible, setAccessible] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingNote, setEditingNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/comparison`);
      if (res.status === 401 || res.status === 403) {
        setAccessible(false);
        return;
      }
      if (!res.ok) throw new Error();
      setAccessible(true);
      setComparison(await res.json());
    } catch {
      setAccessible(true);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/comparison`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save comparison");
      toast.success(comparison ? "Comparison refreshed" : "Comparison saved");
      await fetchComparison();
    } catch (err: any) {
      toast.error(err.message || "Could not save the comparison. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const startEditNote = (item: ComparisonItem) => {
    setEditingItemId(item.item_id);
    setEditingNote(item.reno_notes || "");
  };

  const handleSaveNote = async (itemId: number) => {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/comparison/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reno_notes: editingNote.trim() || null }),
      });
      if (!res.ok) throw new Error();
      setEditingItemId(null);
      toast.success("Note saved");
      await fetchComparison();
    } catch {
      toast.error("Could not save the note. Please try again.");
    } finally {
      setSavingNote(false);
    }
  };

  if (accessible === false || (!canManage && !comparison && !loading)) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Saved Comparison</h2>
        </div>
        {canManage && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white transition disabled:opacity-50"
          >
            {saving ? "Saving..." : comparison ? "Refresh" : "Save Comparison"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
      ) : !comparison ? (
        <p className="text-sm text-slate-500">
          No saved comparison yet. {canManage ? "Save one once bids are in to keep a durable record for the award decision." : ""}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-slate-400 mb-3">
            Last saved {new Date(comparison.updated_at).toLocaleString()} by {comparison.created_by_name}
          </p>
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <th className="px-5 sm:px-6 py-2">Rank</th>
                  <th className="px-3 py-2">Contractor</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparison.items.map((item) => (
                  <tr key={item.item_id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-5 sm:px-6 py-2.5 text-slate-800 font-semibold">
                      {item.rank === 1 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700">#1</span>
                      ) : (
                        `#${item.rank ?? "—"}`
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800 font-medium whitespace-nowrap">{item.contractor_username}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{formatCurrency(item.compared_total)}</td>
                    <td className="px-3 py-2.5 text-slate-600 min-w-[220px]">
                      {editingItemId === item.item_id ? (
                        <div className="flex flex-col gap-1.5">
                          <textarea
                            value={editingNote}
                            onChange={(e) => setEditingNote(e.target.value)}
                            rows={2}
                            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveNote(item.item_id)}
                              disabled={savingNote}
                              className="text-[11px] font-medium px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white transition disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingItemId(null)}
                              disabled={savingNote}
                              className="text-[11px] font-medium px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <span className={item.reno_notes ? "" : "text-slate-400 italic"}>
                            {item.reno_notes || "No note"}
                          </span>
                          {canManage && (
                            <button
                              onClick={() => startEditNote(item)}
                              className="text-[11px] text-cyan-600 hover:underline flex-shrink-0"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
