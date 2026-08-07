"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useRef, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ExcelJS from "exceljs"; // ✅ replaced xlsx
import { useNotify } from "@/components/ui/notification-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface WorkCategory {
  category_id: number;
  name: string;
}

interface BQTemplateItem {
  item_id: number;
  tender_id: number;
  category_id: number;
  parent_item_id: number | null;
  description: string;
  quantity: number | null;
  unit: string;
  sort_order: number;
}

// Helper: get item number (e.g., "1.01", "1.01.02")
function getItemNumber(
  item: BQTemplateItem,
  allItems: BQTemplateItem[],
  categoryIndexMap: Map<number, number>
): string {
  const catIdx = categoryIndexMap.get(item.category_id);
  if (catIdx === undefined) return "?";

  const siblings = allItems
    .filter(
      (i) =>
        i.category_id === item.category_id && i.parent_item_id === item.parent_item_id
    )
    .sort((a, b) => a.sort_order - b.sort_order);
  const idxInSiblings = siblings.findIndex((i) => i.item_id === item.item_id);
  if (idxInSiblings === -1) return "?";

  if (item.parent_item_id === null) {
    return `${catIdx}.${(idxInSiblings + 1).toString().padStart(2, "0")}`;
  }

  const buildChain = (current: BQTemplateItem): BQTemplateItem[] => {
    const chain = [current];
    let parent = allItems.find((i) => i.item_id === current.parent_item_id);
    while (parent) {
      chain.unshift(parent);
      parent = allItems.find((i) => i.item_id === parent?.parent_item_id);
    }
    return chain;
  };
  const chain = buildChain(item);
  const topLevel = chain[0];
  const topSiblings = allItems
    .filter((i) => i.category_id === topLevel.category_id && i.parent_item_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);
  const topIdx = topSiblings.findIndex((i) => i.item_id === topLevel.item_id);
  let numberStr = `${catIdx}.${(topIdx + 1).toString().padStart(2, "0")}`;
  for (let i = 1; i < chain.length; i++) {
    const levelItem = chain[i];
    const levelSiblings = allItems
      .filter(
        (s) =>
          s.category_id === levelItem.category_id &&
          s.parent_item_id === levelItem.parent_item_id
      )
      .sort((a, b) => a.sort_order - b.sort_order);
    const levelIdx = levelSiblings.findIndex((s) => s.item_id === levelItem.item_id);
    numberStr += `.${(levelIdx + 1).toString().padStart(2, "0")}`;
  }
  return numberStr;
}

// ------------- STATIC UNIT MAPPING -------------
const UNIT_MAP: { display: string; code: string }[] = [
  { display: "Nos", code: "NOS" },
  { display: "Set", code: "SET" },
  { display: "m", code: "M" },
  { display: "m²", code: "M2" },
  { display: "m³", code: "M3" },
  { display: "mm", code: "MM" },
  { display: "mm²", code: "MM2" },
  { display: "cm²", code: "CM2" },
  { display: "kg", code: "KG" },
  { display: "Lot", code: "LOT" },
  { display: "L.S.", code: "LS" },
];

function getDisplayFromCode(code: string): string {
  const found = UNIT_MAP.find((u) => u.code === code);
  return found ? found.display : code;
}

function getCodeFromDisplay(display: string): string {
  const found = UNIT_MAP.find((u) => u.display === display);
  return found ? found.code : display;
}

// Sortable row component
interface SortableItemRowProps {
  item: BQTemplateItem;
  level: number;
  itemNumber: string;
  onUpdate: (itemId: number, field: keyof BQTemplateItem, value: any) => void;
  onDelete: (itemId: number) => void;
  onAddSub: (parentId: number) => void;
  children?: React.ReactNode;
}

