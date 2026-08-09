"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
    if (!session || (session.user as any)?.role_id !== 1) {
      router.push("/");
      return;
    }
    fetchAwards();
  }, [session, status, router]);

  const fetchAwards = async () => {
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <div className="w-10 h-10 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading awarded tenders...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-rose-600 text-center">{error}</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                Awarded Tenders
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Complete list of tenders awarded to contractors
              </p>
            </div>
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/70 backdrop-blur-sm border border-slate-200 text-slate-700 text-sm font-medium hover:bg-white transition-all duration-200 shadow-sm"
            >
              <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </Link>
          </motion.div>

          {/* Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Tender Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Contractor
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Contract Value
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Awarded Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Documents
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <AnimatePresence mode="popLayout">
                    {awards.length === 0 ? (
                      <motion.tr
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm">
                          No awarded tenders yet.
                        </td>
                      </motion.tr>
                    ) : (
                      awards.map((award, idx) => (
                        <motion.tr
                          key={award.tender_id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: idx * 0.05 }}
                          className="group hover:bg-slate-50/60 transition-colors duration-200"
                        >
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">
                            {award.tender_name}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {award.contractor_name}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-emerald-700">
                            {formatCurrency(award.contract_value)}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {formatDate(award.awarded_date)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Awarded
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {award.document_url ? (
                              <button
                                onClick={() => setSelectedDoc(award.document_url!)}
                                className="inline-flex items-center gap-1 text-cyan-600 hover:gap-2 transition-all duration-200"
                              >
                                View Document
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Document Modal – Opens in new tab or downloads */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => { if (!open) setSelectedDoc(null); }}>
        <DialogContent showCloseButton={false} className="max-w-2xl flex flex-col p-0 gap-0">
          {selectedDoc && (
          <>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
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
                  className="px-5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium rounded-lg transition"
                >
                  Open in New Tab
                </a>
                <a
                  href={selectedDoc}
                  download
                  className="px-5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium rounded-lg transition"
                >
                  Download PDF
                </a>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium rounded-lg transition"
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