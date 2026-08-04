import { CapacityConstraints } from '@/types/capex';
import { AlertTriangle } from 'lucide-react';

interface BrandMetricsTableProps {
  constraints: CapacityConstraints;
  desired?: {
    cr?: number;
    tr?: number;
    openTR?: number;
    shampoo?: number;
    blueSpirit?: number;
    maleBed?: number;
    mealPlan?: number;
  };
}

export function BrandMetricsTable({ constraints, desired }: BrandMetricsTableProps) {
  const rows = [
    { label: 'Consultation Rooms', min: constraints.minCR, max: constraints.maxCR, value: desired?.cr },
    { label: 'Treatment Rooms', min: constraints.minTR, max: constraints.maxTR, value: desired?.tr },
    { label: 'Open TR', min: constraints.minOpenTR, max: constraints.maxOpenTR, value: desired?.openTR },
    { label: 'Shampoo Stations', min: constraints.minShampoo, max: constraints.maxShampoo, value: desired?.shampoo },
  ];

  if (constraints.minBlueSpirit !== undefined) {
    rows.push({ label: 'Blue Spirit Beds', min: constraints.minBlueSpirit, max: constraints.maxBlueSpirit!, value: desired?.blueSpirit });
  }
  if (constraints.minMaleBed !== undefined) {
    rows.push({ label: 'Male Beds', min: constraints.minMaleBed, max: constraints.maxMaleBed!, value: desired?.maleBed });
  }
  if (constraints.minMealPlan !== undefined) {
    rows.push({ label: 'Meal Plan Tables', min: constraints.minMealPlan, max: constraints.maxMealPlan!, value: desired?.mealPlan });
  }

  // Add Total Beds row (read-only)
  rows.push({
    label: 'Total Beds / Seats',
    min: constraints.minTotalBeds,
    max: constraints.maxTotalBeds,
    value: undefined, // not user-selectable
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Min</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Max</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Your Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row, idx) => (
            <tr key={idx} className={
              row.value !== undefined && (row.value < row.min || row.value > row.max) ? 'bg-red-50' : ''
            }>
              <td className="px-4 py-2 text-sm">{row.label}</td>
              <td className="px-4 py-2 text-sm">{row.min}</td>
              <td className="px-4 py-2 text-sm">{row.max}</td>
              <td className="px-4 py-2 text-sm flex items-center gap-2">
                {row.value !== undefined && (row.value < row.min || row.value > row.max) && (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                )}
                {row.value !== undefined ? row.value : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}