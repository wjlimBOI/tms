"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, FileCheck, Download, Eye } from "lucide-react";
import { format } from "date-fns";
import { getCompanyDetailsByBrand } from "@/lib/companyMapping";
import { getTenderStatusBadgeStyle } from "@/lib/statusColors";

interface Submission {
  submission_id: number;
  contractor_id: number;
  contractor_name: string;
  submitted_at: string | null;
  status: string;
  version_name: string | null;
  bq_name: string;
  created_at: string;
  updated_at: string;
}

interface TenderDetail {
  tender_id: number;
  tender_name: string;
  tender_description: string;
  branch_name: string;
  brand_name: string;
  renovation_type: string;
  status_label: string;
}

export default function TenderSubmissionsPage() {
  const router = useRouter();
  const { id } = useParams();
  const { data: session, status: sessionStatus } = useSession();

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (!id || sessionStatus !== "authenticated") return;

    fetch(`/api/tenders/${id}/submissions`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load submissions");
        }
        return res.json();
      })
      .then((data) => {
        setTender(data.tender);
        setSubmissions(data.submissions);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [id, sessionStatus, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading submissions…</p>
        </div>
      </div>
    );
  }

  if (error || !tender) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="bg-red-100 border border-red-200 text-red-800 p-6 rounded-xl max-w-md">
          <p className="font-bold">Error</p>
          <p>{error || "Tender not found"}</p>
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  const getSubmissionStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Draft: "bg-slate-100 text-slate-700",
      Submitted: "bg-blue-100 text-blue-700",
      Approved: "bg-emerald-100 text-emerald-700",
      Rejected: "bg-rose-100 text-rose-700",
    };
    return styles[status] || styles.Draft;
  };

  // Get full company name from mapping
  const companyDetails = getCompanyDetailsByBrand(tender.brand_name);
  const fullCompanyName = companyDetails?.companyName || tender.brand_name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.back()}
            className="text-slate-600 hover:text-slate-800 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tender Submissions</h1>
            <p className="text-sm text-slate-500">
              {fullCompanyName} – {tender.branch_name}
            </p>
          </div>
          <span className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTenderStatusBadgeStyle(tender.status_label)}`}>
            {tender.status_label}
          </span>
        </div>

        {/* Tender summary card – reordered */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">{tender.tender_name}</h2>
          <p className="text-sm text-slate-600 mt-1">{tender.tender_description || "No description provided."}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <span className="block text-xs font-medium text-slate-500">Brand</span>
              <span className="text-slate-800">{fullCompanyName}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-500">Branch</span>
              <span className="text-slate-800">{tender.branch_name}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-500">Renovation Type</span>
              <span className="text-slate-800">{tender.renovation_type}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-500">Tender ID</span>
              <span className="text-slate-800">#{String(tender.tender_id).padStart(4, "0")}</span>
            </div>
          </div>
        </div>

        {/* Submissions table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-500" />
              <h3 className="font-semibold text-slate-800">Submissions</h3>
              <span className="text-xs text-slate-400">({submissions.length})</span>
            </div>
          </div>

          {submissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No submissions yet for this tender.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 font-medium text-slate-600">Contractor</th>
                    <th className="px-6 py-3 font-medium text-slate-600">BQ Name</th>
                    <th className="px-6 py-3 font-medium text-slate-600">Status</th>
                    <th className="px-6 py-3 font-medium text-slate-600">Submitted At</th>
                    <th className="px-6 py-3 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((sub) => (
                    <tr key={sub.submission_id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {sub.contractor_name}
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {sub.bq_name || sub.version_name || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSubmissionStatusBadge(sub.status)}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {formatDate(sub.submitted_at)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/tenders/${tender.tender_id}/submissions/${sub.submission_id}`}
                            className="text-indigo-600 hover:text-indigo-800 transition"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          {sub.submitted_at && (
                            <button
                              onClick={() => window.open(`/api/submissions/${sub.submission_id}/download`, "_blank")}
                              className="text-slate-500 hover:text-slate-700 transition"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}