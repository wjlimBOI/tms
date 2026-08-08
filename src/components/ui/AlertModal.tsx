"use client";

import { useEffect, useId, useRef } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

export interface AlertModalData {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  details?: string;
}

const STYLES: Record<AlertModalData["type"], { bg: string; border: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: { bg: "bg-emerald-50", border: "border-emerald-500", icon: CheckCircle2, iconColor: "text-emerald-600" },
  error: { bg: "bg-red-50", border: "border-red-500", icon: XCircle, iconColor: "text-red-600" },
  warning: { bg: "bg-amber-50", border: "border-amber-500", icon: AlertTriangle, iconColor: "text-amber-600" },
  info: { bg: "bg-blue-50", border: "border-blue-500", icon: Info, iconColor: "text-blue-600" },
};

export default function AlertModal({
  alert,
  onClose,
}: {
  alert: AlertModalData | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!alert) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [alert, onClose]);

  if (!alert) return null;
  const { type, title, message, details } = alert;
  const style = STYLES[type] || STYLES.info;
  const Icon = style.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md ${style.bg} border-l-4 ${style.border} rounded-2xl shadow-2xl p-6`}
      >
        <div className="flex items-start gap-4">
          <Icon className={`w-7 h-7 flex-shrink-0 ${style.iconColor}`} aria-hidden="true" />
          <div className="flex-1">
            <h3 id={titleId} className="text-xl font-bold text-gray-900">{title}</h3>
            <p id={descId} className="text-sm text-gray-700 mt-1">{message}</p>
            {details && <p className="text-xs text-gray-600 mt-2">{details}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -m-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
