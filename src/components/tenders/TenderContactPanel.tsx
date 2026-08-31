"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, FileText, HelpCircle } from "lucide-react";
import { ROLE_IDS } from "@/lib/roles";
import { useNotify } from "@/components/ui/notification-provider";
import InviteContractorsModal from "@/components/tenders/InviteContractorsModal";

// Replaces the old chat-based TenderMessagesPanel (removed 2026-08-21 —
// contractor/staff conversations now happen over email). This panel keeps
// the two email-triggered actions that used to live inside that panel:
// staff inviting contractors, and contractors requesting drawings/info from
// the project manager.
export default function TenderContactPanel({ tenderId, tenderName }: { tenderId: number; tenderName: string }) {
  const { data: session } = useSession();
  const toast = useNotify();

  const roleIds = ((session?.user as any)?.roleIds || []) as number[];
  const isContractor = roleIds.includes(ROLE_IDS.CONTRACTOR);
  const isStaff = !isContractor;

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [draft, setDraft] = useState("");
  const [requestingType, setRequestingType] = useState<"drawings" | "information" | null>(null);

  const handleRequest = async (requestType: "drawings" | "information") => {
    if (!draft.trim()) {
      toast.error("Add a short message describing what you need before requesting it.");
      return;
    }
    setRequestingType(requestType);
    try {
      const res = await fetch(`/api/tender-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tender_id: tenderId, request_type: requestType, message: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send the request.");

      setDraft("");
      toast.success(
        requestType === "drawings"
          ? "Drawings request sent — the project manager has been notified by email."
          : "Information request sent — the project manager has been notified by email."
      );
    } catch (err: any) {
      toast.error(err.message || "Unable to send the request.");
    } finally {
      setRequestingType(null);
    }
  };

  if (!isStaff && !isContractor) return null;

  return (
    <div className="print:hidden mb-6 p-4 bg-white rounded-lg border border-slate-200">
      {isStaff && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Invite Contractors</h3>
            <p className="text-xs text-slate-500 mt-0.5">Send an email invitation for this tender.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 rounded-md border border-[#15406a] bg-white px-3 py-1.5 text-xs font-semibold text-[#15406a] transition-colors hover:bg-[#15406a] hover:text-white"
          >
            <UserPlus className="w-3.5 h-3.5" /> Send Invitation
          </button>
        </div>
      )}

      {isContractor && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Need something from the project manager?</h3>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Describe what you need..."
            className="w-full min-h-[4.5rem] rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#15406a] px-3 py-2 text-sm resize-y"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => handleRequest("drawings")}
              disabled={requestingType !== null || !draft.trim()}
              className="flex items-center gap-1.5 rounded-md border border-[#15406a] bg-white px-3 py-1.5 text-xs font-semibold text-[#15406a] transition-colors hover:bg-[#15406a] hover:text-white disabled:pointer-events-none disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              {requestingType === "drawings" ? "Sending…" : "Request Drawings"}
            </button>
            <button
              type="button"
              onClick={() => handleRequest("information")}
              disabled={requestingType !== null || !draft.trim()}
              className="flex items-center gap-1.5 rounded-md border border-[#15406a] bg-white px-3 py-1.5 text-xs font-semibold text-[#15406a] transition-colors hover:bg-[#15406a] hover:text-white disabled:pointer-events-none disabled:opacity-50"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {requestingType === "information" ? "Sending…" : "Request More Info"}
            </button>
            <p className="text-[11px] text-slate-400 self-center">
              Type your request above, then choose an option — the project manager is notified by email.
            </p>
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteContractorsModal
          tenderId={tenderId}
          tenderName={tenderName}
          onClose={() => setShowInviteModal(false)}
          onSent={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}
