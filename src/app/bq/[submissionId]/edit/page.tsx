"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { BQTable } from "@/components/bq/BQTable";
import { useBQ } from "@/hooks/useBQ";
import { getBrandColor } from "@/lib/brandColors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value).replace("$", "$ ");
};

const getDefaultLogoName = (brandName?: string) => {
  if (!brandName) return "placeholder.png";
  const lower = brandName.toLowerCase();
  if (lower.includes("yun nam")) return "yun_nam.png";
  if (lower.includes("london")) return "london.png";
  if (lower.includes("new york")) return "new_york.png";
  if (lower.includes("dorra")) return "dorra.png";
  if (lower.includes("shakura")) return "shakura.png";
  if (lower.includes("jonsson")) return "jonsson.png";
  if (lower.includes("victoria")) return "victoria.png";
  return "placeholder.png";
};

export default function EditCostEstimatePage() {
  const { submissionId } = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const confirm = useConfirm();
  const {
    submission,
    categories,
    loading,
    error,
    updateItem,
    addNewItem,
    deleteItem,
    deleteSelectedItems,
    addCategory,
    removeCategory,
    calculateCategoryTotal,
    grandTotal,
    units,
    brands,
    updateClient,
    branches,
    updateBranch,
    renovationTypes,
    updateRenovationType,
    updateStatus,
    updateSubmission,
    canEdit,
    refresh,
  } = useBQ(submissionId as string);

  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModal, setInfoModal] = useState({ title: "", message: "", note: "", type: "info" as "success" | "error" | "info", shouldRefresh: false });
  const [filteredBranches, setFilteredBranches] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);

  const userRoleId = session?.user?.role_id;
  const isAdmin = userRoleId === 1;

  const currentClientName = submission?.client_name_override || submission?.brand_name || "—";
  const currentJobSite = submission?.branch_name_override || submission?.original_branch_name || "—";
  const clientColor = getBrandColor(currentClientName);
  const currentStatus = submission?.status || "Draft";
  const canSubmit = canEdit && currentStatus === "Draft";
  const canEditHeader = canEdit && isAdmin;

  useEffect(() => {
    if (!loading && submission && categories.length > 0) {
      setIsDirty(false);
      isDirtyRef.current = false;
    }
  }, [loading, submission, categories]);

  const markDirty = useCallback(() => {
    if (!isDirtyRef.current) {
      setIsDirty(true);
      isDirtyRef.current = true;
    }
  }, []);

  const handleUpdateItem = useCallback(async (item: any, fields: any) => {
    markDirty();
    await updateItem(item, fields);
  }, [markDirty, updateItem]);

  const handleAddNewItem = useCallback(async (categoryId: number, parentId: number | null) => {
    markDirty();
    await addNewItem(categoryId, parentId);
  }, [markDirty, addNewItem]);

  const handleDeleteItem = useCallback(async (id: number) => {
    markDirty();
    await deleteItem(id);
  }, [markDirty, deleteItem]);

  const handleDeleteSelected = useCallback(async () => {
    markDirty();
    await deleteSelectedItems(selectedItems);
    setSelectedItems([]);
  }, [markDirty, deleteSelectedItems, selectedItems]);

  const handleAddCategory = useCallback(async (catId: number) => {
    markDirty();
    await addCategory(catId);
  }, [markDirty, addCategory]);

  const handleRemoveCategory = useCallback(async (catId: number) => {
    markDirty();
    await removeCategory(catId);
  }, [markDirty, removeCategory]);

  const handleUpdateClient = useCallback((name: string, logo: string) => {
    if (!isAdmin) return;
    markDirty();
    updateClient(name, logo);
  }, [markDirty, updateClient, isAdmin]);

  const handleUpdateBranch = useCallback((branchName: string) => {
    if (!isAdmin) return;
    markDirty();
    updateBranch(branchName);
  }, [markDirty, updateBranch, isAdmin]);

  const handleUpdateRenovationType = useCallback((typeId: number) => {
    if (!isAdmin) return;
    markDirty();
    updateRenovationType(typeId);
  }, [markDirty, updateRenovationType, isAdmin]);

  const handleUpdateSubmission = useCallback((fields: any) => {
    if (!isAdmin) return;
    markDirty();
    updateSubmission(fields);
  }, [markDirty, updateSubmission, isAdmin]);

  const handleUpdateArea = (area: string) => handleUpdateSubmission({ area_size: area });

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleBackToBQs = async () => {
    if (isDirtyRef.current) {
      const confirmLeave = await confirm({
        title: "Unsaved changes",
        description: "You have unsaved changes. If you leave now, they will be lost. Do you still want to leave?",
        confirmText: "Leave",
        variant: "destructive",
      });
      if (confirmLeave) {
        setIsDirty(false);
        isDirtyRef.current = false;
        router.push("/bq/my");
      }
    } else {
      router.push("/bq/my");
    }
  };

  const getFirstBranchForBrand = (brandName: string) => {
    if (!Array.isArray(brands) || !Array.isArray(branches)) return null;
    const brand = brands.find(b => b.brand_name === brandName);
    if (!brand) return null;
    return branches.find(b => b.brand_id === brand.brand_id);
  };

  useEffect(() => {
    if (!currentClientName || !Array.isArray(branches) || branches.length === 0) {
      setFilteredBranches(Array.isArray(branches) ? branches : []);
      return;
    }
    const selectedBrand = Array.isArray(brands) ? brands.find(b => b.brand_name === currentClientName) : null;
    if (selectedBrand) {
      setFilteredBranches(branches.filter(b => b.brand_id === selectedBrand.brand_id));
    } else {
      setFilteredBranches(branches);
    }
  }, [currentClientName, branches, brands]);

  const handleJobSiteChange = (branchName: string) => {
    if (!isAdmin) return;
    const selectedBranch = branches.find(b => b.branch_name === branchName);
    if (selectedBranch) {
      const brand = brands.find(b => b.brand_id === selectedBranch.brand_id);
      if (brand) {
        handleUpdateClient(brand.brand_name, `/logos/${getDefaultLogoName(brand.brand_name)}`);
      }
    }
    handleUpdateBranch(branchName);
  };

  const toggleItemSelection = (id: number) => {
    setSelectedItems(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const handleSelectAll = useCallback((ids: number[], selected: boolean) => {
    if (selected) setSelectedItems(prev => [...new Set([...prev, ...ids])]);
    else setSelectedItems(prev => prev.filter(id => !ids.includes(id)));
  }, []);

  const handleExport = () => {
    if (!submissionId) return;
    window.open(`/api/bq/export?submissionId=${submissionId}`, "_blank");
  };

  // ----- FIXED: Upload handler using /api/bq/import -----
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!submissionId) {
      setInfoModal({
        title: "Upload Failed",
        message: "Submission ID missing.",
        note: "Please refresh the page and try again.",
        type: "error",
        shouldRefresh: false
      });
      setShowInfoModal(true);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("submissionId", submissionId as string);

    try {
      // ✅ Use the correct import endpoint
      const res = await fetch("/api/bq/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        // Refresh the page data without reloading
        await refresh();
        setInfoModal({
          title: "Upload Successful",
          message: `Successfully updated ${data.updatedCount || 0} items. ${data.skippedItems ? `Skipped ${data.skippedItems} items.` : ''}`,
          note: "The page has been refreshed with the new data.",
          type: "success",
          shouldRefresh: false // no page reload needed
        });
        setShowInfoModal(true);
      } else {
        setInfoModal({
          title: "Upload Failed",
          message: data.error || "Upload failed",
          note: "Please check your Excel file format.",
          type: "error",
          shouldRefresh: false
        });
        setShowInfoModal(true);
      }
    } catch (err) {
      setInfoModal({
        title: "Upload Failed",
        message: "Network error. Please try again.",
        note: "Check your connection and try again.",
        type: "error",
        shouldRefresh: false
      });
      setShowInfoModal(true);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleInfoModalClose = () => {
    setShowInfoModal(false);
    // If we set shouldRefresh to true, we would reload, but we now refresh via hook.
    // So just close.
  };

  const handleOpenSubmitModal = () => {
    if (!canSubmit) return;
    setShowSubmitModal(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    setShowSubmitModal(false);
    try {
      await updateStatus("Submitted");
      setShowSuccessModal(true);
      setIsDirty(false);
      isDirtyRef.current = false;
    } catch (err) {
      console.error("Submission failed:", err);
      setInfoModal({
        title: "Submission Failed",
        message: "Failed to submit. Please try again.",
        note: "If the problem persists, contact support.",
        type: "error",
        shouldRefresh: false
      });
      setShowInfoModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    window.location.reload();
  };

  const formatDate = (dateStr: string | null | undefined) => (dateStr ? new Date(dateStr).toLocaleString() : "—");

  const availableCategories = ALL_CATEGORIES.filter(cat => !categories.some(c => c.category_id === cat.id));

  const InfoModal = () => (
    <Dialog open onOpenChange={(open) => { if (!open) handleInfoModalClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full ${
              infoModal.type === 'success' ? 'bg-emerald-100' :
              infoModal.type === 'error' ? 'bg-rose-100' :
              'bg-blue-100'
            } flex items-center justify-center`}>
              {infoModal.type === 'success' && (
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {infoModal.type === 'error' && (
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {infoModal.type === 'info' && (
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <DialogTitle className="text-xl font-bold text-gray-900">{infoModal.title}</DialogTitle>
          </div>
          <p className="text-gray-600 mb-6">
            {infoModal.message}
            {infoModal.note && (
              <span className="block mt-2 text-amber-600 font-medium">
                {infoModal.note}
              </span>
            )}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={handleInfoModalClose}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-sm shadow-sm transition"
            >
              OK
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-600 text-sm">Loading Bill of Quantities…</p>
      </div>
    </div>
  );
  if (error) return <div className="p-8 text-red-600 text-center">{error}</div>;
  if (!session) return <div className="p-8 text-center text-gray-700">Please log in.</div>;

  const currentLogo = submission?.logo_url || `/logos/${getDefaultLogoName(currentClientName)}`;
  const getDisplayRenovationType = () => {
    const overrideId = submission?.renovation_type_override;
    if (overrideId) {
      const rt = renovationTypes.find(r => r.type_id === overrideId);
      if (rt) return rt.type_name;
    }
    return submission?.renovation_type_name || "—";
  };

  const statusTextColors: Record<string, string> = {
    Draft: "text-amber-800",
    Submitted: "text-sky-800",
    Approved: "text-emerald-800",
    Rejected: "text-rose-800",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {isDirty && (
          <div className="fixed bottom-6 right-6 z-50 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
            <span>⚠️</span> Unsaved changes – please submit or leave
          </div>
        )}

        {/* Category Management Modal */}
        <Dialog open={showCategoryModal} onOpenChange={(open) => { if (!open) setShowCategoryModal(false); }}>
          <DialogContent showCloseButton={false} className="max-w-md max-h-[85vh] overflow-auto p-5 gap-0">
              <DialogTitle className="text-xl font-bold mb-4 text-gray-900">Manage Categories</DialogTitle>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Current Categories</h3>
                  {categories.map(cat => (
                    <div key={cat.category_id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-800">{cat.category_name}</span>
                      {canEdit && (
                        <button onClick={() => handleRemoveCategory(cat.category_id)} className="text-red-600 text-xs hover:underline">
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Add New Category</h3>
                  {availableCategories.length === 0 && <div className="text-gray-500 text-xs italic">All categories already added.</div>}
                  {availableCategories.map(cat => (
                    <div key={cat.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-800">{cat.name}</span>
                      {canEdit && (
                        <button onClick={() => handleAddCategory(cat.id)} className="text-green-600 text-xs hover:underline">
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowCategoryModal(false)} className="mt-5 w-full bg-gray-100 text-gray-800 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                Close
              </button>
          </DialogContent>
        </Dialog>

        {/* Submit Confirmation Modal */}
        <Dialog open={showSubmitModal} onOpenChange={(open) => { if (!open) setShowSubmitModal(false); }}>
          <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <DialogTitle className="text-xl font-bold text-gray-900">Submit BQ</DialogTitle>
                </div>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to submit this Bill of Quantities?
                  <br />
                  <span className="text-amber-600 font-medium block mt-2">
                    ⚠️ You will no longer be able to edit it after submission.
                  </span>
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowSubmitModal(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSubmit}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-sm shadow-sm disabled:opacity-50 transition"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </div>
          </DialogContent>
        </Dialog>

        {/* Success Modal (after submission) */}
        <Dialog open={showSuccessModal} onOpenChange={(open) => { if (!open) handleSuccessModalClose(); }}>
          <DialogContent className="max-w-md p-0 gap-0 overflow-hidden border border-emerald-200">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <DialogTitle className="text-xl font-bold text-gray-900">Submission Successful</DialogTitle>
                </div>
                <p className="text-gray-600 mb-6">
                  Your Bill of Quantities has been submitted successfully.
                  <br />
                  <span className="text-emerald-600 font-medium block mt-2">
                    ✓ The page will now reload to reflect the updated status.
                  </span>
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={handleSuccessModalClose}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium text-sm shadow-sm transition"
                  >
                    OK
                  </button>
                </div>
              </div>
          </DialogContent>
        </Dialog>

        {/* General Info Modal (for upload results) */}
        {showInfoModal && <InfoModal />}

        {/* Header Card */}
        <div className="bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-xl shadow-md p-5 mb-6 transition-all">
          <div className="flex justify-center mb-5">
            <img
              src={currentLogo}
              alt="Company Logo"
              className="h-16 sm:h-20 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = "/logos/placeholder.png"; }}
            />
          </div>

          {/* Document Title – READ ONLY */}
          <div className="mb-5 pb-2 border-b border-gray-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Document Title
              </label>
              {submission?.round_no && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                  Version {submission.round_no}
                </span>
              )}
            </div>
            <div className="text-sm font-medium py-2 text-gray-800">
              {submission?.bq_name || "—"}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div style={{ borderLeftColor: clientColor.borderColor }} className="border-l-4 pl-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Client / Brand</label>
              {canEditHeader && Array.isArray(brands) && brands.length > 0 ? (
                <select
                  value={currentClientName}
                  onChange={(e) => {
                    const selectedBrand = e.target.value;
                    const logo = `/logos/${getDefaultLogoName(selectedBrand)}`;
                    handleUpdateClient(selectedBrand, logo);
                    const firstBranch = getFirstBranchForBrand(selectedBrand);
                    if (firstBranch) handleUpdateBranch(firstBranch.branch_name);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {brands.map(brand => <option key={brand.brand_id} value={brand.brand_name}>{brand.brand_name}</option>)}
                </select>
              ) : (
                <div className="text-sm font-medium py-2 text-gray-800">{currentClientName}</div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Job Site / Branch</label>
              {canEditHeader && filteredBranches.length > 0 ? (
                <select
                  value={currentJobSite}
                  onChange={(e) => handleJobSiteChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {filteredBranches.map(branch => <option key={branch.branch_id} value={branch.branch_name}>{branch.branch_name}</option>)}
                </select>
              ) : (
                <div className="text-sm font-medium py-2 text-gray-800">{currentJobSite}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Type of Work</label>
              {canEditHeader ? (
                <select
                  value={submission?.renovation_type_override || submission?.renovation_type_id || ""}
                  onChange={(e) => handleUpdateRenovationType(parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">-- Same as project --</option>
                  {renovationTypes.map(rt => <option key={rt.type_id} value={rt.type_id}>{rt.type_name}</option>)}
                </select>
              ) : (
                <div className="text-sm font-medium py-2 text-gray-800">{getDisplayRenovationType()}</div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Document Date</label>
              <div className="text-sm font-medium py-2 text-gray-800">
                {submission?.created_at
                  ? new Date(submission.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Project Area</label>
              {canEditHeader ? (
                <input
                  type="text"
                  value={submission?.area_size || ""}
                  onChange={(e) => handleUpdateArea(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  placeholder="e.g., 250 m²"
                />
              ) : (
                <div className="text-sm font-medium py-2 text-gray-800">{submission?.area_size || "—"}</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-gray-200 mt-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Bill of Quantities
              </span>
              <div className="inline-flex items-center gap-1.5 flex-shrink-0 px-2.5 py-0.5 rounded-md text-xs font-semibold">
                <span
                  className={`w-2 h-2 rounded-full ${
                    currentStatus === 'Draft' ? 'bg-amber-500' :
                    currentStatus === 'Submitted' ? 'bg-sky-500' :
                    currentStatus === 'Approved' ? 'bg-emerald-500' :
                    'bg-rose-500'
                  }`}
                />
                <span className={statusTextColors[currentStatus] || "text-gray-700"}>
                  {currentStatus}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <div><span className="font-medium">Last Saved:</span> {formatDate(submission?.updated_at)}</div>
              <div><span className="font-medium">Last Edited:</span> {formatDate(submission?.last_edit_at)}</div>
              <div className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">💾 Auto‑save</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            {!canEdit && <span className="text-amber-600">🔒 Read‑only mode</span>}
          </div>
        </div>

        {/* Action Bar */}
        {canEdit && (
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6 bg-white/50 backdrop-blur-sm rounded-lg p-3 border border-gray-200/50">
            <div className="flex gap-2">
              <button onClick={() => setShowCategoryModal(true)} className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-100 transition">
                Manage Categories
              </button>
              {selectedItems.length > 0 && (
                <button onClick={handleDeleteSelected} className="bg-rose-50 text-rose-700 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-rose-100 transition">
                  Delete ({selectedItems.length})
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
                📥 Download Excel
              </button>
              <label className={`bg-sky-600 hover:bg-sky-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-sm ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                📤 Upload Excel
                <input type="file" accept=".xlsx, .xls" onChange={handleUpload} disabled={uploading} className="hidden" />
              </label>
              <button onClick={() => window.open(`/bq/${submissionId}/view?print=1`, '_blank')} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
                🖨️ Print / PDF
              </button>
            </div>
          </div>
        )}

        {/* BQ Tables */}
        <div className="space-y-6">
          {categories.map(cat => (
            <div key={cat.category_id} className="rounded-lg overflow-hidden shadow border border-gray-200 bg-white">
              <div className="w-full overflow-x-auto">
                <BQTable
                  category={cat}
                  onUpdate={handleUpdateItem}
                  onDelete={handleDeleteItem}
                  onAddItem={canEdit ? (catId) => handleAddNewItem(catId, null) : undefined}
                  onAddSubItem={canEdit ? (parentId, catId) => handleAddNewItem(catId, parentId) : undefined}
                  calculateCategoryTotal={calculateCategoryTotal}
                  units={units}
                  readOnly={!canEdit}
                  selectedItems={selectedItems}
                  onToggleSelect={canEdit ? toggleItemSelection : undefined}
                  onSelectAll={canEdit ? handleSelectAll : undefined}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Submission Guidelines & Submit Button */}
        {canSubmit && (
          <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">📋 Submission Guidelines</h3>
            <ul className="text-sm text-blue-700 space-y-2 list-disc list-inside mb-4">
              <li><strong>Latest submission only:</strong> Only your most recent submission will be evaluated.</li>
              <li><strong>Defect Liability Period (DLP):</strong> 12 months from the date of Practical Completion.</li>
              <li><strong>Retention Period:</strong> 5% of the contract sum will be retained for 12 months after Practical Completion.</li>
              <li><strong>No changes after submission:</strong> Once submitted, you cannot edit this Bill of Quantities.</li>
            </ul>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guidelinesAccepted}
                  onChange={(e) => setGuidelinesAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  I confirm that I have read and agree to the above submission guidelines.
                </span>
              </label>
              <button
                onClick={handleOpenSubmitModal}
                disabled={!guidelinesAccepted || isSubmitting}
                className={`px-6 py-2 rounded-lg text-sm font-semibold shadow-sm transition ${
                  guidelinesAccepted && !isSubmitting
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? "Submitting..." : "📤 Submit Bill of Quantities"}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-gray-200">
          <button onClick={handleBackToBQs} className="bg-gray-500 hover:bg-gray-600 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow">
            ← Back to BQs
          </button>
          <div className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            Grand Total: {formatCurrency(grandTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}