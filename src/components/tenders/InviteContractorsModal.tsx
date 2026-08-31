"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Search } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Candidate {
  user_id: number;
  email: string;
  full_name: string;
  company_name: string | null;
}

interface Props {
  tenderId: number;
  tenderName: string;
  onClose: () => void;
  onSent: () => void;
}

export default function InviteContractorsModal({ tenderId, tenderName, onClose, onSent }: Props) {
  const toast = useNotify();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      fetch(`/api/tenders/${tenderId}/invite/candidates?search=${encodeURIComponent(search)}`)
        .then((res) => res.json())
        .then((data) => setCandidates(data.candidates || []))
        .catch(() => toast.error("Unable to load contractors. Please try again."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId, search]);

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one contractor to invite.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractor_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send invitations.");

      toast.success(
        `Invitation sent to ${data.invitedCount} contractor${data.invitedCount === 1 ? "" : "s"}.`
      );
      onSent();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Unable to send invitations.");
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
              <UserPlus className="w-4 h-4 text-[#15406a]" />
              Send Invitation
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">{tenderName}</DialogDescription>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-slate-500">
            Selected contractors receive an email invitation with a link to accept or decline directly, or they can
            log in to respond. The invitation subject and message use the fixed template configured in Settings.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contractors by name, company, or email..."
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#15406a] focus:ring-1 focus:ring-[#15406a] transition pl-9 pr-3 py-2 text-sm"
            />
          </div>

          <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-6">Loading contractors…</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No eligible contractors found. They may already be invited to this tender.
              </p>
            ) : (
              candidates.map((c) => (
                <label
                  key={c.user_id}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.user_id)}
                    onChange={() => toggle(c.user_id)}
                    className="w-4 h-4 rounded border-slate-300 text-[#15406a] focus:ring-[#15406a]"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{c.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {c.company_name ? `${c.company_name} · ` : ""}
                      {c.email}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          {selectedIds.size > 0 && (
            <p className="text-xs text-slate-500">
              {selectedIds.size} contractor{selectedIds.size === 1 ? "" : "s"} selected.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border-2 border-[#15406a] bg-white px-4 py-2 text-sm font-semibold text-[#15406a] transition hover:bg-[#15406a] hover:text-white disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selectedIds.size === 0}
            className="rounded-md bg-[#15406a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d2d4a] disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send Invitation"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
