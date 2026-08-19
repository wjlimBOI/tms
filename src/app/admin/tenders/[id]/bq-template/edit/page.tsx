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
import { isSuperUser } from "@/lib/roles";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { RateStats } from "@/lib/rateStats";
import type { FlaggedItem } from "@/lib/bqRateSummary";

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
  rate: number | null;
  sort_order: number;
}

interface ItemSearchResult {
  description: string;
  unit: string;
  category_id: number;
  category_name: string;
  usage_count: number;
  avg_rate: number | null;
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

// Units are sourced from /api/units (the real unit_measure table) — see
// the units state in the main component below, passed down where needed.
type UnitOption = { unit_code: string; unit_name: string };

function getDisplayFromCode(code: string, units: UnitOption[]): string {
  const found = units.find((u) => u.unit_code === code);
  return found ? found.unit_name : code;
}

function getCodeFromDisplay(display: string, units: UnitOption[]): string {
  const found = units.find((u) => u.unit_name === display);
  return found ? found.unit_code : display;
}

// Sortable row component
interface SortableItemRowProps {
  item: BQTemplateItem;
  level: number;
  itemNumber: string;
  onUpdate: (itemId: number, field: keyof BQTemplateItem, value: any) => void;
  onDelete: (itemId: number) => void;
  onAddSub: (parentId: number) => void;
  units: UnitOption[];
  children?: React.ReactNode;
}

function SortableItemRow({
  item,
  level,
  itemNumber,
  onUpdate,
  onDelete,
  onAddSub,
  units,
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
  const displayUnit = getDisplayFromCode(item.unit, units);

  const [marketCheck, setMarketCheck] = useState<{
    status: "idle" | "loading" | "done" | "error";
    referenceStats?: RateStats;
    marketStats?: RateStats;
  }>({ status: "idle" });

  const checkMarketRate = async () => {
    if (!item.description.trim()) return;
    setMarketCheck({ status: "loading" });
    try {
      const params = new URLSearchParams({
        description: item.description.trim(),
        exclude_item_id: item.item_id.toString(),
      });
      const res = await fetch(`/api/admin/bq-template/market-rate?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch market rate");
      const data = await res.json();
      setMarketCheck({ status: "done", referenceStats: data.referenceStats, marketStats: data.marketStats });
    } catch {
      setMarketCheck({ status: "error" });
    }
  };

  // Prefer real contractor-bid data (marketStats) over admin-set reference
  // rates (referenceStats) when both exist - it's the closer signal to
  // "what people are actually paying."
  const comparisonAvg =
    marketCheck.status === "done"
      ? (marketCheck.marketStats!.count > 0 ? marketCheck.marketStats!.avg : marketCheck.referenceStats!.avg)
      : null;
  const deviationPct =
    comparisonAvg && comparisonAvg > 0 && item.rate != null
      ? ((item.rate - comparisonAvg) / comparisonAvg) * 100
      : null;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-3 py-3 border-b border-gray-200 hover:bg-gray-50 transition-colors"
        style={{ paddingLeft: `${indent}px` }}
      >
        <div className="w-16 text-xs text-gray-500 font-mono self-center">
          {itemNumber}
        </div>
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 px-1 self-center text-lg"
          title="Drag to reorder"
        >
          ⋮⋮
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate(item.item_id, "description", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 text-right focus:ring-2 focus:ring-blue-500"
            placeholder="Qty"
          />
          <input
            type="text"
            list="unit-datalist"
            value={displayUnit}
            onChange={(e) => {
              const storedCode = getCodeFromDisplay(e.target.value, units);
              onUpdate(item.item_id, "unit", storedCode);
            }}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
            placeholder="Unit"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={item.rate ?? ""}
            onChange={(e) => {
              const val = e.target.value === "" ? null : parseFloat(e.target.value);
              onUpdate(item.item_id, "rate", val);
            }}
            className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 text-right focus:ring-2 focus:ring-blue-500"
            placeholder="Rate"
            aria-label="Reference rate"
          />
          <button
            type="button"
            onClick={checkMarketRate}
            disabled={marketCheck.status === "loading" || !item.description.trim()}
            title="Compare against rates used elsewhere in the app"
            aria-label="Compare rate against market data"
            className="px-2.5 py-2 rounded-lg text-xs font-medium border-2 border-[#15406a] bg-white text-[#15406a] hover:bg-[#15406a] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {marketCheck.status === "loading" ? "…" : "📊"}
          </button>
        </div>
        <div className="flex gap-2 self-end sm:self-center">
          {level === 0 && (
            <button
              onClick={() => onAddSub(item.item_id)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border-2 border-[#15406a] bg-white text-[#15406a] hover:bg-[#15406a] hover:text-white transition-colors flex items-center gap-1"
            >
              ➕ Sub
            </button>
          )}
          <button
            onClick={() => onDelete(item.item_id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1"
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      {marketCheck.status !== "idle" && (
        <div
          className="text-xs px-3 py-2 mb-2 rounded-lg bg-gray-50 border border-gray-200"
          style={{ marginLeft: `${indent}px` }}
        >
          {marketCheck.status === "loading" && (
            <span className="text-gray-500">Checking market rate…</span>
          )}
          {marketCheck.status === "error" && (
            <span className="text-red-600">
              Couldn't check market rate.{" "}
              <button onClick={checkMarketRate} className="underline hover:no-underline">
                Retry
              </button>
            </span>
          )}
          {marketCheck.status === "done" && (
            <div className="flex flex-wrap items-center gap-2">
              {marketCheck.marketStats!.count === 0 && marketCheck.referenceStats!.count === 0 ? (
                <span className="text-gray-500">
                  No historical data found for this description yet.
                </span>
              ) : (
                <>
                  {marketCheck.marketStats!.count > 0 && (
                    <span className="text-gray-700">
                      Bid rates from {marketCheck.marketStats!.count} contractor submission
                      {marketCheck.marketStats!.count === 1 ? "" : "s"}: avg{" "}
                      <strong>{marketCheck.marketStats!.avg!.toFixed(2)}</strong> (
                      {marketCheck.marketStats!.min!.toFixed(2)}–{marketCheck.marketStats!.max!.toFixed(2)})
                    </span>
                  )}
                  {marketCheck.referenceStats!.count > 0 && (
                    <span className="text-gray-500">
                      Reference rates on {marketCheck.referenceStats!.count} other template
                      {marketCheck.referenceStats!.count === 1 ? "" : "s"}: avg{" "}
                      {marketCheck.referenceStats!.avg!.toFixed(2)}
                    </span>
                  )}
                  {deviationPct !== null && (
                    <Badge variant={Math.abs(deviationPct) <= 20 ? "secondary" : "destructive"}>
                      {deviationPct > 0 ? "+" : ""}
                      {deviationPct.toFixed(0)}% vs. avg
                    </Badge>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
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
    rate: string;
  } | null>(null);
  const [saveTimer, setSaveTimer] = useState<NodeJS.Timeout | null>(null);
  const [tenderName, setTenderName] = useState<string>("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const fetchedRef = useRef(false);

  // Find & reuse an existing item
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ItemSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [addingResultKey, setAddingResultKey] = useState<string | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Whole-BQ auto pricing scan
  const [rateSummary, setRateSummary] = useState<{
    status: "idle" | "loading" | "done" | "error";
    data?: {
      flaggedHigh: FlaggedItem[];
      flaggedLow: FlaggedItem[];
      withinRange: number;
      noHistory: number;
      totalPriced: number;
      summary: string;
      aiGenerated: boolean;
    };
  }>({ status: "idle" });

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

  const fetchUnits = async () => {
    try {
      const res = await fetch("/api/units");
      const data = await res.json();
      setUnits(data);
    } catch (err) {
      console.error("Failed to fetch units", err);
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

  const fetchRateSummary = async () => {
    setRateSummary({ status: "loading" });
    try {
      const res = await fetch(`/api/admin/bq-template/rate-summary?tenderId=${tenderId}`);
      if (!res.ok) throw new Error("Failed to fetch rate summary");
      const data = await res.json();
      setRateSummary({ status: "done", data });
    } catch {
      setRateSummary({ status: "error" });
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
        fetchUnits(),
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
    // Runs once per page load, independent of the loading spinner above —
    // it can take longer (an optional Anthropic call) and isn't required to
    // render the template itself. A manual "Refresh" button re-runs it
    // after edits, rather than auto-firing on every keystroke/auto-save.
    fetchRateSummary();
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user && !isSuperUser((session.user as any)?.roleIds || [])) router.push("/dashboard");
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
      rate: item.rate,
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
        rate: "",
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
    const rateValue =
      newItemForm.rate.trim() === "" ? null : parseFloat(newItemForm.rate);
    const storedUnitCode = getCodeFromDisplay(newItemForm.unitDisplay, units);

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
      rate: rateValue,
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

  const runItemSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }
    setSearchStatus("loading");
    try {
      const res = await fetch(`/api/admin/bq-template/item-search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.results || []);
      setSearchStatus("done");
    } catch {
      setSearchStatus("error");
    }
  };

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => runItemSearch(value), 400);
  };

