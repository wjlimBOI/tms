'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Pencil, Save } from 'lucide-react';

interface BudgetBreakdownCardProps {
  baseCost: number;
  breakdown: {
    renovation: number;
    refurbishment1st: number;
    refurbishment2nd: number;
    refurbishment3rd: number;
    rebranding: number;
    reinstatement: number;
  };
  percentages?: {
    refurbishment1st: number;
    refurbishment2nd: number;
    refurbishment3rd: number;
    rebranding: number;
    reinstatement: number;
  };
  onPercentageChange?: (key: string, value: number) => void;
  selectedKey?: string; // which budget type is selected
}

export function BudgetBreakdownCard({
  baseCost,
  breakdown,
  percentages,
  onPercentageChange,
  selectedKey,
}: BudgetBreakdownCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(val);

  const formatPercent = (val: number) => `${(val * 100).toFixed(0)}%`;

  const handleChange = (key: string, rawValue: string) => {
    let value = parseFloat(rawValue);
    if (isNaN(value)) value = 0;
    const decimal = value / 100;
    if (onPercentageChange) onPercentageChange(key, decimal);
  };

  const items = [
    { key: 'renovation', label: 'Renovation', value: breakdown.renovation, percent: 1.0, editable: false },
    { key: 'refurbishment1st', label: 'Refurbishment - 1st Renewal', value: breakdown.refurbishment1st, percent: percentages?.refurbishment1st ?? 0, editable: true },
    { key: 'refurbishment2nd', label: 'Refurbishment - 2nd Renewal', value: breakdown.refurbishment2nd, percent: percentages?.refurbishment2nd ?? 0, editable: true },
    { key: 'refurbishment3rd', label: 'Refurbishment - 3rd Renewal', value: breakdown.refurbishment3rd, percent: percentages?.refurbishment3rd ?? 0, editable: true },
    { key: 'rebranding', label: 'Rebranding (per renewal)', value: breakdown.rebranding, percent: percentages?.rebranding ?? 0, editable: true },
    { key: 'reinstatement', label: 'Reinstatement', value: breakdown.reinstatement, percent: percentages?.reinstatement ?? 0, editable: true },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Budget Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">Base Renovation Cost: {formatCurrency(baseCost)}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
          className="gap-1 border-[#15406a] text-[#15406a] bg-white hover:bg-[#15406a] hover:text-white"
        >
          {isEditing ? (
            <>
              <Save className="h-3.5 w-3.5" /> Save
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" /> Edit %
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => {
          const isSelected = item.key === selectedKey;
          return (
            <div
              key={item.key}
              className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-slate-100 pb-2 last:border-0 ${
                isSelected ? 'bg-[#15406a]/5 -mx-2 px-2 rounded' : ''
              }`}
            >
              <span className="text-sm font-medium text-slate-700">{item.label}</span>
              <div className="flex items-center gap-3">
                {item.editable ? (
                  isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="1"
                        value={(item.percent * 100).toFixed(0)}
                        onChange={(e) => handleChange(item.key, e.target.value)}
                        className="w-20 h-8 text-right text-sm"
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 w-28 text-right">{formatPercent(item.percent)}</span>
                  )
                ) : (
                  <span className="text-xs text-slate-500 w-28 text-right">{formatPercent(item.percent)}</span>
                )}
                <span className="font-mono font-medium text-slate-900 w-28 text-right">
                  {formatCurrency(item.value)}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}