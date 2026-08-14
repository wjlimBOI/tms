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
  const [workCategories, setWorkCategories] = useState<{ category_id: number; name: string; sort_order: number }[]>([]);
  const [lastUpdateError, setLastUpdateError] = useState<{ error?: string; code?: string; tenderId?: number } | null>(null);
  const [resubmissionRequest, setResubmissionRequest] = useState<{ instructions: string | null; due_by: string | null; created_at: string } | null>(null);

  // Fetch lookup data once
  useEffect(() => {
    Promise.all([
      fetch("/api/units").then(res => res.json()),
      fetch("/api/brands").then(res => res.json()),
      fetch("/api/branches").then(res => res.json()),
      fetch("/api/renovation-types").then(res => res.json()),
      fetch("/api/work-categories").then(res => res.json()),
    ]).then(([unitsData, brandsData, branchesData, typesData, workCategoriesData]) => {
      setUnits(unitsData);
      setBrands(brandsData);
      setBranches(branchesData);
      setRenovationTypes(typesData);
      setWorkCategories(workCategoriesData);
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

      // Optional frontend override – works even if backend canEdit is wrong,
      // but must never grant editing once the tender itself has closed
      // (2026-08-10) — that's a real lock (no more submissions), not a
      // canEdit-computation bug this override exists to paper over.
      let editable = data.canEdit;
      if (!editable && session?.user) {
        const userRole = (session.user as any)?.role;
        const userId = (session.user as any)?.id;
        const ownerId = data.submission?.contractor_id || data.submission?.user_id;
        const tenderStillOpen = data.submission?.tender_status_code === "Open";
        if (userRole === 'contractor' && ownerId === userId && tenderStillOpen) {
          editable = true;
        }
      }
      setCanEdit(editable);
      setResubmissionRequest(data.resubmissionRequest || null);

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

  // Update submission header (client, branch, etc.). Returns whether the
  // update succeeded — most callers here are fire-and-forget (client/branch/
  // renovation-type edits), but updateStatus's caller needs to know whether
  // a submit actually went through before showing a success confirmation.
  const updateSubmission = useCallback(async (fields: any): Promise<boolean> => {
    if (!submission) return false;
    // Optimistic: reflect the change immediately, roll back if the request
    // fails so the UI never shows a change that didn't actually persist.
    const previous = submission;
    setSubmission((prev: any) => ({ ...prev, ...fields }));
    setLastUpdateError(null);
    try {
      const res = await fetch("/api/bq/submission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.submission_id, ...fields }),
      });
      if (!res.ok) {
        setSubmission(previous);
        const body = await res.json().catch(() => null);
        setLastUpdateError(body);
        console.error("Update failed");
        return false;
      }
      // Re-sync in the background (e.g. canEdit depends on server-derived
      // state like status) — the optimistic set above already gave the user
      // immediate feedback, this just corrects anything it couldn't know.
      await fetchBQ();
      return true;
    } catch (err) {
      setSubmission(previous);
      console.error("Failed to update submission header", err);
      return false;
    }
  }, [submission, fetchBQ]);

  const updateClient = useCallback((clientName: string, logoUrl: string) => {
    updateSubmission({ client_name_override: clientName, logo_url: logoUrl });
  }, [updateSubmission]);

  const updateRenovationType = useCallback((typeId: number) => {
    updateSubmission({ renovation_type_override: typeId });
  }, [updateSubmission]);

  const updateStatus = useCallback((newStatus: string): Promise<boolean> => {
    if (!canEdit) return Promise.resolve(false);
    return updateSubmission({ status: newStatus });
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

  // Recursively collect a line item and every descendant's line_item_id
  // (mirrors the DB's ON DELETE CASCADE on parent_item_id) so an optimistic
  // local removal matches what the server will actually end up deleting.
  const collectWithDescendants = useCallback((cats: Category[], rootIds: number[]): Set<number> => {
    const allItems = cats.flatMap((c) => c.items);
    const result = new Set<number>(rootIds);
    let added = true;
    while (added) {
      added = false;
      for (const item of allItems) {
        if (item.parent_item_id != null && result.has(item.parent_item_id) && !result.has(item.line_item_id)) {
          result.add(item.line_item_id);
          added = true;
        }
      }
    }
    return result;
  }, []);

  // Add new item (optimistic — placeholder appears immediately with a
  // temporary negative id, reconciled with the real id once the server
  // responds, or removed on failure). sort_order/level are recomputed
  // server-side the same simple way they're derived here.
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

    const tempId = -Date.now();
    setCategories((prev) => {
      const allItems = prev.flatMap((c) => c.items);
      const siblings = allItems.filter((i) => i.category_id === categoryId && i.parent_item_id === parentId);
      const nextSort = siblings.length > 0 ? Math.max(...siblings.map((i) => i.sort_order)) + 1 : 0;
      const parent = parentId != null ? allItems.find((i) => i.line_item_id === parentId) : null;
      const targetCategory = prev.find((c) => c.category_id === categoryId);
      const placeholder: LineItem = {
        ...newItem,
        line_item_id: tempId,
        amount: 0,
        sort_order: nextSort,
        item_no: "",
        category_name: targetCategory?.category_name || "",
        depth: parent ? (parent.depth ?? 0) + 1 : 0,
      };
      return prev.map((cat) => (cat.category_id === categoryId ? { ...cat, items: [...cat.items, placeholder] } : cat));
    });

    try {
      const res = await fetch("/api/bq/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) throw new Error("Failed to add item");
      const data = await res.json();
      const realId = data?.line_item_id;
      if (realId) {
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            items: cat.items.map((i) => (i.line_item_id === tempId ? { ...i, line_item_id: realId } : i)),
          }))
        );
      } else {
        // Response didn't include the new id — fall back to a full refetch
        // rather than leave a placeholder with a fake negative id in place.
        await fetchBQ();
      }
    } catch (err) {
      setCategories((prev) =>
        prev.map((cat) => ({ ...cat, items: cat.items.filter((i) => i.line_item_id !== tempId) }))
      );
      console.error(err);
      toast.error("Could not add item");
    }
  }, [submissionId, canEdit, fetchBQ]);

  // Delete single item (optimistic — removes it and its sub-items locally
  // immediately, restores them on failure)
  const deleteItem = useCallback(async (line_item_id: number) => {
    if (!canEdit) return;
    if (!(await confirm({ description: "Delete this line item and its sub‑items?", confirmText: "Delete", variant: "destructive" }))) return;

    const previousCategories = categories;
    const toRemove = collectWithDescendants(categories, [line_item_id]);
    setCategories((prev) => prev.map((cat) => ({ ...cat, items: cat.items.filter((i) => !toRemove.has(i.line_item_id)) })));

    try {
      const res = await fetch("/api/bq/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_item_id }),
      });
      if (!res.ok) throw new Error("Delete failed");
    } catch (err) {
      setCategories(previousCategories);
      console.error(err);
      toast.error("Could not delete item");
    }
  }, [canEdit, confirm, categories, collectWithDescendants]);

  // Batch delete selected items (optimistic, same rollback shape as deleteItem)
  const deleteSelectedItems = useCallback(async (ids: number[]) => {
    if (!canEdit || !ids.length) return;
    if (!(await confirm({ description: `Delete ${ids.length} selected item(s) and their sub‑items?`, confirmText: "Delete", variant: "destructive" }))) return;

    const previousCategories = categories;
    const toRemove = collectWithDescendants(categories, ids);
    setCategories((prev) => prev.map((cat) => ({ ...cat, items: cat.items.filter((i) => !toRemove.has(i.line_item_id)) })));

    try {
      const res = await fetch("/api/bq/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_item_ids: ids }),
      });
      if (!res.ok) throw new Error("Delete failed");
    } catch (err) {
      setCategories(previousCategories);
      console.error(err);
      toast.error("Could not delete selected items");
    }
  }, [canEdit, confirm, categories, collectWithDescendants]);

  // Add category (optimistic — the name/sort_order come from the
  // work-categories lookup fetched alongside units/brands/branches, so
  // there's no need to wait on the server before showing the new category)
  const addCategory = useCallback(async (categoryId: number) => {
    if (!submission) return;
    const workCat = workCategories.find((c) => c.category_id === categoryId);
    if (categories.some((c) => c.category_id === categoryId)) return;
    const previousCategories = categories;
    setCategories((prev) => [
      ...prev,
      {
        category_id: categoryId,
        category_name: workCat?.name || "",
        sort_order: workCat?.sort_order ?? prev.length,
        items: [],
      },
    ]);
    try {
      const res = await fetch("/api/bq/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.submission_id, category_id: categoryId }),
      });
      if (!res.ok) throw new Error("Add category failed");
    } catch (err) {
      setCategories(previousCategories);
      console.error(err);
      toast.error("Could not add the category");
    }
  }, [submission, categories, workCategories, toast]);

  // Remove category (optimistic — the full category object, including its
  // items, is already in local state so it can be restored exactly on
  // failure; unlike addCategory this needs no server-derived data to apply
  // locally)
  const removeCategory = useCallback(async (categoryId: number) => {
    if (!submission) return;
    if (!(await confirm({ description: "Remove entire category and all its items?", confirmText: "Remove", variant: "destructive" }))) return;
    const previousCategories = categories;
    setCategories((prev) => prev.filter((cat) => cat.category_id !== categoryId));
    try {
      const res = await fetch("/api/bq/category", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.submission_id, category_id: categoryId }),
      });
      if (!res.ok) throw new Error("Remove category failed");
    } catch (err) {
      setCategories(previousCategories);
      console.error(err);
      toast.error("Could not remove the category");
    }
  }, [submission, categories, confirm]);

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
    workCategories,
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
    lastUpdateError,
    resubmissionRequest,
    resetToTemplate,   // <-- exported
  };
}