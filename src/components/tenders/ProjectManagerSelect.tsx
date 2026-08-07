"use client";

import { useState, useEffect, useRef } from "react";
import { useNotify } from "@/components/ui/notification-provider";

interface ProjectManager {
  id: number;
  name: string;
  email: string;
  phone: string | null;
}

interface Props {
  value: number | null;
  onChange: (pmId: number | null, pmDetails?: ProjectManager) => void;
  initialName?: string;
  required?: boolean;
  hideLabel?: boolean;
}

function formatPhoneForDisplay(phone: string | null): string {
  if (!phone) return "";
  if (phone.startsWith("+65") && phone.length === 11) {
    return `+65 ${phone.slice(3, 7)} ${phone.slice(7)}`;
  }
  if (phone.startsWith("+") && phone.length >= 4) {
    return `+${phone.slice(1, 3)} ${phone.slice(3)}`;
  }
  return phone;
}

function toE164(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("65")) digits = "+" + digits;
  else if (digits.length === 8) digits = "+65" + digits;
  else if (!digits.startsWith("+")) digits = "+" + digits;
  return digits;
}

export default function ProjectManagerSelect({
  value,
  onChange,
  initialName = "",
  required = false,
  hideLabel = false,
}: Props) {
  const toast = useNotify();
  const [pmList, setPmList] = useState<ProjectManager[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialName);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownAbove, setDropdownAbove] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPM, setNewPM] = useState({ name: "", email: "", phone: "" });
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch PMs with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const fetchPMs = async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/project-managers?search=${encodeURIComponent(searchTerm)}`);
          const data = await res.json();
          setPmList(data);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchPMs();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Smart positioning: decide if dropdown should be above or below
  useEffect(() => {
    if (showDropdown && pmList.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Estimate dropdown height (approx 56px per item + padding, capped at 300px)
      const estimatedHeight = Math.min(300, pmList.length * 56 + 20);
      setDropdownAbove(spaceBelow < estimatedHeight && spaceAbove > estimatedHeight);
    }
  }, [showDropdown, pmList]);

  const handleSelect = (pm: ProjectManager) => {
    setSearchTerm(pm.name);
    setShowDropdown(false);
    onChange(pm.id, pm);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    setShowDropdown(true);
    if (!pmList.some((pm) => pm.name === val)) {
      onChange(null);
    }
  };

  const handleCreate = async () => {
    if (!newPM.name || !newPM.email) {
      toast.error("Name and email are required.");
      return;
    }
    let phoneValue = newPM.phone;
    if (phoneValue) {
      phoneValue = toE164(phoneValue);
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/project-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newPM, phone: phoneValue }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Creation failed");
      }
      const created: ProjectManager = await res.json();
      setPmList((prev) => [created, ...prev]);
      setSearchTerm(created.name);
      onChange(created.id, created);
      setIsModalOpen(false);
      setNewPM({ name: "", email: "", phone: "" });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      {!hideLabel && (
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
          Project Manager {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search or select project manager..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition pr-8"
          />
          {loading && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Dropdown – smart positioning and custom scrollbar */}
          {showDropdown && pmList.length > 0 && (
            <ul
              ref={dropdownRef}
              className={`absolute z-50 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-y-auto
                ${dropdownAbove ? "bottom-full mb-1" : "top-full mt-1"}
                max-h-[min(60vh,300px)]`}
              style={{
                // Ensure dropdown doesn't exceed viewport boundaries
                maxHeight: dropdownAbove
                  ? `min(300px, ${inputRef.current ? inputRef.current.getBoundingClientRect().top - 10 : 300}px)`
                  : `min(300px, ${inputRef.current ? window.innerHeight - inputRef.current.getBoundingClientRect().bottom - 10 : 300}px)`,
              }}
            >
              {pmList.map((pm) => (
                <li
                  key={pm.id}
                  onClick={() => handleSelect(pm)}
                  className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-slate-900 dark:text-white"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{pm.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {pm.email} {pm.phone ? `· ${formatPhoneForDisplay(pm.phone)}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap"
        >
          + New PM
        </button>
      </div>

      {/* Modal – already responsive */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Add Project Manager</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., John Doe"
                  value={newPM.name}
                  onChange={(e) => setNewPM({ ...newPM, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="john@example.com"
                  value={newPM.email}
                  onChange={(e) => setNewPM({ ...newPM, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  placeholder="+6512345678"
                  value={newPM.phone}
                  onChange={(e) => setNewPM({ ...newPM, phone: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Use E.164 format, e.g. +6512345678 (no spaces)
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-medium transition disabled:opacity-50 shadow-sm"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}