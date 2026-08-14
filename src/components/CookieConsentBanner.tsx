"use client";

import { useEffect, useState } from "react";

const ACK_STORAGE_KEY = "tms_cookie_notice_ack";

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ACK_STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (e.g. private browsing) — skip the notice
      // rather than show it on every single page load.
    }
  }, []);

  const acknowledge = () => {
    try {
      window.localStorage.setItem(ACK_STORAGE_KEY, "1");
    } catch {
      // Ignore — worst case the notice reappears next visit.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-sm text-slate-600">
          TMS uses only strictly necessary cookies (session authentication and security) to operate the Platform. We do not use analytics, advertising or tracking cookies — see our{" "}
          <a href="/privacy#section3" className="font-medium text-cyan-700 hover:underline">
            Privacy Policy
          </a>{" "}
          for details.
        </p>
        <button
          type="button"
          onClick={acknowledge}
          className="w-full shrink-0 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 sm:w-auto"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
