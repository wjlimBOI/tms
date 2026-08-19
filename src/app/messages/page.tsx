"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Send, Plus, ArrowLeft, Users } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";
import { relativeTime } from "@/lib/relativeTime";
import NewConversationModal from "@/components/messages/NewConversationModal";

interface ConversationParticipant {
  user_id: number;
  username: string;
  display_name: string | null;
}

interface ConversationSummary {
  conversation_id: number;
  is_group: boolean;
  title: string;
  participants: ConversationParticipant[];
  last_message: { sender_id: number; sender_name: string; preview: string; created_at: string } | null;
  unread_count: number;
  updated_at: string;
}

interface Message {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_display_name: string | null;
  body: string;
  created_at: string;
}

const POLL_INTERVAL_MS = 20000;

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useNotify();

  const currentUserId = (session?.user as any)?.id as number | undefined;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showMobileThread, setShowMobileThread] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  const conversationsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [status, session, router]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConversations(data.data || []);
      setConversationsError(false);
    } catch {
      setConversationsError(true);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setConversationsLoading(true);
      await fetchConversations();
      setConversationsLoading(false);
    })();
  }, [session, fetchConversations]);

  useEffect(() => {
    if (!session) return;
    conversationsPollRef.current = setInterval(fetchConversations, POLL_INTERVAL_MS);
    return () => {
      if (conversationsPollRef.current) clearInterval(conversationsPollRef.current);
    };
  }, [session, fetchConversations]);

  // Deep-link support: /messages?conversation=<id>
  useEffect(() => {
    const fromQuery = searchParams.get("conversation");
    if (fromQuery) {
      const id = parseInt(fromQuery, 10);
      if (!isNaN(id)) {
        setSelectedId(id);
        setShowMobileThread(true);
      }
    }
  }, [searchParams]);

  const fetchThread = useCallback(async (conversationId: number) => {
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(data.data || []);
    } catch {
      toast.error("Unable to load this conversation right now.");
    }
  }, [toast]);

  const markRead = useCallback(async (conversationId: number) => {
    try {
      await fetch(`/api/messages/conversations/${conversationId}/read`, { method: "POST" });
      setConversations((prev) =>
        prev.map((c) => (c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c))
      );
    } catch {
      // best-effort — an unread badge staying stale isn't worth surfacing an error for
    }
  }, []);

  const handleSelectConversation = async (conversationId: number) => {
    setSelectedId(conversationId);
    setShowMobileThread(true);
    setThreadLoading(true);
    await fetchThread(conversationId);
    setThreadLoading(false);
    void markRead(conversationId);
  };

  useEffect(() => {
    if (!selectedId) return;
    threadPollRef.current = setInterval(() => fetchThread(selectedId), POLL_INTERVAL_MS);
    return () => {
      if (threadPollRef.current) clearInterval(threadPollRef.current);
    };
  }, [selectedId, fetchThread]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || !selectedId) return;
    const body = draft.trim();
    setSending(true);
    try {
      const res = await fetch(`/api/messages/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send the message.");

      setDraft("");
      await fetchThread(selectedId);
      await fetchConversations();
    } catch (err: any) {
      toast.error(err.message || "Unable to send the message. Your draft has been kept.");
    } finally {
      setSending(false);
    }
  };

  const handleConversationCreated = async (conversationId: number) => {
    await fetchConversations();
    await handleSelectConversation(conversationId);
  };

  const selectedConversation = conversations.find((c) => c.conversation_id === selectedId) || null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#15406a]" />
          Messages
        </h1>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-[#15406a] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0d2d4a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a]/50"
        >
          <Plus className="w-4 h-4" /> New Chat
        </button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-11rem)] min-h-[24rem]">
        {/* Conversation list */}
        <div className={`w-full md:w-80 shrink-0 flex-col ${showMobileThread ? "hidden md:flex" : "flex"}`}>
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
            {conversationsLoading ? (
              <p className="text-sm text-slate-400 text-center py-8">Loading conversations…</p>
            ) : conversationsError ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-slate-500 mb-2">Unable to load your conversations.</p>
                <button
                  type="button"
                  onClick={fetchConversations}
                  className="text-xs font-semibold text-[#15406a] hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-slate-500 mb-1">No conversations yet.</p>
                <p className="text-xs text-slate-400">Start one to message anyone on the team.</p>
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.conversation_id}
                  type="button"
                  onClick={() => handleSelectConversation(c.conversation_id)}
                  aria-current={c.conversation_id === selectedId}
                  className={`w-full text-left flex items-start gap-2 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a]/50 focus-visible:ring-inset ${
                    c.conversation_id === selectedId ? "bg-[#15406a]/5" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1">
                        {c.is_group && <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        {c.title}
                      </p>
                      {c.last_message && (
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">{relativeTime(c.last_message.created_at)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-slate-500 truncate">
                        {c.last_message ? c.last_message.preview : "No messages yet"}
                      </p>
                      {c.unread_count > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-md bg-[#15406a] text-[10px] font-bold text-white shrink-0">
                          {c.unread_count > 9 ? "9+" : c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Active thread */}
        <div className={`flex-1 min-w-0 flex-col ${showMobileThread ? "flex" : "hidden md:flex"}`}>
          {!selectedConversation ? (
            <div className="flex-1 flex items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
              <p className="text-sm text-slate-400">Select a conversation to start messaging.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMobileThread(false)}
                  aria-label="Back to conversations"
                  className="md:hidden p-1 -ml-1 text-slate-500 hover:text-[#15406a]"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                    {selectedConversation.is_group && <Users className="w-3.5 h-3.5 text-slate-400" />}
                    {selectedConversation.title}
                  </p>
                  {selectedConversation.is_group && (
                    <p className="text-[11px] text-slate-400 truncate">
                      {selectedConversation.participants.map((p) => p.display_name || p.username).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              <div
                ref={messageListRef}
                role="log"
                aria-live="polite"
                aria-label="Conversation messages"
                className="flex-1 overflow-y-auto space-y-2 p-4 bg-slate-50/50"
              >
                {threadLoading ? (
                  <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No messages yet. Say hello!</p>
                ) : (
                  messages.map((m) => {
                    const isOwn = m.sender_id === currentUserId;
                    return (
                      <div key={m.message_id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isOwn ? "bg-[#15406a] text-white" : "bg-white border border-slate-200 text-slate-700"}`}>
                          {!isOwn && selectedConversation.is_group && (
                            <p className="text-[11px] font-semibold mb-0.5 text-slate-500">{m.sender_display_name || m.sender_name}</p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`text-[10px] mt-1 ${isOwn ? "text-white/70" : "text-slate-400"}`}>
                            {relativeTime(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-center gap-2 p-3 border-t border-slate-200">
                <label htmlFor="message-draft" className="sr-only">Message</label>
                <textarea
                  id="message-draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={1}
                  maxLength={4000}
                  placeholder="Type a message…"
                  className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#15406a] px-3 py-2 text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  aria-label="Send message"
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#15406a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0d2d4a] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a]/50"
                >
                  <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewConversationModal onClose={() => setShowNewModal(false)} onCreated={handleConversationCreated} />
      )}
    </div>
  );
}
