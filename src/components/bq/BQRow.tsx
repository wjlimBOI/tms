// components/bq/BQRow.tsx
import { memo, useState, useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { LineItem } from "@/types/bq";

interface BQRowProps {
  item: LineItem;
  onUpdate: (item: LineItem, updatedFields: Partial<LineItem>) => void;
  onDelete: (id: number) => void;
  onAddSubItem?: (parentId: number, categoryId: number) => void;
  units: { unit_id: number; unit_code: string; unit_name: string }[];
  readOnly?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  debounceDelay?: number;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value).replace("$", "$ ");
};

export const BQRow = memo(function BQRow({
  item: initialItem,
  onUpdate,
  onDelete,
  onAddSubItem,
  units,
  readOnly = false,
  selected = false,
  onToggleSelect,
  debounceDelay = 500,
}: BQRowProps) {
  const [localItem, setLocalItem] = useState(initialItem);
  const [pendingUpdate, setPendingUpdate] = useState<Partial<LineItem> | null>(null);
  const debouncedValue = useDebounce(pendingUpdate, debounceDelay);

  // Ref for the description textarea to auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track the item ID to reset local state only when a completely different item is loaded
  const prevIdRef = useRef(initialItem.line_item_id);

  // Reset only when the item ID changes (new row)
  if (prevIdRef.current !== initialItem.line_item_id) {
    prevIdRef.current = initialItem.line_item_id;
    setLocalItem(initialItem);
    setPendingUpdate(null);
  }

  // Auto-resize the textarea whenever the description changes (initial load + user edits)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [localItem.description]);

  // Debounced save to parent
  useEffect(() => {
    if (debouncedValue && Object.keys(debouncedValue).length > 0) {
      onUpdate(localItem, debouncedValue);
      setPendingUpdate(null);
    }
  }, [debouncedValue, localItem, onUpdate]);

  const handleChange = (field: keyof LineItem, value: any) => {
    if (readOnly) return;
    setLocalItem((prev) => ({ ...prev, [field]: value }));
    setPendingUpdate((prev) => ({ ...prev, [field]: value }));
  };

  // Also resize on input (handles typing faster than useEffect)
  const handleDescriptionInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = target.scrollHeight + "px";
  };

  const depth = localItem.depth || 0;
  const indentStyle = { marginLeft: `${depth * 1.5}rem` };

  return (
    <tr className="hover:bg-gray-50">
      {!readOnly && onToggleSelect && (
        <td className="border border-gray-200 p-2 text-center w-8">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(localItem.line_item_id)}
            className="rounded border-gray-300"
          />
        </td>
      )}
      <td className="border border-gray-200 p-2 text-center font-mono text-gray-800">
        {localItem.item_no}
      </td>
      <td className="border border-gray-200 p-2">
        <input
          type="text"
          value={localItem.location || ""}
          onChange={(e) => handleChange("location", e.target.value)}
          className="w-full min-w-[100px] bg-transparent text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          style={indentStyle}
          disabled={readOnly}
        />
      </td>
      <td className="border border-gray-200 p-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={localItem.description || ""}
          onChange={(e) => handleChange("description", e.target.value)}
          onInput={handleDescriptionInput}
          className="w-full min-w-[300px] bg-transparent text-gray-800 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          style={{ minHeight: "2.5rem" }}
          disabled={readOnly}
        />
      </td>
      <td className="border border-gray-200 p-2">
        <input
          type="text"
          value={localItem.specifications || ""}
          onChange={(e) => handleChange("specifications", e.target.value)}
          className="w-full min-w-[150px] bg-transparent text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          disabled={readOnly}
        />
      </td>
      <td className="border border-gray-200 p-2">
        <input
          type="text"
          value={localItem.brand || ""}
          onChange={(e) => handleChange("brand", e.target.value)}
          className="w-full min-w-[80px] bg-transparent text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          disabled={readOnly}
        />
      </td>
      <td className="border border-gray-200 p-2">
        <input
          type="number"
          step="any"
          value={localItem.quantity}
          onChange={(e) => handleChange("quantity", parseFloat(e.target.value) || 0)}
          className="w-20 text-right bg-transparent text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          disabled={readOnly}
        />
      </td>
      <td className="border border-gray-200 p-2">
        <select
          value={localItem.unit}
          onChange={(e) => handleChange("unit", e.target.value)}
          className="w-24 bg-transparent border border-gray-300 rounded px-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={readOnly}
        >
          {units.map((unit) => (
            <option key={unit.unit_id} value={unit.unit_code}>
              {unit.unit_name}
            </option>
          ))}
        </select>
      </td>
      <td className="border border-gray-200 p-2">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 select-none">$</span>
          <input
            type="number"
            step="any"
            value={localItem.unit_price}
            onChange={(e) => handleChange("unit_price", parseFloat(e.target.value) || 0)}
            className="w-24 text-right bg-transparent text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
            disabled={readOnly}
          />
        </div>
      </td>
      <td className="border border-gray-200 p-2">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 select-none">$</span>
          <input
            type="number"
            step="any"
            value={localItem.discount}
            onChange={(e) => handleChange("discount", parseFloat(e.target.value) || 0)}
            className="w-20 text-right bg-transparent text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
            disabled={readOnly}
          />
        </div>
       </td>
      <td className="border border-gray-200 p-2 text-right font-mono whitespace-nowrap text-gray-800">
        {formatCurrency(localItem.amount)}
       </td>
      <td className="border border-gray-200 p-2 text-center whitespace-nowrap">
        {!readOnly && (
          <>
            {onAddSubItem && (
              <button
                onClick={() =>
                  onAddSubItem(localItem.line_item_id, localItem.category_id)
                }
                className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 mr-1 transition-colors"
                title="Add sub‑item"
              >
                + Sub
              </button>
            )}
            <button
              onClick={() => onDelete(localItem.line_item_id)}
              className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 transition-colors"
              title="Delete item"
            >
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  );
});