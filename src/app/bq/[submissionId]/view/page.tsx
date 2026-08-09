"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrandColor } from "@/lib/brandColors";
import "./bq-view-print.css";
import { getBQStatusBadgeStyle, getBQStatusLabel } from "@/lib/statusColors";

interface LineItem {
  line_item_id: number;
  item_no: string;
  location: string;
  description: string;
  specifications: string;
  brand: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
  amount: number;
  category_id: number;
  category_name: string;
}

interface Submission {
  round_no: number;
  version_name?: string;
  status: string;
  updated_at: string;
  created_at?: string;
  client_name_override?: string;
  brand_name?: string;
  branch_name_override?: string;
  original_branch_name?: string;
  renovation_type_name?: string;
  area_size?: string;
  bq_date?: string;
  logo_url?: string;
  can_edit?: boolean;
  role_id?: number;
  contractor_id?: number;          // added
  contractor_username?: string;    // added
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value).replace("$", "$ ");
};

const getDefaultLogoName = (brandName?: string): string => {
  if (!brandName) return "placeholder.png";
  const lower = brandName.toLowerCase();
  if (lower.includes("yun nam")) return "yun_nam.png";
  if (lower.includes("london")) return "london.png";
  if (lower.includes("new york")) return "new_york.png";
  if (lower.includes("dorra")) return "dorra.png";
  if (lower.includes("shakura")) return "shakura.png";
  if (lower.includes("jonsson")) return "jonsson.png";
  if (lower.includes("victoria")) return "victoria.png";
  if (lower.includes("beauty one international")) return "boi.png";
  if (lower.includes("ames")) return "ames.png";
  return "placeholder.png";
};

