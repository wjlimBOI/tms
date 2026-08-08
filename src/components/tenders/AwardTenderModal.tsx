"use client";

import { useEffect, useState } from "react";
import { X, Trophy, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useNotify } from "@/components/ui/notification-provider";
import { Button } from "@/components/ui/Button";

interface EligibleSubmission {
  submission_id: number;
  contractor_id: number;
  contractor_name: string;
  submitted_at: string | null;
  status: string;
  bq_name: string;
}

interface Props {
  tenderId: number;
  tenderName: string;
  onClose: () => void;
  onAwarded: () => void;
}

export default function AwardTenderModal({ tenderId, tenderName, onClose, onAwarded }: Props) {
  const toast = useNotify();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<EligibleSubmission[]>([]);
  const [alreadyAwarded, setAlreadyAwarded] = useState(false);

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const [contractValue, setContractValue] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tenders/${tenderId}/award`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load submissions");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSubmissions(data.submissions || []);
        setAlreadyAwarded(!!data.alreadyAwarded);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load submitted bids for this tender.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenderId]);

  const handleSubmit = async () => {
    const value = parseFloat(contractValue);
    if (!selectedSubmissionId) {
      toast.error("Select the winning submission first.");
      return;
    }
    if (isNaN(value) || value <= 0) {
      toast.error("Enter a contract value greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: selectedSubmissionId,
          contract_value: value,
          remark: remark.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to record the award.");

      toast.success("Tender awarded successfully.");
      onAwarded();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Unable to record the award.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Award Tender
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{tenderName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!loading && error && <p className="text-sm text-rose-600 text-center py-6">{error}</p>}

          {!loading && !error && alreadyAwarded && (
            <p className="text-sm text-slate-600 text-center py-6">
              This tender has already been awarded.
            </p>
          )}

          {!loading && !error && !alreadyAwarded && submissions.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">
              No submitted bids to award — contractors must submit before this tender can be awarded.
            </p>
          )}

          {!loading && !error && !alreadyAwarded && submissions.length > 0 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Winning submission
                </label>
                <div className="space-y-2">
                  {submissions.map((s) => (
                    <label
                      key={s.submission_id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        selectedSubmissionId === s.submission_id
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="winning-submission"
                        className="mt-1"
                        checked={selectedSubmissionId === s.submission_id}
                        onChange={() => setSelectedSubmissionId(s.submission_id)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{s.contractor_name}</p>
                        <p className="text-xs text-slate-500">
                          {s.bq_name}
                          {s.submitted_at && ` — submitted ${format(new Date(s.submitted_at), "MMM dd, yyyy")}`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Contract value (SGD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Remark <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Negotiated down from initial bid"
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {!loading && !error && !alreadyAwarded && submissions.length > 0 && (
          <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting || !selectedSubmissionId}>
              {submitting ? "Awarding…" : "Award Tender"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
