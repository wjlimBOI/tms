// app/tenders/[id]/bq-template/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getBrandColor } from "@/lib/brandColors";

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

interface TemplateData {
  tender_name: string;
  brand_name: string;
  branch_name: string;
  categories: { category_id: number; category_name: string }[];
  items: LineItem[];
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value).replace("$", "$ ");
};

export default function TenderTemplateView() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingAck, setCheckingAck] = useState(true);

  const userRole = (session?.user as any)?.role_id;
  const isContractor = userRole === 13;

  // First: check if user has acknowledged the tender document
  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.push("/login");
    if (!isContractor) router.push("/");
    if (session?.user && id) {
      const checkAcknowledgment = async () => {
        try {
          const res = await fetch(`/api/tenders/${id}/acknowledgment-status`);
          const data = await res.json();
          if (!data.acknowledged) {
            router.push(`/tenders/${id}/document`);
            return;
          }
          setCheckingAck(false);
        } catch (err) {
          console.error(err);
          router.push(`/tenders/${id}/document`);
        }
      };
      checkAcknowledgment();
    }
  }, [id, session, sessionStatus, router, isContractor]);

  // Then load template only if acknowledged
  useEffect(() => {
    if (checkingAck) return;
    if (!isContractor) return;
    fetch(`/api/tenders/${id}/bq-template`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load template");
        return res.json();
      })
      .then(data => {
        setTemplate(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError("Could not load BQ template for this tender.");
        setLoading(false);
      });
  }, [id, isContractor, checkingAck]);

  if (checkingAck || loading || sessionStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a1228]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 dark:text-cyan-300/70">Loading…</p>
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen p-8 bg-gray-50 dark:bg-[#0a1228]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-8">
            <p className="text-amber-800 dark:text-amber-200">{error || "No BQ template has been set up for this tender yet."}</p>
            <Link
              href={`/tenders/${id}`}
              className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Back to Tender
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const brandColor = getBrandColor(template.brand_name);
  const groupedItems = template.categories.map(cat => ({
    ...cat,
    items: template.items.filter(i => i.category_id === cat.category_id),
  }));
  const grandTotal = template.items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a1228] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bill of Quantities Template</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {template.tender_name} – {template.brand_name} / {template.branch_name}
            </p>
          </div>
          <Link
            href={`/tenders/${id}`}
            className="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
          >
            ← Back to Tender
          </Link>
        </div>

        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-cyan-500/30 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800/50">
                <tr>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-left">Item No.</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-left">Location</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-left">Description</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-left">Specifications</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-left">Brand</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-right">Qty</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-left">Unit</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-right">Unit Rate ($)</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-right">Discount ($)</th>
                  <th className="border border-gray-200 dark:border-gray-700 p-2 text-right">Amount ($)</th>
                </tr>
              </thead>
              <tbody>
                {groupedItems.map(cat => (
                  <>
                    <tr key={`cat-${cat.category_id}`} className="bg-gray-200 dark:bg-gray-800">
                      <td colSpan={10} className="border border-gray-200 dark:border-gray-700 p-2 font-semibold">
                        {cat.category_name}
                       </td>
                    </tr>
                    {cat.items.map(item => (
                      <tr key={item.line_item_id} className="border-b border-gray-200 dark:border-gray-700">
                        <td className="border p-2 text-center font-mono">{item.item_no}</td>
                        <td className="border p-2">{item.location || "—"}</td>
                        <td className="border p-2">{item.description}</td>
                        <td className="border p-2">{item.specifications || "—"}</td>
                        <td className="border p-2">{item.brand || "—"}</td>
                        <td className="border p-2 text-right">{item.quantity}</td>
                        <td className="border p-2">{item.unit}</td>
                        <td className="border p-2 text-right font-mono">{formatCurrency(item.unit_price)}</td>
                        <td className="border p-2 text-right font-mono">{formatCurrency(item.discount)}</td>
                        <td className="border p-2 text-right font-mono">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </>
                ))}
                <tr className="bg-gray-100 dark:bg-gray-800/50 font-bold">
                  <td colSpan={9} className="border p-2 text-right text-base">GRAND TOTAL:</td>
                  <td className="border p-2 text-right font-mono text-base">{formatCurrency(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/bq/submission", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tender_id: parseInt(id as string),
                    copy_from_template: true,
                  }),
                });
                const data = await res.json();
                if (res.ok) {
                  router.push(`/bq/${data.submission_id}/edit`);
                } else {
                  alert(data.error || "Failed to create BQ from template");
                }
              } catch (err) {
                alert("Network error. Please try again.");
              }
            }}
            className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium shadow-md transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Create My Bill of Quantities from Template
          </button>
        </div>
      </div>
    </div>
  );
}