"use client";

import { useState } from "react";
import { X, Megaphone } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  tenderId: number;
  tenderName: string;
  onClose: () => void;
  onSent: () => void;
}

export default function AnnouncementModal({ tenderId, tenderName, onClose, onSent }: Props) {
  const toast = useNotify();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!body.trim()) {
      toast.error("Enter the announcement text.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), is_announcement: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send the announcement.");

      toast.success(
        data.notifiedCount
          ? `Announcement sent to ${data.notifiedCount} contractor${data.notifiedCount === 1 ? "" : "s"}.`
          : "Announcement sent."
      );
      onSent();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Unable to send the announcement.");
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
              <Megaphone className="w-4 h-4 text-amber-500" />
              Send Announcement
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">{tenderName}</DialogDescription>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-slate-500">
            This message is sent to every contractor with a thread on this tender at once — each contractor sees it only in their own private thread, never anyone else's.
          </p>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Announcement
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="e.g. Site access hours have changed for next week..."
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !body.trim()}>
            {submitting ? "Sending…" : "Send Announcement"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
