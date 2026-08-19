"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, MoreVertical, Check, ChevronDown, ChevronUp } from "lucide-react";
import { getDlpStatusBadgeStyle } from "@/lib/statusColors";
import { getBrandColor } from "@/lib/brandColors";
import { ROLE_IDS } from "@/lib/roles";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DropdownActions } from "@/components/ui/DropdownActions";
import { DLP_CASE_STATUSES, type DlpCaseStatus } from "@/lib/dlp";

interface DlpItem {
  tenderId: number;
  outlet: string;
  brandName?: string;
  dueDate: string;
  status?: string;
  daysLeft: number;
  daysOverdue?: number;
  caseStatus?: DlpCaseStatus | null;
}

const DLP_CASE_STATUS_LABELS: Record<DlpCaseStatus, string> = {
  processing: "Processing",
  completed: "Completed",
};

const DlpStatusMenu = ({
  item,
  saving,
  onChange,
}: {
  item: DlpItem;
  saving: boolean;
  onChange: (tenderId: number, value: DlpCaseStatus | null) => void;
}) => (
  <DropdownActions
    trigger={
      <button
        type="button"
        aria-label={`Update status for ${item.outlet}`}
        disabled={saving}
        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
      >
        <MoreVertical className="w-4 h-4" aria-hidden="true" />
      </button>
    }
  >
    {(close) => (
      <>
        <button
          type="button"
          onClick={() => {
            onChange(item.tenderId, null);
            close();
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Auto (date-based)
          {!item.caseStatus && <Check className="w-3.5 h-3.5 text-[#15406a]" aria-hidden="true" />}
        </button>
        {DLP_CASE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              onChange(item.tenderId, s);
              close();
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {DLP_CASE_STATUS_LABELS[s]}
            {item.caseStatus === s && <Check className="w-3.5 h-3.5 text-[#15406a]" aria-hidden="true" />}
          </button>
        ))}
      </>
    )}
  </DropdownActions>
);

const BrandBadge = ({ brandName }: { brandName?: string | null }) => {
  if (!brandName) return null;
  const { borderColor } = getBrandColor(brandName);
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap flex-shrink-0 text-white"
      style={{ backgroundColor: `${borderColor}bf` }}
      title={brandName}
    >
      {brandName}
    </span>
  );
};

export default function DlpDeadlinesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<DlpItem[]>([]);
  const [overdue, setOverdue] = useState<DlpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTenderId, setSavingTenderId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [overdueVisible, setOverdueVisible] = useState(true);

  const userRole = (session?.user as any)?.role_id;
  const isContractor = userRole === ROLE_IDS.CONTRACTOR;

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (isContractor) {
      router.push("/tenders");
      return;
    }
    fetchDlpDeadlines();
  }, [session, status, router, isContractor]);

  const fetchDlpDeadlines = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch DLP deadlines");
      const data = await res.json();
      setUpcoming(data?.dlpSummary?.upcomingList ?? []);
      setOverdue(data?.dlpSummary?.overdueList ?? []);
    } catch (err) {
      console.error(err);
      setError("We couldn't load DLP deadlines. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const updateCaseStatus = async (tenderId: number, nextStatus: DlpCaseStatus | null) => {
    setSavingTenderId(tenderId);
    setStatusError(null);
    const previousUpcoming = upcoming;
    const previousOverdue = overdue;
    const patch = (items: DlpItem[]) =>
      items.map((item) => (item.tenderId === tenderId ? { ...item, caseStatus: nextStatus } : item));
    setUpcoming(patch(upcoming));
    setOverdue(patch(overdue));
    try {
      const res = await fetch(`/api/tenders/${tenderId}/handover`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dlp_case_status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to update status");
      }
    } catch (err) {
      setUpcoming(previousUpcoming);
      setOverdue(previousOverdue);
      setStatusError(err instanceof Error ? err.message : "Failed to update status. Please try again.");
    } finally {
      setSavingTenderId(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading DLP deadlines...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
              DLP Deadlines
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Defect Liability Period expiry dates, soonest first — past-due cases are further down
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Dashboard
          </Link>
        </div>

        {statusError && (
          <div className="mb-3 px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm" role="alert">
            {statusError}
          </div>
        )}

        <Card className="bg-white border-slate-200 shadow-none overflow-hidden p-0 gap-0">
          {error ? (
            <div className="text-center py-12">
              <p className="text-sm text-rose-600 mb-3">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchDlpDeadlines}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
          ) : upcoming.length === 0 && overdue.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No upcoming DLP deadlines.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <caption className="sr-only">Defect Liability Period deadlines by outlet, soonest first, past-due cases further down</caption>
                <thead className="bg-slate-50/80">
                  <tr>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Brand</th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Outlet</th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">DLP Due Date</th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {upcoming.map((item, idx) => (
                    <tr key={`upcoming-${idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 sm:px-6 py-3 text-sm text-center"><BrandBadge brandName={item.brandName} /></td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center text-slate-900">{item.outlet}</td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center text-slate-700">{formatDate(item.dueDate)}</td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                            item.caseStatus ? getDlpStatusBadgeStyle(item.caseStatus) : getDlpStatusBadgeStyle("upcoming")
                          }`}
                        >
                          {item.caseStatus ? DLP_CASE_STATUS_LABELS[item.caseStatus] : `${item.daysLeft} days left`}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center">
                        <DlpStatusMenu item={item} saving={savingTenderId === item.tenderId} onChange={updateCaseStatus} />
                      </td>
                    </tr>
                  ))}
                  {overdue.length > 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 sm:px-6 py-2 bg-slate-100/80 border-y border-dashed border-slate-300">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <span className="h-px flex-1 bg-slate-300" />
                          <span>Requires Attention{!overdueVisible ? ` (${overdue.length} hidden)` : ""}</span>
                          <span className="h-px flex-1 bg-slate-300" />
                          <button
                            type="button"
                            onClick={() => setOverdueVisible((v) => !v)}
                            className="flex items-center gap-1 normal-case font-medium text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
                          >
                            {overdueVisible ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> Hide
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> Show
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {overdueVisible && overdue.map((item, idx) => (
                    <tr key={`overdue-${idx}`} className="bg-slate-50/60 text-slate-500 hover:bg-slate-100/70 transition-colors">
                      <td className="px-4 sm:px-6 py-3 text-sm text-center opacity-80"><BrandBadge brandName={item.brandName} /></td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center text-slate-600">{item.outlet}</td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center text-slate-500">{formatDate(item.dueDate)}</td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                            item.caseStatus ? getDlpStatusBadgeStyle(item.caseStatus) : getDlpStatusBadgeStyle("overdue")
                          }`}
                        >
                          {item.caseStatus ? DLP_CASE_STATUS_LABELS[item.caseStatus] : `${item.daysOverdue} days overdue`}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-center">
                        <DlpStatusMenu item={item} saving={savingTenderId === item.tenderId} onChange={updateCaseStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