export default function ViewBQPage() {
  const { submissionId } = useParams() as { submissionId: string };
  const { data: session } = useSession();
  const [items, setItems] = useState<LineItem[]>([]);
  const [categories, setCategories] = useState<{ category_id: number; category_name: string }[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPrintMode, setIsPrintMode] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("print") === "1") {
        setIsPrintMode(true);
      }
    }
  }, []);

  const fetchBQ = async () => {
    if (!submissionId) return;
    try {
      const res = await fetch(`/api/bq/${submissionId}`);
      if (!res.ok) throw new Error("Failed to fetch BQ");
      const data = await res.json();
      setSubmission(data.submission);
      const fetchedItems = (data.items || []).map((item: any) => ({
        ...item,
        amount: typeof item.amount === "number" ? item.amount : Number(item.amount) || 0,
      }));
      setItems(fetchedItems);
      setCategories(data.categories);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load Bill of Quantities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBQ();
  }, [submissionId]);

  useEffect(() => {
    if (isPrintMode && !loading && !error) {
      setTimeout(() => window.print(), 500);
    }
  }, [isPrintMode, loading, error]);

  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl text-gray-600">Loading Bill of Quantities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-red-600 text-center">{error}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center text-gray-700">
          Please log in to view this Bill of Quantities.
        </div>
      </div>
    );
  }

  const currentClientName = submission?.client_name_override || submission?.brand_name || "—";
  const currentJobSite = submission?.branch_name_override || submission?.original_branch_name || "—";
  const clientColor = getBrandColor(currentClientName);
  let logoUrl = submission?.logo_url;
  if (!logoUrl) {
    const logoFile = getDefaultLogoName(currentClientName);
    logoUrl = `/logos/${logoFile}`;
  }

  // Mask contractor name
  const contractorId = submission?.contractor_id;
  const maskedContractor = contractorId
    ? `Contractor ${String.fromCharCode(65 + (contractorId % 26))}`
    : "—";

  const groupedItems = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.category_id),
  }));
  const grandTotal = items.reduce((sum, i) => sum + i.amount, 0);
  const documentDate = submission?.created_at || submission?.bq_date || null;

  const statusBadgeClass = getBQStatusBadgeStyle(submission?.status || '');
  const statusLabel = getBQStatusLabel(submission?.status || '');

  return (
    <div className="p-4 max-w-[95%] mx-auto print:p-0 print:max-w-none bg-gray-50 min-h-screen">

      <div className="bq-container">
        {/* Header Card with Status Badge */}
        <div className="bg-white backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm p-4 mb-6 print:shadow-none print:border header-card">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div
              style={{ borderLeftColor: clientColor.borderColor }}
              className="flex-1 border-l-4 pl-3"
            >
              <div className="text-sm text-gray-500 uppercase tracking-wide">Client</div>
              <div className="font-bold text-lg text-gray-800">{currentClientName}</div>

              <div className="text-sm text-gray-500 uppercase tracking-wide mt-3">Job Site</div>
              <div className="font-medium text-gray-700">{currentJobSite}</div>

              <div className="text-sm text-gray-500 uppercase tracking-wide mt-3">Submitted By</div>
              <div className="font-medium text-gray-700">{maskedContractor}</div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Document Date</div>
                  <div className="font-medium text-gray-700">{formatDate(documentDate)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Area</div>
                  <div className="font-medium text-gray-700">{submission?.area_size || "—"}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <img
                src={logoUrl}
                alt="Company Logo"
                className="h-12 sm:h-14 md:h-16 w-auto object-contain print:logo-print"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logos/placeholder.png";
                }}
              />
              <div className="text-right text-sm text-gray-600 no-print">
                <div>
                  Version {submission?.round_no}
                  {submission?.version_name ? ` – ${submission.version_name}` : ""}
                </div>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${statusBadgeClass}`}>
                    {statusLabel}
                  </span>
                </div>
                <div>Last updated: {formatDate(submission?.updated_at)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-gray-200 rounded-lg print:border print:overflow-visible table-container">
          <table className="min-w-full border-collapse text-sm print:w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-200 p-2 text-left text-gray-700">Item No.</th>
                <th className="border border-gray-200 p-2 text-left text-gray-700">Location</th>
                <th className="border border-gray-200 p-2 text-left text-gray-700">Description</th>
                <th className="border border-gray-200 p-2 text-left text-gray-700">Specifications</th>
                <th className="border border-gray-200 p-2 text-left text-gray-700">Brand</th>
                <th className="border border-gray-200 p-2 text-right text-gray-700">Qty</th>
                <th className="border border-gray-200 p-2 text-left text-gray-700">Unit</th>
                <th className="border border-gray-200 p-2 text-right text-gray-700">Unit Rate ($)</th>
                <th className="border border-gray-200 p-2 text-right text-gray-700">Discount ($)</th>
                <th className="border border-gray-200 p-2 text-right text-gray-700">Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((cat) => (
                <React.Fragment key={`cat-${cat.category_id}`}>
                  <tr className="bg-gray-200">
                    <td colSpan={10} className="border border-gray-200 p-2 font-semibold text-base text-gray-900">
                      {cat.category_name}
                    </td>
                  </tr>
                  {cat.items.map((item) => (
                    <tr key={item.line_item_id} className="border-b border-gray-200 hover:bg-gray-50 print:break-inside-avoid">
                      <td className="border border-gray-200 p-2 text-center font-mono text-gray-700">{item.item_no}</td>
                      <td className="border border-gray-200 p-2 text-gray-700">{item.location || "—"}</td>
                      <td className="border border-gray-200 p-2 min-w-[300px] whitespace-pre-wrap description-cell text-gray-800">
                        {item.description}
                      </td>
                      <td className="border border-gray-200 p-2 text-gray-700">{item.specifications || "—"}</td>
                      <td className="border border-gray-200 p-2 text-gray-700">{item.brand || "—"}</td>
                      <td className="border border-gray-200 p-2 text-right text-gray-700">{item.quantity}</td>
                      <td className="border border-gray-200 p-2 text-gray-700">{item.unit}</td>
                      <td className="border border-gray-200 p-2 text-right font-mono whitespace-nowrap currency-cell text-gray-700">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="border border-gray-200 p-2 text-right font-mono whitespace-nowrap currency-cell text-gray-700">
                        {formatCurrency(item.discount)}
                      </td>
                      <td className="border border-gray-200 p-2 text-right font-mono whitespace-nowrap currency-cell text-gray-700">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="border border-gray-200 p-2 text-right font-bold text-gray-800">
                      Category Subtotal:
                    </td>
                    <td className="border border-gray-200 p-2 text-right font-mono font-bold whitespace-nowrap currency-cell text-gray-800">
                      {formatCurrency(cat.items.reduce((sum, i) => sum + i.amount, 0))}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              <tr className="bg-gray-100 font-bold">
                <td colSpan={9} className="border border-gray-200 p-2 text-right text-base text-gray-900">
                  GRAND TOTAL:
                </td>
                <td className="border border-gray-200 p-2 text-right font-mono text-base whitespace-nowrap currency-cell text-gray-900">
                  {formatCurrency(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-6 no-print">
          <div className="w-full md:w-auto flex justify-center md:justify-start">
            <Link
              href="/bq/my"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Bills
            </Link>
          </div>

          <div className="w-full md:w-auto flex flex-wrap justify-center gap-3">
            <button
              onClick={() => window.print()}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition font-medium shadow-sm"
            >
              🖨️ Print / PDF
            </button>
            {submission?.can_edit && (
              <Link
                href={`/bq/${submissionId}/edit`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition font-medium shadow-sm"
              >
                Edit BQ
              </Link>
            )}
          </div>
        </div>

        {/* Informational message for non‑Draft/Submitted */}
        {submission?.status !== 'Draft' && submission?.status !== 'Submitted' && (
          <div className="mt-6 text-center text-sm text-gray-500 no-print">
            ℹ️ This BQ is {submission?.status}. Only Draft and Submitted BQs are active.
          </div>
        )}
      </div>
    </div>
  );
}