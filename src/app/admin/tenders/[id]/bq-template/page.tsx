// app/admin/tenders/[tenderId]/bq-template/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useNotify } from "@/components/ui/notification-provider";

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
    .filter(
      (i) =>
        i.category_id === topLevel.category_id && i.parent_item_id === null
    )
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

// ------------- STATIC UNIT MAPPING (for display only) -------------
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

// Simple read‑only row component
function ReadOnlyItemRow({
  item,
  level,
  itemNumber,
}: {
  item: BQTemplateItem;
  level: number;
  itemNumber: string;
}) {
  const indent = level * 24;
  const displayUnit = getDisplayFromCode(item.unit);

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-start gap-3 py-3 border-b border-gray-200 dark:border-white/10">
      <div className="w-16 text-xs text-gray-500 dark:text-gray-400 font-mono self-center">
        {itemNumber}
      </div>
      <div className="flex-1 text-sm text-gray-800 dark:text-gray-200">
        {item.description}
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <div className="w-24 text-center text-sm text-gray-700 dark:text-gray-300">
          {item.quantity ?? ""}
        </div>
        <div className="w-24 text-center text-sm text-gray-700 dark:text-gray-300">
          {displayUnit}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------
// Main component (read‑only with upload & clear)
// ----------------------------------------------
export default function BQTemplateViewPage() {
  const { tenderId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useNotify();
  const [items, setItems] = useState<BQTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [allCategories, setAllCategories] = useState<WorkCategory[]>([]);
  const [enabledCategoryIds, setEnabledCategoryIds] = useState<number[]>([]);
  const [tenderName, setTenderName] = useState<string>("");
  const fetchedRef = useRef(false);

  // Modal states
  // Fetch tender name
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
    const res = await fetch("/api/work-categories");
    const data = await res.json();
    setAllCategories(data);
  };

  const fetchItems = async () => {
    const res = await fetch(`/api/admin/bq-template?tenderId=${tenderId}`);
    const data = await res.json();
    const mapped = data.map((item: any) => ({
      ...item,
      quantity: item.quantity ?? item.qty ?? null,
    }));
    setItems(mapped);
  };

  const fetchEnabledCategories = async () => {
    const res = await fetch(`/api/admin/bq-template/categories?tenderId=${tenderId}`);
    const data = await res.json();
    setEnabledCategoryIds(data);
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchItems(), fetchEnabledCategories(), fetchAllCategories(), fetchTenderName()]);
    setLoading(false);
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

  const renderItemTree = (parentId: number | null, categoryId: number, level: number = 0) => {
    const children = getChildren(parentId, categoryId);
    if (children.length === 0) return null;

    return children.map((item) => {
      const numberedItem = itemsWithNumbers.find((i) => i.item_id === item.item_id);
      const itemNumber = numberedItem?.number || "?";
      return (
        <div key={item.item_id}>
          <ReadOnlyItemRow item={item} level={level} itemNumber={itemNumber} />
          {renderItemTree(item.item_id, categoryId, level + 1)}
        </div>
      );
    });
  };

  // ---------- UPLOAD EXCEL (with modal alerts) ----------
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
        toast.success(`Imported ${data.imported} items successfully. The BQ template has been updated.`);
        await loadData();
      } else {
        toast.error(data.error || "An error occurred during upload. Please check the file format and try again.");
      }
    } catch (err) {
      toast.error("Could not connect to the server. Please check your internet connection and try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // ---------- CLEAR TEMPLATE (with confirmation) ----------
  const handleClearTemplate = async () => {
    const proceed = await confirm({
      title: "Clear Entire Template?",
      description:
        "This will delete ALL BQ template items for this tender. This action cannot be undone and will affect all contractor submissions referencing these items.",
      confirmText: "Clear Template",
      variant: "destructive",
    });
    if (!proceed) return;

    setClearing(true);
    try {
      const res = await fetch(`/api/admin/bq-template/clear?tenderId=${tenderId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("All BQ template items have been deleted. You can now upload a new template or add items manually.");
        await loadData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to clear template.");
      }
    } catch (err) {
      toast.error("Could not connect to the server.");
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a1228]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 dark:text-cyan-300/70">Loading BQ template…</p>
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
                BQ Template for Tender: {tenderName}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-white/60 mt-1">
                Read‑only view. Use the edit page to modify the template.
              </p>
            </div>
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              <label className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 cursor-pointer transition-colors">
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
                onClick={handleClearTemplate}
                disabled={clearing}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "🗑️ Clear Template"}
              </button>
              <button
                onClick={() => router.push(`/admin/tenders/${tenderId}/bq-template/edit`)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 transition-colors"
              >
                ✏️ Edit Template
              </button>
              <button
                onClick={() => router.push("/admin/tenders")}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/80 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>

        {/* Categories and items (read‑only) */}
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
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 pb-2 border-b border-gray-300 dark:border-white/20 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <div className="w-16">Item No.</div>
                    <div className="flex-1">Description</div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <div className="w-24 text-center">Quantity</div>
                      <div className="w-24 text-center">Unit</div>
                    </div>
                  </div>
                  {rootItems.length === 0 && (
                    <div className="text-center text-gray-400 dark:text-white/40 py-4 text-sm">
                      No items in this category.
                    </div>
                  )}
                  {renderItemTree(null, category.category_id)}
                </div>
              </div>
            );
          })}
        </div>

        {visibleCategories.length === 0 && (
          <div className="bg-white dark:bg-white/5 rounded-xl p-8 text-center">
            <p className="text-gray-500 dark:text-white/50">
              No categories selected. Go to <strong>Edit Template</strong> to add categories.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}