"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { MessageSquare, Send, Megaphone } from "lucide-react";
import { ROLE_IDS } from "@/lib/roles";
import { useNotify } from "@/components/ui/notification-provider";
import { Button } from "@/components/ui/Button";
import AnnouncementModal from "@/components/tenders/AnnouncementModal";

interface Message {
  message_id: number;
  sender_id: number;
  sender_name: string;
  is_announcement: boolean;
  body: string;
  created_at: string;
}

interface ContractorOption {
  contractor_id: number;
  contractor_name: string;
  message_count: number;
  last_message_at: string | null;
}

const POLL_INTERVAL_MS = 20000;

export default function TenderMessagesPanel({ tenderId, tenderName }: { tenderId: number; tenderName: string }) {
  const { data: session } = useSession();
  const toast = useNotify();

  const roleIds = ((session?.user as any)?.roleIds || []) as number[];
  const isContractor = roleIds.includes(ROLE_IDS.CONTRACTOR);

  const [accessible, setAccessible] = useState<boolean | null>(null); // null = unknown yet
  const [isStaff, setIsStaff] = useState(false);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [selectedContractorId, setSelectedContractorId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchThread = useCallback(
    async (contractorId: number | null) => {
      try {
        const url = contractorId
          ? `/api/tenders/${tenderId}/messages?contractor_id=${contractorId}`
          : `/api/tenders/${tenderId}/messages`;
        const res = await fetch(url);
        if (res.status === 403) {
          setAccessible(false);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setAccessible(true);
        setIsStaff(!!data.isStaff);
        setMessages(data.data || []);
      } catch {
        // Silent — this is a best-effort panel, not the primary page content.
      }
    },
    [tenderId]
  );

  // Initial load: contractors first resolve their own thread; staff first
  // load the contractor picker, then the selected thread.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (isContractor) {
        await fetchThread(null);
      } else {
        try {
          const res = await fetch(`/api/tenders/${tenderId}/messages/contractors`);
          if (res.status === 403) {
            if (!cancelled) setAccessible(false);
          } else if (res.ok) {
            const data = await res.json();
            if (cancelled) return;
            const list: ContractorOption[] = data.data || [];
            setContractors(list);
            setIsStaff(true);
            if (list.length > 0) {
              setSelectedContractorId(list[0].contractor_id);
              await fetchThread(list[0].contractor_id);
            } else {
              setAccessible(true);
            }
          }
        } catch {
          if (!cancelled) setAccessible(false);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId]);

  // Polling on the active thread while the panel is mounted.
  useEffect(() => {
    if (accessible !== true) return;
    if (isStaff && !selectedContractorId) return;

    pollRef.current = setInterval(() => {
      fetchThread(isContractor ? null : selectedContractorId);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [accessible, isStaff, selectedContractorId, isContractor, fetchThread]);

  const handleSelectContractor = async (contractorId: number) => {
    setSelectedContractorId(contractorId);
    setLoading(true);
    await fetchThread(contractorId);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const payload: Record<string, unknown> = { body: draft.trim() };
      if (isStaff && selectedContractorId) payload.contractor_id = selectedContractorId;

      const res = await fetch(`/api/tenders/${tenderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send the message.");

      setDraft("");
      await fetchThread(isContractor ? null : selectedContractorId);
    } catch (err: any) {
      toast.error(err.message || "Unable to send the message.");
    } finally {
      setSending(false);
    }
  };

  if (accessible === false) return null; // no access — panel doesn't render at all

  return (
    <div id="messages" className="print:hidden mb-6 p-4 bg-white rounded-lg border border-slate-200 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          Messages
        </h3>
        {isStaff && contractors.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAnnouncementModal(true)}
            className="gap-1.5"
          >
            <Megaphone className="w-3.5 h-3.5" /> Send Announcement
          </Button>
        )}
      </div>

      {isStaff && contractors.length > 0 && (
        <div className="mb-3">
          <select
            value={selectedContractorId ?? ""}
            onChange={(e) => handleSelectContractor(parseInt(e.target.value))}
            className="w-full sm:w-72 rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {contractors.map((c) => (
              <option key={c.contractor_id} value={c.contractor_id}>
                {c.contractor_name} ({c.message_count})
              </option>
            ))}
          </select>
        </div>
      )}

      {isStaff && contractors.length === 0 && !loading && (
        <p className="text-sm text-slate-500">No contractors have interacted with this tender yet.</p>
      )}

      {(!isStaff || contractors.length > 0) && (
        <>
          <div className="max-h-72 overflow-y-auto space-y-2 mb-3 border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No messages yet. Ask a question to get started.</p>
            ) : (
              messages.map((m) => (
                <div key={m.message_id} className="text-sm bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-medium text-slate-800">{m.sender_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.is_announcement && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                          Announcement
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">{format(new Date(m.created_at), "MMM dd, HH:mm")}</span>
                    </div>
                  </div>
                  <p className="text-slate-700 whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder={isStaff ? "Reply to this contractor..." : "Ask a question about this tender..."}
              className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 px-3 py-2 text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button type="button" onClick={handleSend} disabled={sending || !draft.trim()} className="shrink-0 self-end gap-1.5">
              <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </>
      )}

      {showAnnouncementModal && (
        <AnnouncementModal
          tenderId={tenderId}
          tenderName={tenderName}
          onClose={() => setShowAnnouncementModal(false)}
          onSent={() => fetchThread(isContractor ? null : selectedContractorId)}
        />
      )}
    </div>
  );
}
