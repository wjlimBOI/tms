"use client";

import { useEffect, useState } from "react";
import { X, Users, Mail, Phone, Building2 } from "lucide-react";
import { format } from "date-fns";

interface InterestEntry {
  interest_id: number;
  interest_note: string | null;
  is_approved: boolean;
  submitted_at: string | null;
  created_at: string;
  username?: string;
  email?: string;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
}

interface Props {
  tenderId: number;
  tenderName: string;
  onClose: () => void;
}

export default function TenderInterestModal({ tenderId, tenderName, onClose }: Props) {
  const [interests, setInterests] = useState<InterestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tenders/${tenderId}/interest`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load interest list");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setInterests(data.interests || []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the list of interested contractors.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenderId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Interested Contractors
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{tenderName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-lg" />
              ))}
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-rose-600 text-center py-6">{error}</p>
          )}

          {!loading && !error && interests.length === 0 && (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                No contractors have registered interest yet.
              </p>
            </div>
          )}

          {!loading && !error && interests.length > 0 && (
            <ul className="space-y-2">
              {interests.map((entry) => (
                <li
                  key={entry.interest_id}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm text-slate-900">
                      {entry.full_name || entry.username || "Unnamed contractor"}
                    </p>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {entry.created_at ? format(new Date(entry.created_at), "MMM dd, yyyy") : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                    {entry.company_name && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {entry.company_name}
                      </span>
                    )}
                    {entry.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {entry.email}
                      </span>
                    )}
                    {entry.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {entry.phone}
                      </span>
                    )}
                  </div>
                  {entry.interest_note && (
                    <p className="mt-1.5 text-xs text-slate-600 italic">
                      &quot;{entry.interest_note}&quot;
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
