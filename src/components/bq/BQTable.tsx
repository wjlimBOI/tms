import { useMemo } from "react";
import { Category, LineItem } from "@/types/bq";
import { BQRow } from "./BQRow";

interface BQTableProps {
  category: Category;
  onUpdate: (item: LineItem, updatedFields: Partial<LineItem>) => void;
  onDelete: (id: number) => void;
  onAddItem?: (categoryId: number) => void;
  onAddSubItem?: (parentId: number, categoryId: number) => void;
  calculateCategoryTotal: (items: LineItem[]) => number;
  units: { unit_id: number; unit_code: string; unit_name: string }[];
  readOnly?: boolean;
  selectedItems?: number[];
  onToggleSelect?: (id: number) => void;
  onSelectAll?: (ids: number[], selected: boolean) => void;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value).replace("$", "$ ");
};

export function BQTable({
  category,
  onUpdate,
  onDelete,
  onAddItem,
  onAddSubItem,
  calculateCategoryTotal,
  units,
  readOnly = false,
  selectedItems = [],
  onToggleSelect,
  onSelectAll,
}: BQTableProps) {
  const categoryTotal = useMemo(() => calculateCategoryTotal(category.items), [category.items, calculateCategoryTotal]);
  const allSelected = category.items.length > 0 && category.items.every(item => selectedItems.includes(item.line_item_id));

  const toggleSelectAll = () => {
    if (!onSelectAll) return;
    const ids = category.items.map(item => item.line_item_id);
    onSelectAll(ids, !allSelected);
  };

  return (
    <div className="border border-gray-200 dark:border-cyan-500/30 rounded-lg overflow-hidden shadow-sm dark:shadow-gray-800/30">
      <div className="bg-gray-800 dark:bg-gray-800 text-white dark:text-white px-4 py-2 font-semibold text-lg">
        {category.category_name}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-100 dark:bg-gray-800/50">
            <tr>
              {!readOnly && (onToggleSelect || onSelectAll) && (
                <th className="border border-gray-200 dark:border-gray-700 p-2 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
              )}
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Item No.</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Location</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Description</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Specifications</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Brand</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Qty</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Unit</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Unit Rate ($)</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Discount ($)</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">Amount ($)</th>
              <th className="border border-gray-200 dark:border-gray-700 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {category.items.map(item => (
              <BQRow
                key={item.line_item_id}
                item={item}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddSubItem={onAddSubItem}
                units={units}
                readOnly={readOnly}
                selected={selectedItems.includes(item.line_item_id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 dark:bg-gray-800/30">
              <td
                colSpan={!readOnly && (onToggleSelect || onSelectAll) ? 10 : 9}
                className="border border-gray-200 dark:border-gray-700 p-2 text-right font-bold text-gray-700 dark:text-gray-300"
              >
                Category Subtotal:
              </td>
              <td className="border border-gray-200 dark:border-gray-700 p-2 text-right font-mono font-bold whitespace-nowrap text-gray-900 dark:text-white">
                {formatCurrency(categoryTotal)}
              </td>
              <td className="border border-gray-200 dark:border-gray-700 p-2"></td>
            </tr>
            <tr>
              <td
                colSpan={!readOnly && (onToggleSelect || onSelectAll) ? 12 : 11}
                className="border border-gray-200 dark:border-gray-700 p-2 text-center"
              >
                {!readOnly && onAddItem && (
                  <button
                    onClick={() => onAddItem(category.category_id)}
                    className="bg-blue-500 dark:bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
                  >
                    + Add line item
                  </button>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}