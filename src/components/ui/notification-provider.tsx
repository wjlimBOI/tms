"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type NotifyType = "success" | "error" | "info" | "warning";

interface NotifyItem {
  id: number;
  type: NotifyType;
  message: string;
}

interface NotifyFn {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const NotifyContext = createContext<NotifyFn | null>(null);

export function useNotify(): NotifyFn {
  const ctx = useContext(NotifyContext);
  if (!ctx) {
    throw new Error("useNotify must be used within a NotificationProvider");
  }
  return ctx;
}

const ICONS: Record<NotifyType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLES: Record<NotifyType, { iconBg: string; icon: string; border: string }> = {
  success: {
    iconBg: "bg-emerald-100 dark:bg-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-900",
  },
  error: {
    iconBg: "bg-rose-100 dark:bg-rose-500/20",
    icon: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-900",
  },
  info: {
    iconBg: "bg-blue-100 dark:bg-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900",
  },
  warning: {
    iconBg: "bg-amber-100 dark:bg-amber-500/20",
    icon: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-900",
  },
};

const AUTO_DISMISS_MS = 4000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotifyItem[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const push = useCallback(
    (type: NotifyType, message: string) => {
      const id = ++counterRef.current;
      setItems((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api: NotifyFn = {
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
    warning: (message) => push("warning", message),
  };

  return (
    <NotifyContext.Provider value={api}>
      {children}
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 px-4 pointer-events-none">
        {items.map((item) => {
          const Icon = ICONS[item.type];
          const style = STYLES[item.type];
          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto w-full max-w-sm rounded-xl border bg-white dark:bg-slate-900 shadow-2xl p-4 flex items-start gap-3 animate-in fade-in-0 zoom-in-95 duration-150",
                style.border
              )}
            >
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", style.iconBg)}>
                <Icon className={cn("w-4.5 h-4.5", style.icon)} />
              </div>
              <p className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 pt-1">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotifyContext.Provider>
  );
}
