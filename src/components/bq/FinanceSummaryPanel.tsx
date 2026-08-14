"use client";

import { useEffect, useState, useCallback } from "react";
import { useNotify } from "@/components/ui/notification-provider";

interface CategoryBreakdownRow {
  category_id: number;
  category_name: string;
  total: number;
  comparison_avg: number | null;
  deviation_pct: number | null;
}

interface FinanceSummary {
  total_submitted: number;
  recommended_ceiling: number | null;
  category_breakdown: CategoryBreakdownRow[] | null;
  notes: string | null;
  updated_at: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "SGD", minimumFractionDigits: 2 }).format(value);
}

// Per-submission cost analysis (finance_budget_summary table) — total,
// recommended ceiling (lowest competing bid), and a per-category breakdown
// flagging categories priced high/low versus this tender's other
// contractors. Staff-only, never shown to contractors (2026-08-10).
export default function FinanceSummaryPanel({ submissionId }: { submissionId: number }) {
  const toast = useNotify();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/bq/${submissionId}/finance-summary`);
      if (!res.ok) throw new Error();
      setSummary(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/bq/${submissionId}/finance-summary`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate summary");
      }
      setSummary(await res.json());
      toast.success("Finance summary generated");
    } catch (err: any) {
      toast.error(err.message || "Could not generate the finance summary. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
      ) : error ? (
        <div className="text-sm text-rose-600 flex items-center justify-between gap-3">
          <span>Could not load the finance summary.</span>
          <button onClick={fetchSummary} className="px-3 py-1.5 text-xs font-medium border border-rose-300 rounded-lg hover:bg-rose-50 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <>
          {summary ? (
            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Total Submitted</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(summary.total_submitted)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Lowest Competing Bid</p>
                  <p className="font-semibold text-slate-900">
                    {summary.recommended_ceiling !== null ? formatCurrency(summary.recommended_ceiling) : "No other bids yet"}
                  </p>
                </div>
              </div>

              {summary.notes && (
                <p className="text-sm text-slate-700 bg-cyan-50 border border-cyan-200 rounded-lg p-3">{summary.notes}</p>
              )}

              {summary.category_breakdown && summary.category_breakdown.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500 uppercase tracking-wide">
                        <th className="py-1.5 pr-3">Category</th>
                        <th className="py-1.5 pr-3">Total</th>
                        <th className="py-1.5">vs. Others</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.category_breakdown.map((c) => (
                        <tr key={c.category_id}>
                          <td className="py-1.5 pr-3 text-slate-800">{c.category_name}</td>
                          <td className="py-1.5 pr-3 text-slate-700">{formatCurrency(c.total)}</td>
                          <td className="py-1.5">
                            {c.deviation_pct !== null ? (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                c.deviation_pct > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {c.deviation_pct > 0 ? "+" : ""}{c.deviation_pct.toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[10px] text-slate-400">Last generated {new Date(summary.updated_at).toLocaleString()}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mb-4">No finance summary generated yet for this submission.</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {generating ? "Generating..." : summary ? "Regenerate Summary" : "Generate Summary"}
          </button>
        </>
      )}
    </div>
  );
}
