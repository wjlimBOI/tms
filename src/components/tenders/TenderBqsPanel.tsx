"use client";

import { useEffect, useState, useCallback } from "react";
import { FileSpreadsheet } from "lucide-react";
import { getBQStatusStyles, getBQStatusLabel } from "@/lib/statusColors";

interface TenderBq {
  submission_id: number;
  round_no: number;
  version_name: string | null;
  status: string;
  updated_at: string;
  bq_date: string | null;
  area_size: number | null;
  client_name: string | null;
  job_site: string | null;
  work_type: string | null;
  line_item_count: number;
  contractor_id: number;
  contractor_username: string;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString();
}

// Staff-oversight view of all contractors' BQ submissions on this tender —
// gated server-side to Admin/Developer/Executive Director (isSuperViewer)
// via GET /api/tenders/[id]/bqs, deliberately separate from the
// contractor-facing BQ pages which never show other contractors' bids.
export default function TenderBqsPanel({ tenderId }: { tenderId: number }) {
  const [bqs, setBqs] = useState<TenderBq[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessible, setAccessible] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resubmissionByContractor, setResubmissionByContractor] = useState<Record<number, { fulfilled: boolean }>>({});

  const fetchBqs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bqs`);
      if (res.status === 401 || res.status === 403) {
        setAccessible(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load submitted BQs");
      const data = await res.json();
      setAccessible(true);
      setBqs(data);
    } catch (err) {
      setError("Could not load submitted BQs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    fetchBqs();
    // Best-effort — this 403s for roles that can view BQs but can't request
    // resubmissions (e.g. Executive Director); just skip the badge then.
    fetch(`/api/tenders/${tenderId}/resubmission-requests`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: { contractor_id: number; fulfilled: boolean }[]) => {
        const map: Record<number, { fulfilled: boolean }> = {};
        rows.forEach((r) => { map[r.contractor_id] = { fulfilled: r.fulfilled }; });
        setResubmissionByContractor(map);
      })
      .catch(() => setResubmissionByContractor({}));
  }, [fetchBqs, tenderId]);

  if (accessible === false) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileSpreadsheet className="w-5 h-5 text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Submitted BQs</h2>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 bg-slate-100 rounded-lg" />
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
      ) : error ? (
        <div className="text-sm text-rose-600 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={fetchBqs}
            className="px-3 py-1.5 text-xs font-medium border border-rose-300 rounded-lg hover:bg-rose-50 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : bqs.length === 0 ? (
        <p className="text-sm text-slate-500">No BQs have been submitted for this tender yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-5 sm:-mx-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-5 sm:px-6 py-2">Contractor</th>
                <th className="px-3 py-2">Round</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Work Type</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Resubmission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bqs.map((bq) => (
                <tr key={bq.submission_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 sm:px-6 py-2.5 text-slate-800 font-medium whitespace-nowrap">
                    {bq.contractor_username}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{bq.round_no}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${getBQStatusStyles(bq.status)}`}>
                      {getBQStatusLabel(bq.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{bq.work_type || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{bq.line_item_count}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(bq.updated_at)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {resubmissionByContractor[bq.contractor_id] && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        resubmissionByContractor[bq.contractor_id].fulfilled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {resubmissionByContractor[bq.contractor_id].fulfilled ? "Resubmitted" : "Requested"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
