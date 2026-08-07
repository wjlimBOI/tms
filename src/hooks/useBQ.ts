// hooks/useBQ.ts
import { useState, useCallback, useEffect } from "react";
import { Category, LineItem, CreateItemDto } from "@/types/bq";
import { useSession } from "next-auth/react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useNotify } from "@/components/ui/notification-provider";

export function useBQ(submissionId: string | string[] | undefined) {
  const { data: session } = useSession();
  const confirm = useConfirm();
  const toast = useNotify();
  const [submission, setSubmission] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<{ unit_id: number; unit_code: string; unit_name: string }[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [brands, setBrands] = useState<{ brand_id: number; brand_name: string }[]>([]);
  const [branches, setBranches] = useState<{ branch_id: number; branch_name: string; brand_id: number; brand_name: string }[]>([]);
  const [renovationTypes, setRenovationTypes] = useState<{ type_id: number; type_name: string }[]>([]);

  // Fetch lookup data once
  useEffect(() => {
    Promise.all([
      fetch("/api/units").then(res => res.json()),
      fetch("/api/brands").then(res => res.json()),
      fetch("/api/branches").then(res => res.json()),
      fetch("/api/renovation-types").then(res => res.json()),
    ]).then(([unitsData, brandsData, branchesData, typesData]) => {
      setUnits(unitsData);
      setBrands(brandsData);
      setBranches(branchesData);
      setRenovationTypes(typesData);
    }).catch(console.error);
  }, []);

  // Main fetch logic
  const fetchBQ = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bq/${submissionId}`);
      if (!res.ok) throw new Error("Failed to fetch BQ");
      const data = await res.json();
      setSubmission(data.submission);

      // Optional frontend override – works even if backend canEdit is wrong
      let editable = data.canEdit;
      if (!editable && session?.user) {
        const userRole = (session.user as any)?.role;
        const userId = (session.user as any)?.id;
        const ownerId = data.submission?.contractor_id || data.submission?.user_id;
        if (userRole === 'contractor' && ownerId === userId) {
          editable = true;
        }
      }
      setCanEdit(editable);

      const items = (data.items || []).map((item: any) => ({
        ...item,
        amount: typeof item.amount === "number" ? item.amount : Number(item.amount) || 0,
      }));
      const grouped: Category[] = data.categories.map((cat: any) => ({
        ...cat,
        items: items.filter((item: LineItem) => item.category_id === cat.category_id),
      }));
      setCategories(grouped);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load BQ. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [submissionId, session]);

  useEffect(() => {
    fetchBQ();
  }, [fetchBQ]);

  // Update submission header (client, branch, etc.)
  const updateSubmission = useCallback(async (fields: any) => {
    if (!submission) return;
    try {
      const res = await fetch("/api/bq/submission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.submission_id, ...fields }),
      });
      if (res.ok) {
        setSubmission((prev: any) => ({ ...prev, ...fields }));
        await fetchBQ();
      } else {
        console.error("Update failed");
      }
    } catch (err) {
      console.error("Failed to update submission header", err);
    }
  }, [submission, fetchBQ]);

  const updateClient = useCallback((clientName: string, logoUrl: string) => {
    updateSubmission({ client_name_override: clientName, logo_url: logoUrl });
  }, [updateSubmission]);

  const updateRenovationType = useCallback((typeId: number) => {
    updateSubmission({ renovation_type_override: typeId });
  }, [updateSubmission]);

  const updateStatus = useCallback((newStatus: string) => {
    if (!canEdit) return;
    updateSubmission({ status: newStatus });
  }, [canEdit, updateSubmission]);

  const updateBranch = useCallback((branchName: string) => {
    updateSubmission({ branch_name_override: branchName });
  }, [updateSubmission]);

  // Version management
  const fetchVersions = useCallback(async (tenderId: number, contractorId: number) => {
    try {
      const res = await fetch(`/api/bq/versions?tender_id=${tenderId}&contractor_id=${contractorId}`);
      const data = await res.json();
      setVersions(data);
    } catch (err) {
      console.error("Failed to fetch versions", err);
    }
  }, []);

  const loadVersion = useCallback((newSubmissionId: number) => {
    window.location.href = `/bq/${newSubmissionId}/edit`;
  }, []);

  const saveAsNewVersion = useCallback(async (versionName: string) => {
    if (!submission) return;
    try {
      const res = await fetch("/api/bq/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.submission_id, version_name: versionName }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = `/bq/${data.submission_id}/edit`;
      } else {
        toast.error(`Failed to create new version: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Save version error:", err);
      toast.error("An error occurred while saving the new version.");
    }
  }, [submission]);

  const renameVersion = useCallback(async (versionId: number, newName: string) => {
    const res = await fetch(`/api/bq/version/${versionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_name: newName }),
    });
    if (res.ok) {
      if (submission?.tender_id && submission?.contractor_id) {
        fetchVersions(submission.tender_id, submission.contractor_id);
      }
    } else toast.error("Failed to rename version");
  }, [submission, fetchVersions]);

  const deleteVersion = useCallback(async (versionId: number) => {
    if (!(await confirm({ description: "Delete this version permanently?", confirmText: "Delete", variant: "destructive" }))) return;
    const res = await fetch(`/api/bq/version/${versionId}`, { method: "DELETE" });
    if (res.ok) {
      if (versionId === Number(submission?.submission_id)) {
        const nextVersion = versions.find(v => v.submission_id !== versionId);
        if (nextVersion) window.location.href = `/bq/${nextVersion.submission_id}/edit`;
        else window.location.href = "/bq/my";
      } else {
        if (submission?.tender_id && submission?.contractor_id) {
          fetchVersions(submission.tender_id, submission.contractor_id);
        }
      }
    } else toast.error("Failed to delete version");
  }, [submission, versions, fetchVersions, confirm]);

  // Update a single line item (optimistic)
  const updateItem = useCallback(async (item: LineItem, updatedFields: Partial<LineItem>) => {
    if (!canEdit) return;

    let newAmount = item.amount;
    if (updatedFields.quantity !== undefined || updatedFields.unit_price !== undefined || updatedFields.discount !== undefined) {
      const qty = updatedFields.quantity ?? item.quantity;
      const rate = updatedFields.unit_price ?? item.unit_price;
      const disc = updatedFields.discount ?? item.discount;
      newAmount = qty * rate - disc;
    }
    const updated = { ...item, ...updatedFields, amount: newAmount };

    // Optimistic update
    setCategories(prev =>
      prev.map(cat => ({
        ...cat,
        items: cat.items.map(i => (i.line_item_id === item.line_item_id ? updated : i)),
      }))
    );

    try {
      const res = await fetch("/api/bq/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_item_id: item.line_item_id, ...updatedFields }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch (err) {
      // Revert on error
      setCategories(prev =>
        prev.map(cat => ({
          ...cat,
          items: cat.items.map(i => (i.line_item_id === item.line_item_id ? item : i)),
        }))
      );
      console.error("Failed to save update", err);
      toast.error("Update failed. Please try again.");
    }
  }, [canEdit]);

  // Add new item
  const addNewItem = useCallback(async (categoryId: number, parentId: number | null = null) => {
    if (!canEdit || !submissionId) return;
    const newItem: CreateItemDto = {
      submission_id: Number(submissionId),
      category_id: categoryId,
      parent_item_id: parentId,
      location: "",
      description: "",
      specifications: "",
      brand: "",
      quantity: 0,
      unit: "no",
      unit_price: 0,
      discount: 0,
    };
    try {
      const res = await fetch("/api/bq/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) throw new Error("Failed to add item");
      await fetchBQ();
    } catch (err) {
      console.error(err);
      toast.error("Could not add item");
    }
  }, [submissionId, canEdit, fetchBQ]);

  // Delete single item
  const deleteItem = useCallback(async (line_item_id: number) => {
    if (!canEdit) return;
    if (!(await confirm({ description: "Delete this line item and its sub‑items?", confirmText: "Delete", variant: "destructive" }))) return;
    try {
      const res = await fetch("/api/bq/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_item_id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchBQ();
    } catch (err) {
      console.error(err);
      toast.error("Could not delete item");
    }
  }, [canEdit, fetchBQ, confirm]);

  // Batch delete selected items
  const deleteSelectedItems = useCallback(async (ids: number[]) => {
    if (!canEdit || !ids.length) return;
    if (!(await confirm({ description: `Delete ${ids.length} selected item(s) and their sub‑items?`, confirmText: "Delete", variant: "destructive" }))) return;
    try {
      const res = await fetch("/api/bq/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_item_ids: ids }),
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchBQ();
    } catch (err) {
      console.error(err);
      toast.error("Could not delete selected items");
    }
  }, [canEdit, fetchBQ, confirm]);

  // Add category
  const addCategory = useCallback(async (categoryId: number) => {
    if (!submission) return;
    await fetch("/api/bq/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submission.submission_id, category_id: categoryId }),
    });
    await fetchBQ();
  }, [submission, fetchBQ]);

  // Remove category
  const removeCategory = useCallback(async (categoryId: number) => {
    if (!submission) return;
    if (!(await confirm({ description: "Remove entire category and all its items?", confirmText: "Remove", variant: "destructive" }))) return;
    await fetch("/api/bq/category", {
      method: "DELETE",
      body: JSON.stringify({ submission_id: submission.submission_id, category_id: categoryId }),
    });
    await fetchBQ();
  }, [submission, fetchBQ, confirm]);

  // ** NEW: Reset BQ to original template (admin only) **
  const resetToTemplate = useCallback(async () => {
    if (!submissionId) return;
    const res = await fetch("/api/bq/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Reset failed");
    }
    // Refresh the entire submission after reset
    await fetchBQ();
  }, [submissionId, fetchBQ]);

  const calculateCategoryTotal = useCallback((items: LineItem[]) =>
    items.reduce((sum, i) => sum + (i.amount || 0), 0), []);

  const grandTotal = categories.reduce((sum, cat) => sum + calculateCategoryTotal(cat.items), 0);

  return {
    submission,
    categories,
    loading,
    error,
    units,
    versions,
    canEdit,
    brands,
    branches,
    renovationTypes,
    updateItem,
    addNewItem,
    deleteItem,
    deleteSelectedItems,
    addCategory,
    removeCategory,
    saveAsNewVersion,
    renameVersion,
    deleteVersion,
    fetchVersions,
    loadVersion,
    updateSubmission,
    updateClient,
    updateRenovationType,
    updateStatus,
    updateBranch,
    calculateCategoryTotal,
    grandTotal,
    refresh: fetchBQ,
    resetToTemplate,   // <-- exported
  };
}