"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Save, Printer, Loader2 } from "lucide-react";

interface BQItem {
  id: string;
  description: string;
  unit: string;
  quantity?: number;
  unitRate?: number;
  amount?: number;
}

export default function BQPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const tenderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<BQItem[]>([]);
  const [tenderName, setTenderName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.push("/login");
    if (session?.user && tenderId) {
      fetchBQ();
    }
  }, [session, sessionStatus, tenderId]);

  const fetchBQ = async () => {
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bq-template`);
      if (!res.ok) throw new Error("Failed to load BQ template");
      const data = await res.json();
      setTenderName(data.tender_name);
      // Transform template items into editable items
      const initialItems = data.items.map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        description: item.description,
        unit: item.unit,
        quantity: item.quantity || 0,
        unitRate: item.unitRate || 0,
        amount: (item.quantity || 0) * (item.unitRate || 0),
      }));
      setItems(initialItems);
    } catch (err) {
      console.error(err);
      setError("Could not load Bill of Quantities. Please contact the admin.");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (id: string, field: "quantity" | "unitRate", value: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          updated.amount = (updated.quantity || 0) * (updated.unitRate || 0);
          return updated;
        }
        return item;
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bq-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("Failed to save BQ");
      alert("Bill of Quantities saved successfully!");
    } catch (err) {
      alert("Error saving BQ. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 py-8 px-4 md:py-12 md:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Bill of Quantities – {tenderName}
          </h1>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white flex items-center gap-2 transition"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Description</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Unit</th>
                  <th className="p-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">Quantity</th>
                  <th className="p-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">Unit Rate (SGD)</th>
                  <th className="p-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">Amount (SGD)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="p-3 text-sm text-slate-800 dark:text-slate-200">{item.description}</td>
                    <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{item.unit}</td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={item.quantity || ""}
                        onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                        className="w-24 text-right px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitRate || ""}
                        onChange={(e) => updateItem(item.id, "unitRate", parseFloat(e.target.value) || 0)}
                        className="w-28 text-right px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="p-3 text-right font-mono font-medium text-slate-900 dark:text-slate-100">
                      {item.amount?.toFixed(2) || "0.00"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={4} className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">
                    Total
                  </td>
                  <td className="p-3 text-right font-bold font-mono text-slate-900 dark:text-white">
                    {totalAmount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400 print:hidden">
          <p>Fill in your quantities and unit rates. Click Save to store your progress.</p>
          <p className="mt-1">After saving, you can return to this page to continue editing.</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white;
            color: black;
          }
          .print\\:hidden {
            display: none !important;
          }
          input {
            border: none !important;
            background: transparent !important;
            text-align: right;
          }
          .bg-white, .dark\\:bg-slate-900 {
            background: white !important;
          }
          .border {
            border-color: #ccc !important;
          }
        }
      `}</style>
    </div>
  );
}