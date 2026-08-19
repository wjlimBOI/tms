"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, Users } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface DirectoryUser {
  user_id: number;
  username: string;
  display_name: string | null;
  email: string;
}

interface Props {
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}

export default function NewConversationModal({ onClose, onCreated }: Props) {
  const toast = useNotify();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<DirectoryUser[]>([]);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const debounceTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!search.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/messages/directory?search=${encodeURIComponent(search.trim())}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setResults(data.data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  const toggleSelect = (u: DirectoryUser) => {
    setSelected((prev) =>
      prev.some((p) => p.user_id === u.user_id) ? prev.filter((p) => p.user_id !== u.user_id) : [...prev, u]
    );
  };

  const handleCreate = async () => {
    if (selected.length === 0) {
      toast.error("Select at least one person to message.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_user_ids: selected.map((u) => u.user_id),
          title: selected.length > 1 && title.trim() ? title.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to start the conversation.");
      onCreated(data.conversation_id);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Unable to start the conversation.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
          <div>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#15406a]" />
              New Chat
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Search for anyone — including contractors — to start a chat.
            </DialogDescription>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* No flex-1 here on purpose — this used to stretch to fill the
            dialog's full max-h-[85vh] even when the actual content (chips +
            search box + short results list) was much shorter, leaving a
            large flat empty area. On Chromium that big untextured GPU-
            composited rectangle showed a faint raster-tile seam ("crosshair"
            lines) through its center. Sizing to content avoids the seam and
            is a smaller, tighter modal besides. */}
        <div className="overflow-y-auto p-5 space-y-3">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span
                  key={u.user_id}
                  className="inline-flex items-center gap-1 rounded-md bg-[#15406a]/10 text-[#15406a] text-xs font-medium px-2 py-1"
                >
                  {u.display_name || u.username}
                  <button
                    type="button"
                    aria-label={`Remove ${u.display_name || u.username}`}
                    onClick={() => toggleSelect(u)}
                    className="hover:text-[#0d2d4a]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {selected.length > 1 && (
            <div>
              <label htmlFor="group-title" className="block text-sm font-semibold text-slate-700 mb-1">
                Group name <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="group-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                placeholder="e.g. Project A team"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#15406a] focus:ring-1 focus:ring-[#15406a] transition px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label htmlFor="directory-search" className="block text-sm font-semibold text-slate-700 mb-1">
              Search people
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="directory-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, username, or email…"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#15406a] focus:ring-1 focus:ring-[#15406a] transition pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto" role="listbox" aria-label="Search results">
            {searching ? (
              <p className="text-sm text-slate-400 text-center py-4">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {search.trim() ? "No matches found." : "Start typing to search."}
              </p>
            ) : (
              results.map((u) => {
                const isSelected = selected.some((p) => p.user_id === u.user_id);
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleSelect(u)}
                    className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
                      isSelected ? "bg-[#15406a]/5 text-[#15406a] font-medium" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">
                      {u.display_name || u.username}
                      <span className="text-xs text-slate-400 ml-1.5">{u.email}</span>
                    </span>
                    {isSelected && <span className="text-xs shrink-0">Selected</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="rounded-md border-2 border-[#15406a] bg-white px-4 py-2 text-sm font-semibold text-[#15406a] transition hover:bg-[#15406a] hover:text-white disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || selected.length === 0}
            className="rounded-md bg-[#15406a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d2d4a] disabled:pointer-events-none disabled:opacity-50"
          >
            {creating ? "Starting…" : selected.length > 1 ? "Start Group Chat" : "Start Conversation"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