function SortableItemRow({
  item,
  level,
  itemNumber,
  onUpdate,
  onDelete,
  onAddSub,
  children,
}: SortableItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.item_id.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const indent = level * 24;
  const displayUnit = getDisplayFromCode(item.unit);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-3 py-3 border-b border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
        style={{ paddingLeft: `${indent}px` }}
      >
        <div className="w-16 text-xs text-gray-500 dark:text-gray-400 font-mono self-center">
          {itemNumber}
        </div>
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 px-1 self-center text-lg"
          title="Drag to reorder"
        >
          ⋮⋮
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate(item.item_id, "description", e.target.value)}
            className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400 focus:border-transparent"
            placeholder="Description"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <input
            type="number"
            step="any"
            value={item.quantity ?? ""}
            onChange={(e) => {
              const val = e.target.value === "" ? null : parseFloat(e.target.value);
              onUpdate(item.item_id, "quantity", val);
            }}
            className="w-24 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white text-right focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
            placeholder="Qty"
          />
          <input
            type="text"
            list="unit-datalist"
            value={displayUnit}
            onChange={(e) => {
              const storedCode = getCodeFromDisplay(e.target.value);
              onUpdate(item.item_id, "unit", storedCode);
            }}
            className="w-24 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
            placeholder="Unit"
          />
        </div>
        <div className="flex gap-2 self-end sm:self-center">
          {level === 0 && (
            <button
              onClick={() => onAddSub(item.item_id)}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-green-50 text-green-700 dark:bg-green-500/20 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-500/30 transition-colors flex items-center gap-1"
            >
              ➕ Sub
            </button>
          )}
          <button
            onClick={() => onDelete(item.item_id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/30 transition-colors flex items-center gap-1"
          >
            🗑️ Delete
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

// Main component
export default function BQTemplateEditPage() {
  const { tenderId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useNotify();

  const [items, setItems] = useState<BQTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [allCategories, setAllCategories] = useState<WorkCategory[]>([]);
  const [enabledCategoryIds, setEnabledCategoryIds] = useState<number[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [tempSelectedCategories, setTempSelectedCategories] = useState<number[]>([]);
  const [newItemForm, setNewItemForm] = useState<{
    category_id: number;
    parent_id: number | null;
    description: string;
    quantity: string;
    unitDisplay: string;
  } | null>(null);
  const [saveTimer, setSaveTimer] = useState<NodeJS.Timeout | null>(null);
  const [tenderName, setTenderName] = useState<string>("");
  const fetchedRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const fetchTenderName = async () => {
    try {
      const res = await fetch(`/api/tenders/${tenderId}`);
      const data = await res.json();
      if (res.ok && data.tender_name) {
        setTenderName(data.tender_name);
      } else {
        setTenderName(`#${tenderId}`);
      }
    } catch (err) {
      console.error("Failed to fetch tender name", err);
      setTenderName(`#${tenderId}`);
    }
  };

  const fetchAllCategories = async () => {
    try {
      const res = await fetch("/api/work-categories");
      const data = await res.json();
      setAllCategories(data);
    } catch (err) {
      console.error("Failed to fetch categories", err);
    }
  };

  const fetchItems = async (): Promise<BQTemplateItem[]> => {
    try {
      const res = await fetch(`/api/admin/bq-template?tenderId=${tenderId}`);
      const data = await res.json();
      const mapped = data.map((item: any) => ({
        ...item,
        quantity: item.quantity ?? item.qty ?? null,
      }));
      setItems(mapped);
      return mapped;
    } catch (err) {
      console.error("Failed to fetch items", err);
      return [];
    }
  };

  const fetchEnabledCategories = async (): Promise<number[]> => {
    try {
      const res = await fetch(`/api/admin/bq-template/categories?tenderId=${tenderId}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setEnabledCategoryIds(arr);
      return arr;
    } catch (err) {
      console.error("Failed to fetch enabled categories", err);
      return [];
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedItems, fetchedEnabled] = await Promise.all([
        fetchItems(),
        fetchEnabledCategories(),
        fetchAllCategories(),
        fetchTenderName(),
      ]);

      const itemsArray = Array.isArray(fetchedItems) ? fetchedItems : [];
      const enabledArray = Array.isArray(fetchedEnabled) ? fetchedEnabled : [];

      // Auto-enable categories that have items if none were saved before
      if (enabledArray.length === 0 && itemsArray.length > 0) {
        const categoryIdsWithItems = [
          ...new Set(itemsArray.map((item: BQTemplateItem) => item.category_id)),
        ];
        setEnabledCategoryIds(categoryIdsWithItems);
        // Persist to backend
        await fetch("/api/admin/bq-template/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenderId: parseInt(tenderId as string, 10),
            categoryIds: categoryIdsWithItems,
          }),
        });
      } else {
        setEnabledCategoryIds(enabledArray);
      }
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user && (session.user as any)?.role_id !== 1) router.push("/dashboard");
    if (session?.user && tenderId && !fetchedRef.current) {
      fetchedRef.current = true;
      loadData();
    }
  }, [session, status, tenderId]);

  const getChildren = (parentId: number | null, categoryId: number) => {
    return items
      .filter((i) => i.category_id === categoryId && i.parent_item_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order);
  };

  const visibleCategories = allCategories.filter((cat) =>
    enabledCategoryIds.includes(cat.category_id)
  );

  const categoryIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    visibleCategories.forEach((cat, idx) => {
      map.set(cat.category_id, idx + 1);
    });
    return map;
  }, [visibleCategories]);

  const itemsWithNumbers = useMemo(() => {
    return items.map((item) => ({
      ...item,
      number: getItemNumber(item, items, categoryIndexMap),
    }));
  }, [items, categoryIndexMap]);

  const scheduleSave = (updatedItem: BQTemplateItem) => {
    if (saveTimer) clearTimeout(saveTimer);
    const timer = setTimeout(() => saveItem(updatedItem), 1000);
    setSaveTimer(timer);
  };

  const saveItem = async (item: BQTemplateItem) => {
    const payload = {
      item_id: item.item_id,
      description: item.description,
      quantity: item.quantity,
      qty: item.quantity,
      unit: item.unit,
    };
    try {
      const res = await fetch("/api/admin/bq-template/item", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.error("Auto‑save failed");
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const handleUpdate = (itemId: number, field: keyof BQTemplateItem, value: any) => {
    const updatedItems = items.map((i) =>
      i.item_id === itemId ? { ...i, [field]: value } : i
    );
    setItems(updatedItems);
    const changedItem = updatedItems.find((i) => i.item_id === itemId);
    if (changedItem) scheduleSave(changedItem);
  };

  const handleDelete = async (itemId: number) => {
    if (!(await confirm({ description: "Delete this item? It will also delete all sub‑items and contractor entries.", confirmText: "Delete", variant: "destructive" })))
      return;
    const res = await fetch(`/api/admin/bq-template/item?id=${itemId}`, { method: "DELETE" });
    if (res.ok) {
      fetchItems();
    } else {
      const err = await res.json();
      toast.error(err.error || "Delete failed");
    }
  };

  const handleAddSub = (parentId: number) => {
    const parent = items.find((i) => i.item_id === parentId);
    if (parent) {
      setNewItemForm({
        category_id: parent.category_id,
        parent_id: parentId,
        description: "",
        quantity: "",
        unitDisplay: "",
      });
    }
  };

  const handleAddItem = async () => {
    if (!newItemForm) return;
    if (!newItemForm.description.trim() || !newItemForm.unitDisplay.trim()) {
      toast.error("Please fill in description and unit");
      return;
    }

    const quantityValue =
      newItemForm.quantity.trim() === "" ? null : parseFloat(newItemForm.quantity);
    const storedUnitCode = getCodeFromDisplay(newItemForm.unitDisplay);

    const siblings = items.filter(
      (i) =>
        i.category_id === newItemForm.category_id &&
        i.parent_item_id === newItemForm.parent_id
    );
    const nextSort = siblings.length > 0 ? Math.max(...siblings.map((i) => i.sort_order)) + 1 : 0;

    const payload = {
      tender_id: parseInt(tenderId as string, 10),
      category_id: newItemForm.category_id,
      parent_item_id: newItemForm.parent_id,
      description: newItemForm.description.trim(),
      quantity: quantityValue,
      qty: quantityValue,
      unit: storedUnitCode,
      sort_order: nextSort,
    };

    try {
      const res = await fetch("/api/admin/bq-template/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setNewItemForm(null);
        fetchItems();
      } else {
        const errText = await res.text();
        toast.error("Failed to add item: " + errText);
      }
    } catch (err) {
      console.error("Network error:", err);
      toast.error("Network error. Please try again.");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = parseInt(active.id as string);
    const overId = parseInt(over.id as string);

    const activeItem = items.find((i) => i.item_id === activeId);
    const overItem = items.find((i) => i.item_id === overId);
    if (!activeItem || !overItem) return;

    if (
      activeItem.category_id !== overItem.category_id ||
      activeItem.parent_item_id !== overItem.parent_item_id
    ) {
      return;
    }

    const siblings = items
      .filter(
        (i) =>
          i.category_id === activeItem.category_id &&
          i.parent_item_id === activeItem.parent_item_id
      )
      .sort((a, b) => a.sort_order - b.sort_order);

    const oldIndex = siblings.findIndex((i) => i.item_id === activeId);
    const newIndex = siblings.findIndex((i) => i.item_id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const updates = reordered.map((item, idx) => ({
      item_id: item.item_id,
      sort_order: idx,
    }));

    await Promise.all(
      updates.map(({ item_id, sort_order }) =>
        fetch("/api/admin/bq-template/item", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id, sort_order }),
        })
      )
    );

    fetchItems();
  };

  const handleSaveCategories = async () => {
    const res = await fetch("/api/admin/bq-template/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenderId: parseInt(tenderId as string, 10),
        categoryIds: tempSelectedCategories,
      }),
    });
    if (res.ok) {
      setEnabledCategoryIds(tempSelectedCategories);
      setShowCategoryModal(false);
      fetchItems();
    } else {
      toast.error("Failed to update categories");
    }
  };

  // ✅ Updated export using exceljs
  const exportToExcel = async () => {
    const rows: any[][] = [];
    rows.push(["S/NO.", "DESCRIPTION", "* Reference Quantity", "U/RATE", "AMOUNT"]);
    rows.push([]);

    visibleCategories.forEach((category, catIdx) => {
      rows.push([(catIdx + 1).toString(), category.name, "", "", ""]);
      rows.push([]);

      const rootItems = getChildren(null, category.category_id);
      rootItems.forEach((item, idx) => {
        const numbered = itemsWithNumbers.find((i) => i.item_id === item.item_id);
        const itemNumber = numbered?.number || `${catIdx + 1}.${(idx + 1).toString().padStart(2, "0")}`;
        rows.push([
          itemNumber,
          item.description,
          item.quantity ?? "",
          getDisplayFromCode(item.unit),
          "",
        ]);

        const subItems = getChildren(item.item_id, category.category_id);
        subItems.forEach((sub, subIdx) => {
          const subNumber = `${itemNumber}.${(subIdx + 1).toString().padStart(2, "0")}`;
          rows.push([
            subNumber,
            sub.description,
            sub.quantity ?? "",
            getDisplayFromCode(sub.unit),
            "",
          ]);
        });
      });
      rows.push([]);
    });

    // Create exceljs workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("BQ");

    // Add rows to the worksheet
    rows.forEach((row) => {
      worksheet.addRow(row);
    });

    // Generate buffer and trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BQ_Template_${tenderName.replace(/[^a-z0-9]/gi, "_")}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Excel Import (unchanged – handled by server)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tenderId", tenderId as string);
    try {
      const res = await fetch("/api/admin/bq-template/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Imported ${data.imported} items.`);
        await loadData(); // Reload everything, auto-enable categories
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch (err) {
      toast.error("Network error. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const renderItemTree = (parentId: number | null, categoryId: number, level: number = 0) => {
    const children = getChildren(parentId, categoryId);
    if (children.length === 0) return null;

    const childIds = children.map((c) => c.item_id.toString());

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          {children.map((item) => {
            const numberedItem = itemsWithNumbers.find((i) => i.item_id === item.item_id);
            const itemNumber = numberedItem?.number || "?";
            return (
              <SortableItemRow
                key={item.item_id}
                item={item}
                level={level}
                itemNumber={itemNumber}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onAddSub={handleAddSub}
              >
                {renderItemTree(item.item_id, categoryId, level + 1)}
              </SortableItemRow>
            );
          })}
        </SortableContext>
      </DndContext>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a1228]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 dark:text-cyan-300/70">Loading BQ template editor…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a1228] py-4 sm:py-8 px-3 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-cyan-500/30 rounded-xl shadow-sm p-4 sm:p-5 mb-6">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Edit BQ Template: {tenderName}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-white/60 mt-1">
                Drag ⋮⋮ to reorder. Changes auto‑save.
              </p>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <label className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white cursor-pointer transition-colors">
                {uploading ? "Uploading..." : "📤 Upload Excel"}
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              <button
                onClick={exportToExcel}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white transition-colors"
              >
                📥 Export Excel
              </button>
              <button
                onClick={() => {
                  setTempSelectedCategories([...enabledCategoryIds]);
                  setShowCategoryModal(true);
                }}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors"
              >
                Manage Categories
              </button>
              <button
                onClick={() => router.push(`/admin/tenders/${tenderId}/bq-template`)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/80 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
              >
                ← Back to Simple View
              </button>
            </div>
          </div>
        </div>

        <datalist id="unit-datalist">
          {UNIT_MAP.map((unit) => (
            <option key={unit.code} value={unit.display}>
              {unit.display}
            </option>
          ))}
        </datalist>

        {/* Category Modal */}
        {showCategoryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#0a1228] rounded-xl shadow-xl p-6 max-w-md w-full max-h-[80vh] overflow-auto border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                Select Categories
              </h2>
              <div className="space-y-2">
                {allCategories.map((cat) => (
                  <label
                    key={cat.category_id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={tempSelectedCategories.includes(cat.category_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTempSelectedCategories([...tempSelectedCategories, cat.category_id]);
                        } else {
                          setTempSelectedCategories(
                            tempSelectedCategories.filter((id) => id !== cat.category_id)
                          );
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 focus:ring-blue-500 dark:focus:ring-cyan-400"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{cat.name}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleSaveCategories}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white py-2 rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="flex-1 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-white py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Categories and items */}
        <div className="space-y-6">
          {visibleCategories.map((category) => {
            const rootItems = getChildren(null, category.category_id);
            return (
              <div
                key={category.category_id}
                className="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-cyan-500/30 rounded-xl shadow-sm overflow-hidden"
              >
                <div className="bg-gray-50 dark:bg-white/10 px-4 py-3 border-b border-gray-200 dark:border-white/10">
                  <h3 className="font-semibold text-gray-800 dark:text-white text-base sm:text-lg">
                    {category.name}
                  </h3>
                </div>
                <div className="p-2 sm:p-4">
                  {rootItems.length === 0 && (
                    <div className="text-center text-gray-400 dark:text-white/40 py-4 text-sm">
                      No items yet. Click "Add Main Item" below.
                    </div>
                  )}
                  {renderItemTree(null, category.category_id)}

                  {/* Add Main Item form */}
                  {newItemForm && newItemForm.parent_id === null && newItemForm.category_id === category.category_id && (
                    <div className="flex flex-col sm:flex-row gap-3 py-3 mt-2 border-t border-gray-200 dark:border-white/10">
                      <input
                        type="text"
                        placeholder="Description"
                        value={newItemForm.description}
                        onChange={(e) =>
                          setNewItemForm({ ...newItemForm, description: e.target.value })
                        }
                        className="flex-1 border border-gray-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="any"
                          placeholder="Quantity"
                          value={newItemForm.quantity}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, quantity: e.target.value })
                          }
                          className="w-24 border border-gray-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white text-right focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
                        />
                        <input
                          type="text"
                          list="unit-datalist"
                          placeholder="Unit"
                          value={newItemForm.unitDisplay}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, unitDisplay: e.target.value })
                          }
                          className="w-24 border border-gray-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddItem}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setNewItemForm(null)}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 dark:bg-gray-500 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sub‑item form */}
                  {newItemForm && newItemForm.parent_id !== null && newItemForm.category_id === category.category_id && (
                    <div className="flex flex-col sm:flex-row gap-3 py-3 mt-2 pl-4 sm:pl-8 border-t border-gray-200 dark:border-white/10">
                      <input
                        type="text"
                        placeholder="Sub‑item description"
                        value={newItemForm.description}
                        onChange={(e) =>
                          setNewItemForm({ ...newItemForm, description: e.target.value })
                        }
                        className="flex-1 border border-gray-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="any"
                          placeholder="Quantity"
                          value={newItemForm.quantity}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, quantity: e.target.value })
                          }
                          className="w-24 border border-gray-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white text-right focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
                        />
                        <input
                          type="text"
                          list="unit-datalist"
                          placeholder="Unit"
                          value={newItemForm.unitDisplay}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, unitDisplay: e.target.value })
                          }
                          className="w-24 border border-gray-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1a2e] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddItem}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setNewItemForm(null)}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 dark:bg-gray-500 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Add Main Item button */}
                  {(!newItemForm || newItemForm.category_id !== category.category_id || newItemForm.parent_id !== null) && (
                    <div className="py-3">
                      <button
                        onClick={() =>
                          setNewItemForm({
                            category_id: category.category_id,
                            parent_id: null,
                            description: "",
                            quantity: "",
                            unitDisplay: "",
                          })
                        }
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                      >
                        + Add Main Item
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {visibleCategories.length === 0 && (
          <div className="bg-white dark:bg-white/5 rounded-xl p-8 text-center">
            <p className="text-gray-500 dark:text-white/50">
              No categories selected. Click "Manage Categories" to add some.
            </p>
          </div>
        )}

        <div className="mt-8 text-center text-xs sm:text-sm text-gray-500 dark:text-white/50 bg-gray-50 dark:bg-white/5 rounded-xl p-4">
          💡 Drag the ⋮⋮ handle to reorder items. Item numbers auto‑update. Fields auto‑save.
        </div>
      </div>
    </div>
  );
}