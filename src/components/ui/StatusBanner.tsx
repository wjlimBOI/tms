"use client";

import { Info, AlertTriangle, CheckCircle2, Lock } from "lucide-react";

export type StatusBannerVariant = "info" | "warning" | "success" | "locked";

const VARIANT_STYLES: Record<StatusBannerVariant, { container: string; icon: string; Icon: typeof Info }> = {
  info: { container: "bg-blue-50 border-blue-200 text-blue-800", icon: "text-blue-500", Icon: Info },
  warning: { container: "bg-amber-50 border-amber-200 text-amber-800", icon: "text-amber-500", Icon: AlertTriangle },
  success: { container: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: "text-emerald-500", Icon: CheckCircle2 },
  locked: { container: "bg-slate-100 border-slate-300 text-slate-700", icon: "text-slate-400", Icon: Lock },
};

// Reusable "why can't I do X right now" / status explanation banner — for
// the many overlapping tender/BQ states introduced 2026-08-10 (edit locks,
// resubmission requests, document/chat access windows), so every page
// explains its state the same way instead of ad hoc one-off banners.
export default function StatusBanner({
  variant,
  title,
  message,
  className = "",
}: {
  variant: StatusBannerVariant;
  title: string;
  message?: string;
  className?: string;
}) {
  const s = VARIANT_STYLES[variant];
  return (
    <div className={`flex items-start gap-2.5 border rounded-lg px-4 py-3 text-sm ${s.container} ${className}`}>
      <s.Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${s.icon}`} aria-hidden="true" />
      <div>
        <p className="font-medium">{title}</p>
        {message && <p className="mt-0.5 text-[13px] opacity-90">{message}</p>}
      </div>
    </div>
  );
}
