"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }
  return ctx;
}

// A plain, hand-built card instead of the shared base-ui Dialog machinery -
// after several rounds of chasing rendering artifacts (moire "crosshair"
// lines from backdrop-blur, a max-width override bug, a broken footer bar)
// through that shared component, this one uses no grid/ring/backdrop-filter
// at all: a dimmed overlay plus a simple centered white card, so there's
// nothing left for those interactions to go wrong in.
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized = typeof opts === "string" ? { description: opts } : opts;
    setOptions(normalized);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  };

  const isOpen = options !== null;

  useEffect(() => {
    if (!isOpen) return;
    confirmBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isDestructive = options?.variant === "destructive";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) settle(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-description"
              className="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 p-6"
            >
              <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
                {options?.title ?? "Are you sure?"}
              </h2>
              <p id="confirm-dialog-description" className="mt-2 text-sm text-slate-600 leading-relaxed">
                {options?.description}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="px-4 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {options?.cancelText ?? "Cancel"}
                </button>
                <button
                  ref={confirmBtnRef}
                  type="button"
                  onClick={() => settle(true)}
                  className={`px-4 py-2 rounded-md text-sm font-semibold text-white shadow-sm transition-colors ${
                    isDestructive
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-[#15406a] hover:bg-[#0d2d4a]"
                  }`}
                >
                  {options?.confirmText ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}
