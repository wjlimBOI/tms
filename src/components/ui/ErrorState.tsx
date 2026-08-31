"use client";

import Link from "next/link";
import { AlertTriangle, Lock, SearchX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type ErrorStateVariant = "error" | "forbidden" | "unauthorized" | "notFound";

const VARIANT_STYLES: Record<
  ErrorStateVariant,
  { iconWrap: string; icon: string; Icon: typeof AlertTriangle; defaultTitle: string }
> = {
  error: { iconWrap: "bg-red-50", icon: "text-red-500", Icon: AlertTriangle, defaultTitle: "Something went wrong" },
  forbidden: { iconWrap: "bg-red-50", icon: "text-red-500", Icon: Lock, defaultTitle: "You don't have access to this" },
  unauthorized: { iconWrap: "bg-amber-50", icon: "text-amber-500", Icon: Lock, defaultTitle: "Sign in required" },
  notFound: { iconWrap: "bg-slate-100", icon: "text-slate-400", Icon: SearchX, defaultTitle: "Not found" },
};

// Shared "page/section couldn't load" card — replaces the ad hoc
// `bg-red-100 text-red-800` boxes hand-rolled per page (tenders/[id],
// admin/tenders/[id], admin/security) so every failure state (403, load
// error, missing record) looks and behaves the same way across the app.
export default function ErrorState({
  variant = "error",
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryHref,
  fullScreen = false,
  className = "",
}: {
  variant?: ErrorStateVariant;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  // Renders the secondary action as a real <Link> instead of an onClick
  // handler — for use from server components (e.g. not-found.tsx) that
  // can't pass an event handler across the boundary.
  secondaryHref?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  const s = VARIANT_STYLES[variant];

  const card = (
    <div
      role="alert"
      className={`w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm ${className}`}
    >
      <div className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full ${s.iconWrap}`}>
        <s.Icon className={`h-5 w-5 ${s.icon}`} aria-hidden="true" />
      </div>
      <p className="font-semibold text-slate-800">{title ?? s.defaultTitle}</p>
      {message && <p className="mt-1.5 text-sm text-slate-500">{message}</p>}
      {(onAction || onSecondaryAction || secondaryHref) && (
        <div className="mt-5 flex items-center justify-center gap-2">
          {onAction && (
            <Button size="sm" onClick={onAction}>
              {actionLabel ?? "Retry"}
            </Button>
          )}
          {onSecondaryAction && (
            <Button size="sm" variant="outline" onClick={onSecondaryAction}>
              {secondaryActionLabel ?? "Go Back"}
            </Button>
          )}
          {secondaryHref && (
            <Link href={secondaryHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              {secondaryActionLabel ?? "Go Back"}
            </Link>
          )}
        </div>
      )}
    </div>
  );

  if (!fullScreen) return card;

  return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">{card}</div>;
}
