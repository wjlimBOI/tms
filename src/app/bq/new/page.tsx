"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useNotify } from "@/components/ui/notification-provider";
import { ROLE_IDS } from "@/lib/roles";

export default function NewCostEstimatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useNotify();

  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [tenderId, setTenderId] = useState("");
  const [tenders, setTenders] = useState<{ tender_id: number; tender_name: string }[]>([]);
  const [loadingTenders, setLoadingTenders] = useState(true);
  const [allCategories, setAllCategories] = useState<{ id: number; name: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
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

      fetch("/api/work-categories")
        .then(res => res.json())
        .then((data: { category_id: number; name: string }[]) => {
          setAllCategories(data.map(cat => ({ id: cat.category_id, name: cat.name })));
          setLoadingCategories(false);
        })
        .catch(() => setLoadingCategories(false));
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

  // Every work category is selected automatically once a project is chosen,
  // so a contractor doesn't have to know to hunt for "Select All" - they can
  // still deselect individual categories they don't need afterwards.
  useEffect(() => {
    if (tenderId && allCategories.length > 0) {
      setSelectedCategories(allCategories.map(cat => cat.id));
    } else if (!tenderId) {
      setSelectedCategories([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId, allCategories.length]);

  const toggleCategory = (id: number) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllCategories = () => {
    if (selectedCategories.length === allCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(allCategories.map(cat => cat.id));
    }
  };

  const handleCreate = async () => {
    if (!tenderId) return toast.error("Please select a project");
    if (selectedCategories.length === 0) return toast.error("Please select at least one category");

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
        toast.error(data.error || "Failed to create BQ");
      }
    } catch (err) {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadCreate = async () => {
    if (!tenderId) return toast.error("Please select a project");
    if (!uploadFile) return toast.error("Please select an Excel file");

    setUploading(true);
    try {
      // 1. Create a submission with ALL categories (the import will match whatever exists in the template)
      const createRes = await fetch("/api/bq/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tender_id: parseInt(tenderId),
          category_ids: allCategories.map(c => c.id),
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
      toast.error(err.message || "Upload failed. Please check console for details.");
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f4ee]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500">Loading session...</p>
      </div>
    </div>
  );
  if (!session) return null;

  const isContractor = (session.user as any)?.role_id === ROLE_IDS.CONTRACTOR;
  // Excel import bypasses the app's per-row validation and can be used to
  // smuggle malformed/oversized data straight into pricing records - not
  // offered to contractors. Staff-created submissions may still import.
  const canImportExcel = !isContractor;
  const allSelected = allCategories.length > 0 && selectedCategories.length === allCategories.length;

  return (
    <div className="min-h-screen bg-[#f7f4ee] font-sans text-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/bq/my"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-[#15406a]"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to My BQs
          </Link>
          <h1 className="mt-4 font-serif text-4xl font-bold text-slate-900 tracking-tight">
            New Bill of Quantities
          </h1>
        </div>

        {/* Submission policy - moved above the form, plain professional tone */}
        {isContractor && (
          <div className="mb-8 rounded-xl border border-[#15406a]/20 bg-[#15406a]/5 px-5 py-4">
            <p className="text-sm font-semibold text-[#15406a]">Submission Policy</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              You may submit multiple revisions per project. Only the most recently submitted version will be
              considered for evaluation.
            </p>
          </div>
        )}

        {/* Mode Toggle - Segmented Control (staff only; Excel import is not offered to contractors) */}
        {canImportExcel && (
          <div className="bg-slate-100 rounded-lg p-1 inline-flex mb-8 border border-slate-200">
            <button
              onClick={() => setUploadMode("manual")}
              className={`px-6 py-2 text-sm font-medium rounded-md transition-all ${
                uploadMode === "manual"
                  ? "bg-white text-[#15406a] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Manual Selection
            </button>
            <button
              onClick={() => setUploadMode("excel")}
              className={`px-6 py-2 text-sm font-medium rounded-md transition-all ${
                uploadMode === "excel"
                  ? "bg-white text-[#15406a] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Import Excel
            </button>
          </div>
        )}

        {/* Main Card - no backdrop-blur here: combined with a native <select>
            it triggers a well-known Chromium bug where the browser's native
            dropdown popup renders with a broken/black background. */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8 md:p-10 space-y-8">
            {/* Auto-generated title */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Document Title <span className="text-slate-400 text-xs font-normal">(auto‑generated)</span>
              </label>
              <div className="text-sm bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700">
                {generatedName || "Select a project to preview the title"}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Format: <strong className="font-medium">Contractor – Project – v1</strong>
              </p>
            </div>

            {/* Project selection */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Project <span className="text-red-500">*</span>
              </label>
              {loadingTenders ? (
                <div className="flex items-center space-x-3 text-slate-500">
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Loading projects...</span>
                </div>
              ) : (
                <select
                  value={tenderId}
                  onChange={(e) => setTenderId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-[#15406a] bg-white text-slate-900 transition-all"
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

            {/* Manual Mode: category checkboxes with Select All (auto-selected on project choice) */}
            {(uploadMode === "manual" || !canImportExcel) && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-slate-700">
                    Work Categories <span className="text-red-500">*</span>
                  </label>
                  <button
                    onClick={toggleAllCategories}
                    className="text-sm text-[#15406a] hover:text-[#0d2d4a] font-medium flex items-center gap-1 bg-[#15406a]/5 px-3 py-1 rounded-full transition-colors"
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {tenderId && (
                  <p className="text-xs text-slate-500 mb-2">
                    All categories are selected by default for this project — uncheck any you don&rsquo;t need.
                  </p>
                )}
                {loadingCategories ? (
                  <div className="flex items-center space-x-3 text-slate-500 border border-slate-200 rounded-xl p-4 bg-slate-50">
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm">Loading categories...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-80 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50">
                    {allCategories.map((cat) => (
                      <label key={cat.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white transition-all cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(cat.id)}
                          onChange={() => toggleCategory(cat.id)}
                          className="w-4 h-4 text-[#15406a] border-slate-300 rounded focus:ring-2 focus:ring-[#15406a]"
                        />
                        <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                          {cat.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  {selectedCategories.length} category(s) selected
                </p>
              </div>
            )}

            {/* Excel Mode: file upload (staff only) */}
            {canImportExcel && uploadMode === "excel" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Excel File (BQ Template) <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#15406a]/10 file:text-[#15406a] hover:file:bg-[#15406a]/20 transition-all"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Required columns: <strong>Item No.</strong> (B), <strong>Description</strong> (C), <strong>Quantity</strong> (D), <strong>Unit</strong> (E).<br />
                  Categories are detected automatically from the item number prefix.
                </p>
                {uploadFile && (
                  <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 inline-flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    File selected: {uploadFile.name}
                  </div>
                )}
              </div>
            )}

            {/* Create / Upload Button */}
            <div className="pt-4">
              {(uploadMode === "manual" || !canImportExcel) ? (
                <button
                  onClick={handleCreate}
                  disabled={loading || !tenderId || selectedCategories.length === 0}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-bold tracking-wide rounded-md shadow-md text-white bg-[#15406a] hover:-translate-y-0.5 hover:bg-[#0d2d4a] hover:shadow-lg disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 transition-all"
                >
                  {loading ? "Creating..." : "Create Bill of Quantities"}
                </button>
              ) : (
                <button
                  onClick={handleUploadCreate}
                  disabled={uploading || !tenderId || !uploadFile || loadingCategories}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-bold tracking-wide rounded-md shadow-md text-white bg-[#15406a] hover:-translate-y-0.5 hover:bg-[#0d2d4a] hover:shadow-lg disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 transition-all"
                >
                  {uploading ? "Uploading & Creating..." : "Upload Excel & Create"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
