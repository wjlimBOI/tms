"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { UserPlus } from "lucide-react";
import { ROLE_IDS } from "@/lib/roles";
import InviteContractorsModal from "@/components/tenders/InviteContractorsModal";

// Replaces the old chat-based TenderMessagesPanel (removed 2026-08-21 —
// contractor/staff conversations now happen over email). Staff-only: lets
// staff send an email invitation to specific contractors for this tender.
export default function TenderContactPanel({ tenderId, tenderName }: { tenderId: number; tenderName: string }) {
  const { data: session } = useSession();

  const roleIds = ((session?.user as any)?.roleIds || []) as number[];
  const isStaff = !roleIds.includes(ROLE_IDS.CONTRACTOR);

  const [showInviteModal, setShowInviteModal] = useState(false);

  if (!isStaff) return null;

  return (
    <div className="print:hidden mb-6 p-4 bg-white rounded-lg border border-slate-200">
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
