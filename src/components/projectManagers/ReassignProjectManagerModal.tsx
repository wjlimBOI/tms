"use client";

import { useState, useEffect, useCallback } from "react";
import { useNotify } from "@/components/ui/notification-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ProjectManagerSelect from "@/components/tenders/ProjectManagerSelect";

interface OldProjectManager {
  id: number;
  name: string;
  email: string;
}

interface CurrentTender {
  tender_id: number;
  tender_name: string;
  stage: number;
  closing_date: string | null;
  handover_date: string | null;
}

interface ReassignmentHistoryRow {
  id: number;
  old_project_manager_id: number;
  new_project_manager_id: number;
  scope: "global" | "tenders";
  tender_ids: number[] | null;
  effective_from: string;
  created_at: string;
  old_pm_name: string;
  old_pm_email: string;
  new_pm_name: string;
  new_pm_email: string;
  changed_by_name: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  oldProjectManager: OldProjectManager;
  onSuccess?: () => void;
}

const STAGE_NAMES = ["Upcoming", "Open", "Closed", "Awarded"];

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function ReassignProjectManagerModal({ open, onClose, oldProjectManager, onSuccess }: Props) {
  const toast = useNotify();

  const [newPmId, setNewPmId] = useState<number | null>(null);
  const [newPmName, setNewPmName] = useState("");
  const [scope, setScope] = useState<"global" | "tenders">("global");
  const [effectiveFrom, setEffectiveFrom] = useState(() => toLocalDatetimeInputValue(new Date()));

  const [currentTenders, setCurrentTenders] = useState<CurrentTender[]>([]);
  const [tendersLoading, setTendersLoading] = useState(false);
  const [tendersError, setTendersError] = useState<string | null>(null);
  const [selectedTenderIds, setSelectedTenderIds] = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ReassignmentHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const minDatetimeLocal = toLocalDatetimeInputValue(new Date());

  const resetForm = useCallback(() => {
    setNewPmId(null);
    setNewPmName("");
    setScope("global");
    setEffectiveFrom(toLocalDatetimeInputValue(new Date()));
    setSelectedTenderIds(new Set());
    setFormError(null);
  }, []);

  useEffect(() => {
    if (open) {
      resetForm();
      setHistoryOpen(false);
      setHistoryLoaded(false);
      setHistory([]);
    }
  }, [open, oldProjectManager.id, resetForm]);

  const fetchCurrentTenders = useCallback(async () => {
    setTendersLoading(true);
    setTendersError(null);
    try {
      const res = await fetch(`/api/project-managers/${oldProjectManager.id}/current-tenders`);
      if (!res.ok) throw new Error("Failed to load tenders");
      const data: CurrentTender[] = await res.json();
      setCurrentTenders(data);
    } catch (err) {
      console.error(err);
      setTendersError("Could not load this project manager's current tenders. Please try again.");
    } finally {
      setTendersLoading(false);
    }
  }, [oldProjectManager.id]);

  useEffect(() => {
    if (open && scope === "tenders" && currentTenders.length === 0 && !tendersLoading && !tendersError) {
      fetchCurrentTenders();
    }
  }, [open, scope, currentTenders.length, tendersLoading, tendersError, fetchCurrentTenders]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/project-managers/${oldProjectManager.id}/reassignments`);
      if (!res.ok) throw new Error("Failed to load history");
      const data: ReassignmentHistoryRow[] = await res.json();
      setHistory(data);
      setHistoryLoaded(true);
    } catch (err) {
      console.error(err);
      setHistoryError("Could not load reassignment history. Please try again.");
    } finally {
      setHistoryLoading(false);
    }
  }, [oldProjectManager.id]);

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && !historyLoaded) {
      fetchHistory();
    }
  };

  const toggleTenderSelected = (tenderId: number) => {
    setSelectedTenderIds((prev) => {
      const next = new Set(prev);
      if (next.has(tenderId)) next.delete(tenderId);
      else next.add(tenderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTenderIds.size === currentTenders.length) {
      setSelectedTenderIds(new Set());
    } else {
      setSelectedTenderIds(new Set(currentTenders.map((t) => t.tender_id)));
    }
  };

  const handlePmChange = (pmId: number | null, pmDetails?: { id: number; name: string }) => {
    if (pmId === oldProjectManager.id) {
      setFormError("The replacement project manager must be different from the one being replaced.");
      setNewPmId(null);
      setNewPmName(pmDetails?.name || "");
      return;
    }
    setFormError(null);
    setNewPmId(pmId);
    setNewPmName(pmDetails?.name || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newPmId) {
      setFormError("Please select a replacement project manager.");
      return;
    }
    if (newPmId === oldProjectManager.id) {
      setFormError("The replacement project manager must be different from the one being replaced.");
      return;
    }
    if (scope === "tenders" && selectedTenderIds.size === 0) {
      setFormError("Please select at least one tender to reassign.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        newProjectManagerId: newPmId,
        scope,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
      };
      if (scope === "tenders") {
        payload.tenderIds = Array.from(selectedTenderIds);
      }

      const res = await fetch(`/api/project-managers/${oldProjectManager.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Reassignment failed. Please try again.");
      }

      toast.success(`Tenders reassigned to ${newPmName || "the replacement project manager"}.`);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Reassignment failed. Please try again.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="text-xl font-semibold text-slate-900">
          Reassign Project Manager
        </DialogTitle>
        <DialogDescription className="text-sm text-slate-500 mb-2">
          Move some or all of {oldProjectManager.name}&apos;s tenders to a replacement project manager.
          Historical tender records are never changed — only future reminders and permissions.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="space-y-5" aria-label="Reassign project manager">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Resigning project manager
            </p>
            <p className="text-sm font-medium text-slate-900">{oldProjectManager.name}</p>
            <p className="text-xs text-slate-500">{oldProjectManager.email}</p>
          </div>

          <div>
            <ProjectManagerSelect
              value={newPmId}
              onChange={handlePmChange}
              initialName={newPmName}
              required
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-semibold text-slate-700 mb-2">Scope</legend>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="reassign-scope"
                  value="global"
                  checked={scope === "global"}
                  onChange={() => setScope("global")}
                  className="h-4 w-4 text-[#15406a] focus:ring-2 focus:ring-[#15406a] focus:ring-offset-2"
                />
                All of their tenders
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="reassign-scope"
                  value="tenders"
                  checked={scope === "tenders"}
                  onChange={() => setScope("tenders")}
                  className="h-4 w-4 text-[#15406a] focus:ring-2 focus:ring-[#15406a] focus:ring-offset-2"
                />
                Specific tenders
              </label>
            </div>
          </fieldset>

          {scope === "tenders" && (
            <div className="border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Tenders currently assigned to {oldProjectManager.name}
                </span>
                {currentTenders.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs font-medium text-[#15406a] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] rounded"
                  >
                    {selectedTenderIds.size === currentTenders.length ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>

              {tendersLoading && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-[#15406a] border-t-transparent rounded-full animate-spin" />
                  Loading tenders…
                </div>
              )}

              {!tendersLoading && tendersError && (
                <div className="px-3 py-4 text-sm text-rose-600">
                  {tendersError}{" "}
                  <button
                    type="button"
                    onClick={fetchCurrentTenders}
                    className="underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] rounded"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!tendersLoading && !tendersError && currentTenders.length === 0 && (
                <p className="px-3 py-4 text-sm text-slate-500">
                  This project manager has no tenders currently assigned.
                </p>
              )}

              {!tendersLoading && !tendersError && currentTenders.length > 0 && (
                <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100" role="group" aria-label="Select tenders to reassign">
                  {currentTenders.map((t) => (
                    <li key={t.tender_id} className="px-3 py-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTenderIds.has(t.tender_id)}
                          onChange={() => toggleTenderSelected(t.tender_id)}
                          className="mt-0.5 h-4 w-4 rounded text-[#15406a] focus:ring-2 focus:ring-[#15406a] focus:ring-offset-2"
                        />
                        <span className="flex-1">
                          <span className="block font-medium text-slate-900">{t.tender_name}</span>
                          <span className="block text-xs text-slate-500">
                            {STAGE_NAMES[t.stage] || `Stage ${t.stage}`} · Closing {formatDateOnly(t.closing_date)}
                            {t.handover_date ? ` · Handover ${formatDateOnly(t.handover_date)}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <label htmlFor="reassign-effective-from" className="block text-sm font-semibold text-slate-700 mb-1">
              Effective from
            </label>
            <input
              id="reassign-effective-from"
              type="datetime-local"
              value={effectiveFrom}
              min={minDatetimeLocal}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-[#15406a] focus:ring-1 focus:ring-[#15406a] transition px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">Defaults to now. Cannot be set in the past.</p>
          </div>

          {formError && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] focus-visible:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#15406a] hover:bg-[#0d2d4a] rounded-lg text-sm font-medium text-white shadow-sm transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] focus-visible:ring-offset-2"
            >
              {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
              {submitting ? "Reassigning…" : "Reassign"}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={toggleHistory}
            aria-expanded={historyOpen}
            aria-controls="reassignment-history-panel"
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] rounded"
          >
            <svg
              className={`w-4 h-4 transition-transform ${historyOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Reassignment history
          </button>

          {historyOpen && (
            <div id="reassignment-history-panel" className="mt-3">
              {historyLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-[#15406a] border-t-transparent rounded-full animate-spin" />
                  Loading history…
                </div>
              )}
              {!historyLoading && historyError && (
                <div className="text-sm text-rose-600">
                  {historyError}{" "}
                  <button type="button" onClick={fetchHistory} className="underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] rounded">
                    Retry
                  </button>
                </div>
              )}
              {!historyLoading && !historyError && history.length === 0 && (
                <p className="text-sm text-slate-500">No reassignments have been made yet.</p>
              )}
              {!historyLoading && !historyError && history.length > 0 && (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h.id} className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="font-medium text-slate-800">{h.old_pm_name}</span> ({h.old_pm_email}) →{" "}
                      <span className="font-medium text-slate-800">{h.new_pm_name}</span> ({h.new_pm_email})
                      <br />
                      Scope: {h.scope === "global" ? "All tenders" : `${h.tender_ids?.length ?? 0} tender(s)`} · Effective{" "}
                      {new Date(h.effective_from).toLocaleString()} · Changed by {h.changed_by_name || "Unknown"} on{" "}
                      {new Date(h.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
