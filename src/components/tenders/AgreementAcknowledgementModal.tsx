"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, FileText, ShieldCheck } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";

interface Props {
  tenderId: number;
  tenderName: string;
  onClose: () => void;
  onAcknowledged: () => void;
}

// One-time gate in front of the BQ: contractors confirm they've read and
// agree to the Form of Tender terms, instead of filling and digitally
// signing the full form every visit. The actual filled-and-signed document
// is still produced from tenders/[id]/edit (print/save as PDF) and emailed
// in separately - this modal only records the acknowledgement that unlocks
// BQ access (see /api/tenders/[id]/acknowledge).
//
// Plain hand-built card instead of the shared base-ui Dialog - same fix
// already applied to confirm-dialog.tsx for the "crosshair" rendering
// artifact (moire lines from backdrop-blur/ring compositing over busy
// backgrounds). No grid/ring/backdrop-filter here, so there's nothing left
// for that interaction to go wrong in.
export default function AgreementAcknowledgementModal({ tenderId, tenderName, onClose, onAcknowledged }: Props) {
  const toast = useNotify();
  const [fullName, setFullName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = agreed && fullName.trim().length > 0 && !submitting;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to record your acknowledgement.");

      toast.success("Acknowledgement recorded — you can access the BQ anytime from here on.");
      onAcknowledged();
    } catch (err: any) {
      toast.error(err.message || "Unable to record your acknowledgement. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-modal-title"
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white shadow-lg border border-slate-200"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
          <div>
            <h2 id="ack-modal-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#15406a]" />
              Agreement &amp; Acknowledgement
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{tenderName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <p className="text-sm leading-[1.7] text-slate-600">
            Before you can view and price the Bill of Quantities for this tender, please confirm that you have
            read and agree to the terms and conditions set out in the Form of Tender. This is a one-time step —
            once acknowledged, you can return to the BQ anytime while this tender is open.
          </p>

          <p className="text-sm leading-[1.7] text-slate-600">
            You'll still need to complete, sign, and email us your Form of Tender separately. You can view and
            print it below.
          </p>

          <Link
            href={`/tenders/${tenderId}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#15406a] bg-white px-4 py-2.5 text-sm font-semibold text-[#15406a] transition hover:bg-[#15406a] hover:text-white"
          >
            <FileText className="w-4 h-4" />
            View &amp; Print Form of Tender
          </Link>

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#15406a] focus:ring-2 focus:ring-[#15406a]"
              />
              <span>I confirm that I have read and agree to the terms and conditions of the Form of Tender for this tender.</span>
            </label>

            <div>
              <label htmlFor="ack-full-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Type your full name to acknowledge
              </label>
              <input
                id="ack-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={200}
                placeholder="Full name"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#15406a] px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-[#15406a] bg-white px-4 py-2 text-sm font-semibold text-[#15406a] transition hover:bg-[#15406a] hover:text-white disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md bg-[#15406a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d2d4a] disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Agree & Continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
