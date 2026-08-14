"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { BQTable } from "@/components/bq/BQTable";
import { useBQ } from "@/hooks/useBQ";
import { getBrandColor } from "@/lib/brandColors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isSuperUser, ROLE_IDS } from "@/lib/roles";
import StatusBanner from "@/components/ui/StatusBanner";
import BqNotesPanel from "@/components/bq/BqNotesPanel";
import { getBQStatusBadgeStyle, getBQStatusLabel } from "@/lib/statusColors";
import { ArrowLeft, Printer, Download, Trash2, Settings, Lock, Save, CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

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
    workCategories,
    lastUpdateError,
    resubmissionRequest,
  } = useBQ(submissionId as string);

  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string; note: string; type: "success" | "error" | "info"; shouldRefresh: boolean; actionHref?: string; actionLabel?: string }>({ title: "", message: "", note: "", type: "info", shouldRefresh: false });
  const [filteredBranches, setFilteredBranches] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);

  const userRoleIds = (session?.user as any)?.roleIds || [];
  const isAdmin = isSuperUser(userRoleIds);
  const isContractor = userRoleIds.includes(ROLE_IDS.CONTRACTOR);
  const tenderStillOpen = submission?.tender_status_code === "Open";

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
    const confirmLeave = await confirm(
      isDirtyRef.current
        ? {
            title: "Unsaved changes",
            description: "You have unsaved changes. If you leave now, they will be lost. Do you still want to leave?",
            confirmText: "Leave",
            variant: "destructive",
          }
        : {
            title: "Return to My BQs?",
            description: "Are you sure you want to go back to My BQs?",
            confirmText: "Leave",
          }
    );
    if (confirmLeave) {
      setIsDirty(false);
      isDirtyRef.current = false;
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
      const succeeded = await updateStatus("Submitted");
      if (!succeeded) throw new Error("Submission was not accepted");
      setShowSuccessModal(true);
      setIsDirty(false);
      isDirtyRef.current = false;
    } catch (err) {
      console.error("Submission failed:", err);
      if (lastUpdateError?.code === "ACKNOWLEDGMENT_REQUIRED" && lastUpdateError.tenderId) {
        setInfoModal({
          title: "Form of Tender Required",
          message: lastUpdateError.error || "You must sign the Form of Tender for this project before submitting your BQ.",
          note: "",
          type: "info",
          shouldRefresh: false,
          actionHref: `/tenders/${lastUpdateError.tenderId}/edit`,
          actionLabel: "Go to Form of Tender",
        });
      } else {
        setInfoModal({
          title: "Submission Failed",
          message: "Failed to submit. Please try again.",
          note: "If the problem persists, contact support.",
          type: "error",
          shouldRefresh: false,
          actionHref: "",
          actionLabel: "",
        });
      }
      setShowInfoModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
  };

  const formatDate = (dateStr: string | null | undefined) => (dateStr ? new Date(dateStr).toLocaleString() : "—");

  const availableCategories = workCategories
    .filter(cat => !categories.some(c => c.category_id === cat.category_id))
    .map(cat => ({ id: cat.category_id, name: cat.name }));

  const InfoModal = () => (
    <Dialog open onOpenChange={(open) => { if (!open) handleInfoModalClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              infoModal.type === 'success' ? 'bg-emerald-100' :
              infoModal.type === 'error' ? 'bg-rose-100' :
              'bg-[#15406a]/10'
            }`}>
              {infoModal.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              {infoModal.type === 'error' && <X className="w-5 h-5 text-rose-600" />}
              {infoModal.type === 'info' && <Info className="w-5 h-5 text-[#15406a]" />}
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
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition"
            >
              {infoModal.actionHref ? "Cancel" : "OK"}
            </button>
            {infoModal.actionHref && (
              <button
                onClick={() => router.push(infoModal.actionHref as string)}
                className="px-4 py-2 rounded-lg bg-[#15406a] hover:bg-[#0d2d4a] text-white font-medium text-sm shadow-sm transition-colors"
              >
                {infoModal.actionLabel || "Continue"}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f4ee]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
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

  return (
    <div className="min-h-screen bg-[#f7f4ee]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {isDirty && (
          <div className="fixed bottom-6 right-6 z-50 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
            <AlertTriangle className="w-4 h-4" /> Unsaved changes – please submit or leave
          </div>
        )}

        {/* Top action bar - standardized to match the rest of the app
            (Back left, Print right) */}
        <div className="flex items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200">
          <button
            onClick={handleBackToBQs}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium uppercase tracking-wide">Back to BQs</span>
          </button>
          <button
            onClick={() => window.open(`/bq/${submissionId}/view?print=1`, '_blank')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 rounded hover:bg-slate-100 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>

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
                  <div className="w-10 h-10 rounded-full bg-[#15406a]/10 flex items-center justify-center">
                    <Info className="w-5 h-5 text-[#15406a]" />
                  </div>
                  <DialogTitle className="text-xl font-bold text-gray-900">Submit BQ</DialogTitle>
                </div>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to submit this Bill of Quantities?
                  <br />
                  <span className="flex items-center gap-1 text-amber-600 font-medium mt-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> You will no longer be able to edit it after submission.
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
                    className="px-4 py-2 rounded-lg bg-[#15406a] hover:bg-[#0d2d4a] text-white font-medium text-sm shadow-sm disabled:opacity-50 transition-colors"
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
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <DialogTitle className="text-xl font-bold text-gray-900">Submission Successful</DialogTitle>
                </div>
                <p className="text-gray-600 mb-6">
                  Your Bill of Quantities has been submitted successfully.
                  <br />
                  <span className="flex items-center gap-1 text-emerald-600 font-medium mt-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> The page will now reload to reflect the updated status.
                  </span>
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={handleSuccessModalClose}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
          </DialogContent>
        </Dialog>

        {/* General Info Modal (for upload results) */}
        {showInfoModal && <InfoModal />}

        {/* Status banner — explains the current lock/negotiation state
            instead of leaving a disabled form unexplained (2026-08-10) */}
        <div className="mb-6">
          {isContractor && resubmissionRequest ? (
            <StatusBanner
              variant="warning"
              title="Revised quote requested"
              message={[
                resubmissionRequest.instructions,
                resubmissionRequest.due_by ? `Due by ${new Date(resubmissionRequest.due_by).toLocaleDateString()}.` : null,
              ].filter(Boolean).join(" ") || "Our team has asked you to review and submit a revised quote."}
            />
          ) : isContractor && !canEdit && !tenderStillOpen && currentStatus === "Draft" ? (
            <StatusBanner
              variant="locked"
              title="This tender is no longer open for submissions"
              message="Bidding has closed. If our team asked you to revise your quote, you'll receive an email with next steps."
            />
          ) : isContractor && !canEdit && currentStatus !== "Draft" ? (
            <StatusBanner
              variant="info"
              title={`This BQ has been ${currentStatus.toLowerCase()}`}
              message="No further edits can be made to this version."
            />
          ) : null}
        </div>

        {/* Header Card */}
        {/* No backdrop-blur here - combined with the native Client/Brand and
            Job Site <select> dropdowns below, it triggers a known Chromium
            bug where the native dropdown popup renders with a broken
            background (same class of issue fixed on bq/new). */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
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
              <span className="text-xl font-bold text-slate-900">
                Bill of Quantities
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${getBQStatusBadgeStyle(currentStatus)}`}>
                {getBQStatusLabel(currentStatus)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {canEdit && (
                <>
                  <button onClick={() => setShowCategoryModal(true)} className="flex items-center gap-1.5 bg-[#15406a]/10 text-[#15406a] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#15406a]/20 transition">
                    <Settings className="w-3.5 h-3.5" />
                    Manage Categories
                  </button>
                  {selectedItems.length > 0 && (
                    <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-rose-100 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete ({selectedItems.length})
                    </button>
                  )}
                  <button onClick={handleExport} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
                    <Download className="w-3.5 h-3.5" />
                    Download Excel
                  </button>
                </>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <div><span className="font-medium">Last Saved:</span> {formatDate(submission?.updated_at)}</div>
                <div><span className="font-medium">Last Edited:</span> {formatDate(submission?.last_edit_at)}</div>
                <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <Save className="w-3 h-3" /> Auto-save
                </div>
              </div>
            </div>
          </div>
          {!canEdit && (
            <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
              <Lock className="w-3 h-3" /> Read-only mode
            </div>
          )}
        </div>

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
          <div className="mt-8 p-6 bg-[#15406a]/5 border border-[#15406a]/20 rounded-lg">
            <h3 className="text-lg font-semibold text-[#15406a] mb-3">Submission Guidelines</h3>
            <ul className="text-sm text-slate-700 space-y-2 list-disc list-inside mb-4">
              <li><strong className="text-red-600">Latest submission only:</strong> Only your most recent submission will be evaluated.</li>
              <li><strong className="text-red-600">Defect Liability Period (DLP):</strong> 12 months from the date of Practical Completion.</li>
              <li><strong className="text-red-600">Retention Period:</strong> 5% of the contract sum will be retained for 12 months after Practical Completion.</li>
              <li><strong className="text-red-600">No changes after submission:</strong> Once submitted, you cannot edit this Bill of Quantities.</li>
            </ul>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guidelinesAccepted}
                  onChange={(e) => setGuidelinesAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#15406a] border-gray-300 rounded focus:ring-[#15406a]"
                />
                <span className="text-sm text-gray-700">
                  I confirm that I have read and agree to the above submission guidelines.
                </span>
              </label>
              <button
                onClick={handleOpenSubmitModal}
                disabled={!guidelinesAccepted || isSubmitting}
                className={`px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-all ${
                  guidelinesAccepted && !isSubmitting
                    ? "bg-[#15406a] hover:bg-[#0d2d4a] hover:-translate-y-0.5 hover:shadow-lg text-white"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? "Submitting..." : "Submit Bill of Quantities"}
              </button>
            </div>
          </div>
        )}

        {/* Notes from our team (review_comment thread) */}
        {submission?.submission_id && (
          <div className="mt-8">
            <BqNotesPanel submissionId={submission.submission_id} canAddNotes={isAdmin} />
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-gray-200">
          <button onClick={handleBackToBQs} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to BQs
          </button>
          <div className="text-xl font-bold text-slate-900">
            Grand Total: {formatCurrency(grandTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}