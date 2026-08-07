// app/tenders/new/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, ArrowLeft, FileCheck, X } from "lucide-react";
import TenderForm from "@/components/tenders/TenderForm";
import { ROLE_IDS } from "@/lib/roles";

interface AlertData {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  details?: string;
}

export default function CreateProjectPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdTender, setCreatedTender] = useState<{ id: number; name: string } | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertData, setAlertData] = useState<AlertData | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.push("/login");
    const roleIds = (session?.user as any)?.roleIds || [];
    if (sessionStatus === "authenticated" && !roleIds.includes(ROLE_IDS.ADMIN)) router.push("/");
  }, [session, sessionStatus, router]);

  const renderAlertModal = () => {
    if (!showAlertModal || !alertData) return null;
    const { type, title, message, details } = alertData;
    let bgColor, borderColor, icon;
    switch (type) {
      case "success":
        bgColor = "bg-emerald-50 dark:bg-emerald-900/20";
        borderColor = "border-emerald-500";
        icon = "✅";
        break;
      case "error":
        bgColor = "bg-red-50 dark:bg-red-900/20";
        borderColor = "border-red-500";
        icon = "⚠️";
        break;
      case "warning":
        bgColor = "bg-amber-50 dark:bg-amber-900/20";
        borderColor = "border-amber-500";
        icon = "⚠️";
        break;
      default:
        bgColor = "bg-blue-50 dark:bg-blue-900/20";
        borderColor = "border-blue-500";
        icon = "ℹ️";
        break;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className={`w-full max-w-md ${bgColor} border-l-4 ${borderColor} rounded-2xl shadow-2xl p-6`}>
          <div className="flex items-start gap-4">
            <span className="text-3xl">{icon}</span>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{message}</p>
              {details && <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{details}</p>}
            </div>
            <button
              onClick={() => {
                setShowAlertModal(false);
                setAlertData(null);
              }}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setShowAlertModal(false);
                setAlertData(null);
              }}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleSubmit = async (formData: any) => {
    setIsSubmitting(true);
    setValidationErrors([]);
    setShowAlertModal(false);
    setAlertData(null);

    try {
      const payload = {
        branch_id: parseInt(formData.branch_id),
        renovation_type_id: parseInt(formData.renovation_type_id),
        tender_name: formData.tender_name,
        tender_description: formData.tender_description || null,
        estimated_budget: formData.estimated_budget ? parseFloat(formData.estimated_budget) : null,
        tender_date: formData.tender_date || null,
        closing_date: formData.closing_date || null,
        renovation_start_date: formData.renovation_start_date || null,
        renovation_end_date: formData.renovation_end_date || null,
        project_manager_id: formData.project_manager_id ? parseInt(formData.project_manager_id) : null,
        project_manager_name: formData.project_manager_name || null,
        project_manager_email: formData.project_manager_email || null,
        project_manager_phone: formData.project_manager_phone || null,
        briefing_dates: formData.briefing_dates || [],
      };

      const res = await fetch("/api/tenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.details) {
          const messages = errorData.details.map((d: any) => `${d.path}: ${d.message}`);
          setValidationErrors(messages);
          setAlertData({
            type: "error",
            title: "Validation Failed",
            message: messages[0] || "Please check the form.",
          });
          setShowAlertModal(true);
        } else {
          setAlertData({
            type: "error",
            title: "Creation Failed",
            message: errorData.error || "Failed to create tender",
          });
          setShowAlertModal(true);
        }
        return;
      }

      const data = await res.json();
      setCreatedTender({ id: data.tender_id, name: formData.tender_name });
      setShowSuccessModal(true);
    } catch (err) {
      console.error(err);
      setAlertData({
        type: "error",
        title: "Unexpected Error",
        message: "Please try again or contact support.",
        details: "An unexpected error occurred while creating the tender.",
      });
      setShowAlertModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Loading your session…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderAlertModal()}

      {showSuccessModal && createdTender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center transform animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
            </div>

            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Tender Created!
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-1">
              <span className="font-medium">Tender ID:</span> #{createdTender.id}
            </p>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 break-words">
              <span className="font-medium">Name:</span> {createdTender.name}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push(`/tenders/${createdTender.id}`)}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-medium rounded-lg transition shadow-sm"
              >
                View Tender
              </button>
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  router.push("/tenders");
                }}
                className="px-6 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Go to Tenders List
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-slate-50/80 via-white to-slate-100/80 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-8 p-4 sm:p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-white/20 dark:border-slate-800/50 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50">
            <div>
              <div className="flex items-center gap-3">
                <FileCheck className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-400 bg-clip-text text-transparent">
                  Create New Tender
                </h1>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-9">
                The tender will be created as{" "}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
                  Upcoming
                </span>{" "}
                and can be opened later via the stage management.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="group flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 hover:shadow-md"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              Cancel
            </button>
          </div>

          {validationErrors.length > 0 && (
            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/20 border-l-4 border-rose-500 rounded-xl shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                    Please fix the following issues:
                  </h4>
                  <ul className="mt-1 text-sm text-rose-600 dark:text-rose-400 list-disc list-inside space-y-0.5">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl shadow-slate-200/30 dark:shadow-slate-950/30">
            <TenderForm
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              onGeneratedTitleChange={() => {}}
              onAddressChange={() => {}}
              onBudgetCalculated={() => {}}
              showBudget={false}
            />
          </div>
        </div>
      </div>
    </>
  );
}