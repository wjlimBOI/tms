"use client";

import { X } from "lucide-react";

export interface AlertModalData {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  details?: string;
}

const STYLES: Record<AlertModalData["type"], { bg: string; border: string; icon: string }> = {
  success: { bg: "bg-emerald-50", border: "border-emerald-500", icon: "✅" },
  error: { bg: "bg-red-50", border: "border-red-500", icon: "⚠️" },
  warning: { bg: "bg-amber-50", border: "border-amber-500", icon: "⚠️" },
  info: { bg: "bg-blue-50", border: "border-blue-500", icon: "ℹ️" },
};

export default function AlertModal({
  alert,
  onClose,
}: {
  alert: AlertModalData | null;
  onClose: () => void;
}) {
  if (!alert) return null;
  const { type, title, message, details } = alert;
  const style = STYLES[type] || STYLES.info;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md ${style.bg} border-l-4 ${style.border} rounded-2xl shadow-2xl p-6`}>
        <div className="flex items-start gap-4">
          <span className="text-3xl">{style.icon}</span>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-700 mt-1">{message}</p>
            {details && <p className="text-xs text-gray-600 mt-2">{details}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
