"use client";

import { useState } from "react";
import { X, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { useNotify } from "@/components/ui/notification-provider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import DatePicker from "@/components/ui/DatePicker";

interface Props {
  tenderId: number;
  tenderName: string;
  expectedHandoverDate?: string | null;
  currentHandoverDate?: string | null;
  currentDefectLiabilityMonths?: number | null;
  onClose: () => void;
  onHandedOver: () => void;
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HandoverModal({
  tenderId,
  tenderName,
  expectedHandoverDate,
  currentHandoverDate,
  currentDefectLiabilityMonths,
  onClose,
  onHandedOver,
}: Props) {
  const toast = useNotify();
  const [handoverDate, setHandoverDate] = useState(
    currentHandoverDate ? currentHandoverDate.slice(0, 10) : todayISODate()
  );
  const [defectLiabilityMonths, setDefectLiabilityMonths] = useState(
    (currentDefectLiabilityMonths ?? 12).toString()
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isUpdate = !!currentHandoverDate;

  const handleSubmit = async () => {
    if (!handoverDate) {
      toast.error("Select the actual handover date.");
      return;
    }
    const months = parseInt(defectLiabilityMonths, 10);
    if (isNaN(months) || months <= 0) {
      toast.error("Enter a defect liability period greater than 0 months.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handover_date: handoverDate,
          defect_liability_months: months,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to record the handover.");

      toast.success(isUpdate ? "Handover updated successfully." : "Tender marked as handed over.");
      onHandedOver();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Unable to record the handover.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
          <div>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-emerald-500" />
              {isUpdate ? "Update Handover" : "Mark as Handed Over"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">{tenderName}</DialogDescription>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {expectedHandoverDate && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Expected handover date (planning estimate): <span className="font-medium text-slate-700">{format(new Date(expectedHandoverDate), "MMM dd, yyyy")}</span>
              {" — actual handover may differ."}
            </p>
          )}

          <DatePicker
            label="Actual handover date"
            max={todayISODate()}
            value={handoverDate}
            onChange={(e) => setHandoverDate(e.target.value)}
          />

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Defect Liability Period (months)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={defectLiabilityMonths}
              onChange={(e) => setDefectLiabilityMonths(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="e.g. Handover accepted with minor punch-list items"
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : isUpdate ? "Update Handover" : "Confirm Handover"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
