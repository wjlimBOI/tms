"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

const ALL_CATEGORIES = [
  { id: 1, name: "1. Preliminary & Demolition Works" },
  { id: 2, name: "2. Air‑Conditioning Works" },
  { id: 3, name: "3. Electrical Works" },
  { id: 4, name: "4. Plumbing Works" },
  { id: 5, name: "5. Ceiling Works" },
  { id: 6, name: "6. Partition Works" },
  { id: 7, name: "7. Wall Finishes & Painting" },
  { id: 8, name: "8. Floor Finishes" },
  { id: 9, name: "9. Joinery & Carpentry" },
  { id: 10, name: "10. Signage Works" },
  { id: 11, name: "11. Shopfront Feature" },
  { id: 12, name: "12. Others" },
];

export default function NewCostEstimatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [tenderId, setTenderId] = useState("");
  const [tenders, setTenders] = useState<{ tender_id: number; tender_name: string }[]>([]);
  const [loadingTenders, setLoadingTenders] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"manual" | "excel">("manual");
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [generatedName, setGeneratedName] = useState("");

  // Pre-fill tenderId from URL
  useEffect(() => {
    const tid = searchParams.get("tenderId");
    if (tid) setTenderId(tid);
  }, [searchParams]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user) {
      fetch("/api/tenders")
        .then(res => res.json())
        .then(data => {
          const tendersArray = Array.isArray(data) ? data : data?.data || [];
          setTenders(tendersArray);
          setLoadingTenders(false);
        })
        .catch(() => setLoadingTenders(false));
    }
  }, [session, status, router]);

  // Compute generated name when tender is selected
  useEffect(() => {
    if (tenderId && session?.user && tenders.length) {
      const tender = tenders.find(t => t.tender_id.toString() === tenderId);
      if (tender) {
        const contractorName = session.user.name || "Contractor";
        setGeneratedName(`${contractorName} – ${tender.tender_name} – v1`);
      } else {
        setGeneratedName("");
      }
    } else {
      setGeneratedName("");
    }
  }, [tenderId, tenders, session]);

  const toggleCategory = (id: number) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllCategories = () => {
    if (selectedCategories.length === ALL_CATEGORIES.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(ALL_CATEGORIES.map(cat => cat.id));
    }
  };

  const handleCreate = async () => {
    if (!tenderId) return alert("Please select a project");
    if (selectedCategories.length === 0) return alert("Please select at least one category");

    setLoading(true);
    try {
      const res = await fetch("/api/bq/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tender_id: parseInt(tenderId),
          category_ids: selectedCategories,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/bq/${data.submission_id}/edit`);
      } else {
        alert(data.error || "Failed to create BQ");
      }
    } catch (err) {
      alert("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- UPDATED: Excel upload flow ---
  const handleUploadCreate = async () => {
    if (!tenderId) return alert("Please select a project");
    if (!uploadFile) return alert("Please select an Excel file");

    setUploading(true);
    try {
      // 1. Create a submission with ALL categories (the import will match whatever exists in the template)
      const createRes = await fetch("/api/bq/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tender_id: parseInt(tenderId),
          category_ids: ALL_CATEGORIES.map(c => c.id),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create submission");
      }
      const submissionId = createData.submission_id;

      // 2. Upload the Excel file to the import endpoint
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("submissionId", submissionId.toString());

      const importRes = await fetch("/api/bq/import", {
        method: "POST",
        body: formData,
      });
      const importData = await importRes.json();
      if (!importRes.ok) {
        throw new Error(importData.error || "Import failed");
      }

      // 3. Redirect to the edit page
      router.push(`/bq/${submissionId}/edit`);
    } catch (err: any) {
      alert(err.message || "Upload failed. Please check console for details.");
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100 dark:from-[#0a1228] dark:to-[#0f1630]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 dark:text-cyan-300/70">Loading session...</p>
      </div>
    </div>
  );
  if (!session) return null;

  const isContractor = (session.user as any)?.role_id === 13;
  const allSelected = selectedCategories.length === ALL_CATEGORIES.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-[#0a1228] dark:to-[#0f1630] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
            New Bill of Quantities
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2 text-lg font-light">
            Generate a new BQ for an active project. Build manually or import from Excel.
          </p>
        </div>

        {/* Mode Toggle - Segmented Control */}
        <div className="bg-gray-100 dark:bg-gray-800/60 rounded-lg p-1 inline-flex mb-8 border border-gray-200/60 dark:border-gray-700/50">
          <button
            onClick={() => setUploadMode("manual")}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-all ${
              uploadMode === "manual"
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-cyan-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Manual Selection
          </button>
          <button
            onClick={() => setUploadMode("excel")}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-all ${
              uploadMode === "excel"
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-cyan-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Import Excel
          </button>
        </div>

        {/* Main Card */}
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
          <div className="p-8 md:p-10 space-y-8">
            {/* Auto-generated title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Document Title <span className="text-gray-400 text-xs font-normal">(auto‑generated)</span>
              </label>
              <div className="text-sm bg-gray-100/80 dark:bg-gray-800/80 p-3 rounded-xl border border-gray-200/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300">
                {generatedName || "Select a project to preview the title"}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Format: <strong className="font-medium">Contractor – Project – v1</strong>
              </p>
            </div>

            {/* Project selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Project <span className="text-red-500">*</span>
              </label>
              {loadingTenders ? (
                <div className="flex items-center space-x-3 text-gray-500 dark:text-gray-400">
                  <div className="w-5 h-5 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Loading projects...</span>
                </div>
              ) : (
                <select
                  value={tenderId}
                  onChange={(e) => setTenderId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-cyan-400 focus:border-blue-600 dark:focus:border-cyan-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                >
                  <option value="">— Choose a project —</option>
                  {tenders.map((t) => (
                    <option key={t.tender_id} value={t.tender_id}>
                      #{t.tender_id} – {t.tender_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Manual Mode: category checkboxes with Select All */}
            {uploadMode === "manual" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Work Categories <span className="text-red-500">*</span>
                  </label>
                  <button
                    onClick={toggleAllCategories}
                    className="text-sm text-blue-600 dark:text-cyan-400 hover:text-blue-800 dark:hover:text-cyan-300 font-medium flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full transition-colors"
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-2 bg-gray-50/50 dark:bg-gray-800/30">
                  {ALL_CATEGORIES.map((cat) => (
                    <label key={cat.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white dark:hover:bg-gray-700/50 transition-all cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat.id)}
                        onChange={() => toggleCategory(cat.id)}
                        className="w-4 h-4 text-blue-600 dark:text-cyan-500 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                        {cat.name}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {selectedCategories.length} category(s) selected
                </p>
              </div>
            )}

            {/* Excel Mode: file upload */}
            {uploadMode === "excel" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Excel File (BQ Template) <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-800/40 transition-all"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Required columns: <strong>Item No.</strong> (B), <strong>Description</strong> (C), <strong>Quantity</strong> (D), <strong>Unit</strong> (E).<br />
                  Categories are detected automatically from the item number prefix.
                </p>
                {uploadFile && (
                  <div className="mt-3 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded-lg border border-green-200 dark:border-green-800/50 inline-flex items-center gap-2">
                    <span>✓</span> File selected: {uploadFile.name}
                  </div>
                )}
              </div>
            )}

            {/* Updated Contractor Note */}
            {isContractor && (
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
                <span className="text-amber-600 dark:text-amber-400 text-lg">📌</span>
                <div>
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Submission Policy</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    You may submit <strong>multiple revisions</strong> per project. 
                    Only the <strong>most recently submitted</strong> version will be considered for evaluation.
                  </p>
                </div>
              </div>
            )}

            {/* Create / Upload Button */}
            <div className="pt-4">
              {uploadMode === "manual" ? (
                <button
                  onClick={handleCreate}
                  disabled={loading || !tenderId || selectedCategories.length === 0}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 border border-transparent text-sm font-semibold rounded-xl shadow-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] transition-all duration-200"
                >
                  {loading ? "Creating..." : "Create Bill of Quantities"}
                </button>
              ) : (
                <button
                  onClick={handleUploadCreate}
                  disabled={uploading || !tenderId || !uploadFile}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 border border-transparent text-sm font-semibold rounded-xl shadow-lg text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] transition-all duration-200"
                >
                  {uploading ? "Uploading & Creating..." : "Upload Excel & Create"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Updated Bottom Tip */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50/80 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200/50 dark:border-gray-700/50 flex items-center justify-center gap-2 backdrop-blur-sm">
          <span className="text-lg">💡</span>
          <span>
            <strong className="font-medium">Auto-generated title:</strong> Re-submissions create a new version, ensuring traceability while keeping only the latest active.
          </span>
        </div>
      </div>
    </div>
  );
}