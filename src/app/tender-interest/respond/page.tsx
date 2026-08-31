"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

type LookupState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "valid"; tenderName: string; contractorName: string }
  | { status: "responded"; action: "accept" | "decline" };

export default function TenderInvitationRespondPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [state, setState] = useState<LookupState>({ status: "loading" });
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ status: "invalid" });
      return;
    }
    fetch(`/api/tender-interest/respond?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setState({ status: "valid", tenderName: data.tenderName, contractorName: data.contractorName });
        } else {
          setState({ status: "invalid" });
        }
      })
      .catch(() => setState({ status: "invalid" }));
  }, [token]);

  const respond = async (action: "accept" | "decline") => {
    if (!token) return;
    setSubmitting(action);
    setError(null);
    try {
      const res = await fetch("/api/tender-interest/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Unable to submit your response. Please try again.");
      }
      setState({ status: "responded", action });
    } catch (err: any) {
      setError(err.message || "Unable to submit your response. Please try again.");
    } finally {
      setSubmitting(null);
    }
  };

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Verifying your invitation...</p>
        </div>
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid or Expired Invitation</h1>
          <p className="text-slate-600 text-sm mb-6">
            This invitation link is invalid, has expired, or has already been used. If you believe this is a
            mistake, please contact the tender administrator, or log in to check your invitations directly.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="rounded-md bg-[#15406a] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d2d4a]"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "responded") {
    const accepted = state.action === "accept";
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              accepted ? "bg-emerald-100" : "bg-slate-100"
            }`}
          >
            {accepted ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-600" aria-hidden="true" />
            ) : (
              <XCircle className="w-8 h-8 text-slate-500" aria-hidden="true" />
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            {accepted ? "Interest Recorded" : "Invitation Declined"}
          </h1>
          <p className="text-slate-600 text-sm mb-6">
            {accepted
              ? "Thank you — your interest in this tender has been recorded. Log in to your TMS account to view the tender details and submit your bid."
              : "You've declined this invitation. No further action is needed."}
          </p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-[#15406a] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d2d4a]"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Tender Invitation</h1>
        <p className="text-sm text-slate-500 mb-6">Dear {state.contractorName},</p>
        <div className="bg-slate-50 border-l-4 border-[#0d9488] rounded-r-md px-4 py-3 mb-6">
          <p className="text-sm text-slate-700">
            You have been invited to express interest in <span className="font-semibold">{state.tenderName}</span>.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => respond("accept")}
            disabled={submitting !== null}
            className="flex-1 rounded-md bg-[#15406a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d2d4a] disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting === "accept" ? "Submitting..." : "Accept — I'm Interested"}
          </button>
          <button
            onClick={() => respond("decline")}
            disabled={submitting !== null}
            className="flex-1 rounded-md border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting === "decline" ? "Submitting..." : "Decline"}
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          Prefer to use your account?{" "}
          <Link href="/login" className="text-[#15406a] font-medium hover:underline">
            Log in to TMS
          </Link>
        </p>
      </div>
    </div>
  );
}