  const handleAddFromSearch = async (result: ItemSearchResult) => {
    if (!enabledCategoryIds.includes(result.category_id)) {
      toast.error(
        `"${result.category_name}" isn't enabled for this tender yet. Enable it under "Manage Categories" first, then try again.`
      );
      return;
    }

    const key = `${result.description}|${result.category_id}`;
    setAddingResultKey(key);
    const siblings = items.filter(
      (i) => i.category_id === result.category_id && i.parent_item_id === null
    );
    const nextSort = siblings.length > 0 ? Math.max(...siblings.map((i) => i.sort_order)) + 1 : 0;

    try {
      const res = await fetch("/api/admin/bq-template/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tender_id: parseInt(tenderId as string, 10),
          category_id: result.category_id,
          parent_item_id: null,
          description: result.description,
          quantity: null,
          qty: null,
          unit: result.unit,
          rate: result.avg_rate,
          sort_order: nextSort,
        }),
      });

      if (res.ok) {
        toast.success(`Added "${result.description}" to ${result.category_name}.`);
        fetchItems();
      } else {
        const errText = await res.text();
        toast.error("Failed to add item: " + errText);
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setAddingResultKey(null);
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
    const sortOrderById = new Map(updates.map((u) => [u.item_id, u.sort_order]));

    // Optimistic: apply the new order immediately — dnd-kit already shows
    // the row being dragged mid-air, so without this it visibly snaps back
    // to its old position until every PUT + a full refetch complete.
    const previousItems = items;
    setItems((prev) => prev.map((item) => (sortOrderById.has(item.item_id) ? { ...item, sort_order: sortOrderById.get(item.item_id)! } : item)));

    try {
      const results = await Promise.all(
        updates.map(({ item_id, sort_order }) =>
          fetch("/api/admin/bq-template/item", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_id, sort_order }),
          })
        )
      );
      if (results.some((res) => !res.ok)) {
        setItems(previousItems);
        toast.error("Couldn't save the new order. Please try again.");
      }
    } catch (err) {
      setItems(previousItems);
      console.error(err);
      toast.error("Couldn't reach the server. Please check your connection and try again.");
    }
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
          getDisplayFromCode(item.unit, units),
          item.rate ?? "",
        ]);

        const subItems = getChildren(item.item_id, category.category_id);
        subItems.forEach((sub, subIdx) => {
          const subNumber = `${itemNumber}.${(subIdx + 1).toString().padStart(2, "0")}`;
          rows.push([
            subNumber,
            sub.description,
            sub.quantity ?? "",
            getDisplayFromCode(sub.unit, units),
            sub.rate ?? "",
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
                units={units}
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading BQ template editor…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 mb-6">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Edit BQ Template: {tenderName}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Drag ⋮⋮ to reorder. Changes auto‑save.
              </p>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <label className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-[#15406a] hover:bg-[#0d2d4a] text-white cursor-pointer transition-colors">
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
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-[#15406a] hover:bg-[#0d2d4a] text-white transition-colors"
              >
                📥 Export Excel
              </button>
              <button
                onClick={() => {
                  setTempSelectedCategories([...enabledCategoryIds]);
                  setShowCategoryModal(true);
                }}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg border-2 border-[#15406a] bg-white text-[#15406a] hover:bg-[#15406a] hover:text-white transition-colors"
              >
                Manage Categories
              </button>
              <button
                onClick={() => router.push(`/admin/tenders/${tenderId}/bq-template`)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                ← Back to Simple View
              </button>
            </div>
          </div>
        </div>

        {/* Find & Reuse an Existing Item */}
        <div className="bg-white backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 mb-6">
          <label
            htmlFor="item-search"
            className="block text-sm font-semibold text-gray-800 mb-1"
          >
            🔎 Find &amp; Reuse an Existing Item
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Search items already used on other tenders' BQ templates and add them straight into
            this one. Matches are ranked by relevance and how often each item has been reused.
          </p>
          <input
            id="item-search"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchQueryChange(e.target.value)}
            placeholder="e.g. ceramic tile flooring"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
          />
          {searchStatus === "loading" && (
            <p className="text-xs text-gray-500 mt-2">Searching…</p>
          )}
          {searchStatus === "error" && (
            <p className="text-xs text-red-600 mt-2">
              Couldn't search right now.{" "}
              <button onClick={() => runItemSearch(searchQuery)} className="underline hover:no-underline">
                Retry
              </button>
            </p>
          )}
          {searchStatus === "done" && searchResults.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">No matching items found.</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {searchResults.map((r) => {
                const key = `${r.description}|${r.category_id}`;
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-gray-800">{r.description}</p>
                      <p className="text-xs text-gray-500">
                        {r.category_name} · {getDisplayFromCode(r.unit, units)} · used on {r.usage_count} tender
                        {r.usage_count === 1 ? "" : "s"}
                        {r.avg_rate !== null && <> · avg rate {r.avg_rate.toFixed(2)}</>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddFromSearch(r)}
                      disabled={addingResultKey === key}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border-2 border-[#15406a] bg-white text-[#15406a] hover:bg-[#15406a] hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {addingResultKey === key ? "Adding…" : "+ Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pricing Summary — whole-BQ auto scan */}
        <div className="bg-white backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              📈 Pricing Summary
            </h2>
            <button
              onClick={fetchRateSummary}
              disabled={rateSummary.status === "loading"}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              {rateSummary.status === "loading" ? "Refreshing…" : "🔄 Refresh"}
            </button>
          </div>
          {rateSummary.status === "loading" && (
            <p className="text-xs text-gray-500">Scanning item rates…</p>
          )}
          {rateSummary.status === "error" && (
            <p className="text-xs text-red-600">
              Couldn't generate a pricing summary.{" "}
              <button onClick={fetchRateSummary} className="underline hover:no-underline">
                Retry
              </button>
            </p>
          )}
          {rateSummary.status === "done" && rateSummary.data && (
            <>
              <p className="text-sm text-gray-700">{rateSummary.data.summary}</p>
              {rateSummary.data.aiGenerated && (
                <p className="text-[10px] text-gray-400 mt-1">AI-generated summary</p>
              )}
              {(rateSummary.data.flaggedHigh.length > 0 || rateSummary.data.flaggedLow.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {rateSummary.data.flaggedHigh.map((f) => (
                    <Badge key={`high-${f.item_id}`} variant="destructive">
                      {f.description}: +{f.deviationPct.toFixed(0)}%
                    </Badge>
                  ))}
                  {rateSummary.data.flaggedLow.map((f) => (
                    <Badge key={`low-${f.item_id}`} variant="secondary">
                      {f.description}: {f.deviationPct.toFixed(0)}%
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <datalist id="unit-datalist">
          {units.map((unit) => (
            <option key={unit.unit_code} value={unit.unit_name}>
              {unit.unit_name}
            </option>
          ))}
        </datalist>

        {/* Category Modal */}
        <Dialog open={showCategoryModal} onOpenChange={(open) => { if (!open) setShowCategoryModal(false); }}>
          <DialogContent showCloseButton={false} className="max-w-md max-h-[80vh] overflow-auto">
              <DialogTitle className="text-xl font-bold mb-4 text-gray-900">
                Select Categories
              </DialogTitle>
              <div className="space-y-2">
                {allCategories.map((cat) => (
                  <label
                    key={cat.category_id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors"
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
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">{cat.name}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleSaveCategories}
                  className="flex-1 bg-[#15406a] hover:bg-[#0d2d4a] text-white py-2 rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
          </DialogContent>
        </Dialog>

        {/* Categories and items */}
        <div className="space-y-6">
          {visibleCategories.map((category) => {
            const rootItems = getChildren(null, category.category_id);
            return (
              <div
                key={category.category_id}
                className="bg-white backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm overflow-hidden"
              >
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800 text-base sm:text-lg">
                    {category.name}
                  </h3>
                </div>
                <div className="p-2 sm:p-4">
                  {rootItems.length === 0 && (
                    <div className="text-center text-gray-400 py-4 text-sm">
                      No items yet. Click "Add Main Item" below.
                    </div>
                  )}
                  {renderItemTree(null, category.category_id)}

                  {/* Add Main Item form */}
                  {newItemForm && newItemForm.parent_id === null && newItemForm.category_id === category.category_id && (
                    <div className="flex flex-col sm:flex-row gap-3 py-3 mt-2 border-t border-gray-200">
                      <input
                        type="text"
                        placeholder="Description"
                        value={newItemForm.description}
                        onChange={(e) =>
                          setNewItemForm({ ...newItemForm, description: e.target.value })
                        }
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
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
                          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 text-right focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          list="unit-datalist"
                          placeholder="Unit"
                          value={newItemForm.unitDisplay}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, unitDisplay: e.target.value })
                          }
                          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Rate"
                          aria-label="Reference rate"
                          value={newItemForm.rate}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, rate: e.target.value })
                          }
                          className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 text-right focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddItem}
                          className="px-4 py-2 bg-[#15406a] hover:bg-[#0d2d4a] text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setNewItemForm(null)}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sub‑item form */}
                  {newItemForm && newItemForm.parent_id !== null && newItemForm.category_id === category.category_id && (
                    <div className="flex flex-col sm:flex-row gap-3 py-3 mt-2 pl-4 sm:pl-8 border-t border-gray-200">
                      <input
                        type="text"
                        placeholder="Sub‑item description"
                        value={newItemForm.description}
                        onChange={(e) =>
                          setNewItemForm({ ...newItemForm, description: e.target.value })
                        }
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
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
                          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 text-right focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          list="unit-datalist"
                          placeholder="Unit"
                          value={newItemForm.unitDisplay}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, unitDisplay: e.target.value })
                          }
                          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Rate"
                          aria-label="Reference rate"
                          value={newItemForm.rate}
                          onChange={(e) =>
                            setNewItemForm({ ...newItemForm, rate: e.target.value })
                          }
                          className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 text-right focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddItem}
                          className="px-4 py-2 bg-[#15406a] hover:bg-[#0d2d4a] text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setNewItemForm(null)}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
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
                            rate: "",
                          })
                        }
                        className="inline-flex items-center gap-1 text-blue-600 text-sm font-medium hover:underline"
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
          <div className="bg-white rounded-xl p-8 text-center">
            <p className="text-gray-500">
              No categories selected. Click "Manage Categories" to add some.
            </p>
          </div>
        )}

        <div className="mt-8 text-center text-xs sm:text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
          💡 Drag the ⋮⋮ handle to reorder items. Item numbers auto‑update. Fields auto‑save.
        </div>
      </div>
    </div>
  );
}