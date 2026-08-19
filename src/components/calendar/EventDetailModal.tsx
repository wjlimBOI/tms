"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays, Clock, MapPin, FileText, ArrowUpRight, X } from "lucide-react";
import { getBrandColor } from "@/lib/brandColors";
import { getEventMainTitle, getEventPeriodLabel } from "@/lib/calendarEvent";

export interface CalendarEventDetail {
  event_id: number;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  event_type: string | null;
  location: string | null;
  brand_name: string | null;
  tender_name: string | null;
  tender_id?: number | null;
}

// Deliberately not built on the shared base-ui Dialog (src/components/ui/dialog.tsx):
// that component's transform-centered, animated Popup produced a faint
// hairline "crosshair" seam through the card content on this page - the
// same class of rendering artifact src/components/ui/confirm-dialog.tsx
// hit and fixed the same way, by dropping to a plain dimmed overlay + a
// non-transformed, non-animated centered card with nothing left for a
// GPU compositing seam to appear in.
export function EventDetailModal({
  event,
  open,
  onClose,
}: {
  event: CalendarEventDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !event || typeof window === "undefined") return null;

  const mainTitle = getEventMainTitle(event.title, event.tender_name);
  const periodLabel = getEventPeriodLabel(event.title, event.tender_name);
  const brandColor = event.brand_name ? getBrandColor(event.brand_name) : null;

  const startDate = new Date(event.start_date);
  const endDate = event.end_date ? new Date(event.end_date) : null;
  const isRange = endDate && endDate.toDateString() !== startDate.toDateString();

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
        aria-labelledby="event-detail-title"
        className="w-full max-w-md rounded-xl bg-white shadow-lg border border-slate-200 p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {event.brand_name && (
              <span
                className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap text-white mb-2"
                style={{ backgroundColor: `${brandColor!.borderColor}bf` }}
              >
                {event.brand_name}
              </span>
            )}
            <h2 id="event-detail-title" className="text-lg font-bold text-slate-900 leading-snug">
              {mainTitle}
            </h2>
            {periodLabel && (
              <p className="text-sm text-slate-500 mt-0.5">{periodLabel}</p>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 transition flex-shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 text-sm mt-4">
          <div className="flex items-start gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span className="text-slate-700">
              {format(startDate, "PPP")}
              {isRange && ` – ${format(endDate!, "PPP")}`}
            </span>
          </div>
          {!event.all_day && (
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-slate-700">
                {format(startDate, "p")}
                {endDate && ` – ${format(endDate, "p")}`}
              </span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span className="text-slate-700">{event.location || "No location set"}</span>
          </div>
          {event.description && (
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-slate-700">{event.description}</span>
            </div>
          )}
        </div>

        {event.tender_id && (
          <Link
            href={`/tenders/${event.tender_id}`}
            className="inline-flex items-center gap-1 text-sm text-[#15406a] hover:underline mt-5 font-medium"
          >
            View tender <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>,
    document.body
  );
}
