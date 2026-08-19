"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { isSuperUser } from "@/lib/roles";

interface AwardedTender {
  tender_id: number;
  tender_name: string;
  contractor_name: string;
  contract_value: number;
  awarded_date: string;
  document_url?: string | null;
}

export default function AdminAwardsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [awards, setAwards] = useState<AwardedTender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isSuperUser((session.user as any)?.roleIds || [])) {
      router.push("/");
      return;
    }
    fetchAwards();
  }, [session, status, router]);

  const fetchAwards = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch awards");
      const data = await res.json();
      setAwards(data.awardedTenders || []);
    } catch (err) {
      console.error(err);
      setError("Could not load awarded tenders");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading awarded tenders...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <>
      <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl mx-auto">
          <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
                Awarded Tenders
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Complete list of tenders awarded to contractors
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

          <Card className="bg-white border-slate-200 shadow-none overflow-hidden p-0 gap-0">
            {error ? (
              <div className="text-center py-12">
                <p className="text-sm text-rose-600 mb-3">{error}</p>
                <Button size="sm" variant="outline" onClick={fetchAwards}>
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </Button>
              </div>
            ) : awards.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">No awarded tenders yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <caption className="sr-only">Awarded tenders with contractor, contract value, and award date</caption>
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tender Name</th>
                      <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Contractor</th>
                      <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Contract Value</th>
                      <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Awarded Date</th>
                      <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Documents</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {awards.map((award) => (
                      <tr key={award.tender_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 sm:px-6 py-3 text-sm font-medium text-slate-900">
                          {award.tender_name}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-slate-700">
                          {award.contractor_name}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-center font-semibold text-emerald-700 whitespace-nowrap">
                          {formatCurrency(award.contract_value)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-center text-slate-700 whitespace-nowrap">
                          {formatDate(award.awarded_date)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-center">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Awarded
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-center">
                          {award.document_url ? (
                            <button
                              onClick={() => setSelectedDoc(award.document_url!)}
                              className="text-[#15406a] hover:underline font-medium"
                            >
                              View Document
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
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

      {/* Document Modal – Opens in new tab or downloads */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => { if (!open) setSelectedDoc(null); }}>
        <DialogContent showCloseButton={false} className="max-w-2xl flex flex-col p-0 gap-0">
          {selectedDoc && (
          <>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <DialogTitle className="text-lg font-semibold text-slate-900">Tender Document</DialogTitle>
              <button
                onClick={() => setSelectedDoc(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
              <svg className="w-16 h-16 text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-slate-600 mb-2">Document cannot be previewed in the browser.</p>
              <p className="text-sm text-slate-500 mb-6">Click below to open or download the PDF.</p>
              <div className="flex gap-4">
                <a
                  href={selectedDoc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2 bg-[#15406a] hover:bg-[#0d2d4a] text-white text-sm font-medium rounded-md transition"
                >
                  Open in New Tab
                </a>
                <a
                  href={selectedDoc}
                  download
                  className="px-5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium rounded-md transition"
                >
                  Download PDF
                </a>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium rounded-md transition"
              >
                Close
              </button>
            </div>
          </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
