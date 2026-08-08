'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { BrandMetricsTable } from './BrandMetricsTable';
import { BudgetBreakdownCard } from './BudgetBreakdownCard';
import { useCapExCalculator } from '@/hooks/useCapExCalculator';
import { BrandKey, CapacityConstraints } from '@/types/capex';
import { getBrandRules } from '@/lib/capex-engine/brand-rules';
import { Pencil, Save } from 'lucide-react';

const allBrands: BrandKey[] = [
  'Yun Nam', 'London', 'New York', 'Dorra', 'Shakura', 'Jonsson', 'Victoria'
];

const areaTiers = [1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000];

// Budget type options
const BUDGET_TYPES = [
  { key: 'renovation', label: 'Renovation' },
  { key: 'refurbishment1st', label: 'Refurbishment - 1st Renewal' },
  { key: 'refurbishment2nd', label: 'Refurbishment - 2nd Renewal' },
  { key: 'refurbishment3rd', label: 'Refurbishment - 3rd Renewal' },
  { key: 'rebranding', label: 'Rebranding (per renewal)' },
  { key: 'reinstatement', label: 'Reinstatement' },
];

const generateOptions = (min: number, max: number) => {
  const options = [{ value: '', label: '— Not specified —' }];
  for (let i = min; i <= max; i++) {
    options.push({ value: i.toString(), label: i.toString() });
  }
  return options;
};

interface CapExCalculatorProps {
  onApply?: (result: any) => void;
  initialBrand?: BrandKey;
  initialArea?: number;
}

export function CapExCalculator({
  onApply,
  initialBrand = 'Yun Nam',
  initialArea = 1200,
}: CapExCalculatorProps) {
  const {
    input,
    result,
    setBrand,
    setArea,
    setDesiredCR,
    setDesiredTR,
    setDesiredOpenTR,
    setDesiredShampoo,
    setDesiredBlueSpirit,
    setDesiredMaleBed,
    setDesiredMealPlan,
  } = useCapExCalculator({ brand: initialBrand, areaSqft: initialArea });

  const constraints = result?.capacityValidation.suggestedConstraints;
  const desired = {
    cr: input.desiredCR,
    tr: input.desiredTR,
    openTR: input.desiredOpenTR,
    shampoo: input.desiredShampoo,
    blueSpirit: input.desiredBlueSpirit,
    maleBed: input.desiredMaleBed,
    mealPlan: input.desiredMealPlan,
  };

  const brandRules = getBrandRules(input.brand);

  const [isEditingConstraints, setIsEditingConstraints] = useState(false);
  const [editableConstraints, setEditableConstraints] = useState<CapacityConstraints | null>(null);
  // A manually-saved override of the brand-rules-suggested constraints —
  // real business need: capacity ranges occasionally need a one-off manual
  // adjustment (negotiated exception, edge-case site) rather than always
  // following the suggested rule. Cleared whenever brand/area changes the
  // underlying suggestion basis, since a stale override from a different
  // brand/area wouldn't make sense to silently carry forward.
  const [savedConstraints, setSavedConstraints] = useState<CapacityConstraints | null>(null);
  const effectiveConstraints = savedConstraints ?? constraints;

  useEffect(() => {
    if (constraints) {
      setEditableConstraints({ ...constraints });
    } else {
      setEditableConstraints(null);
    }
    setSavedConstraints(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constraints]);

  const [customPercentages, setCustomPercentages] = useState({
    refurbishment1st: brandRules.budgetAllocation.refurbishment1st,
    refurbishment2nd: brandRules.budgetAllocation.refurbishment2nd,
    refurbishment3rd: brandRules.budgetAllocation.refurbishment3rd,
    rebranding: brandRules.budgetAllocation.rebranding,
    reinstatement: brandRules.budgetAllocation.reinstatement,
  });

  useEffect(() => {
    setCustomPercentages({
      refurbishment1st: brandRules.budgetAllocation.refurbishment1st,
      refurbishment2nd: brandRules.budgetAllocation.refurbishment2nd,
      refurbishment3rd: brandRules.budgetAllocation.refurbishment3rd,
      rebranding: brandRules.budgetAllocation.rebranding,
      reinstatement: brandRules.budgetAllocation.reinstatement,
    });
  }, [brandRules]);

  // State for selected budget type
  const [selectedBudgetType, setSelectedBudgetType] = useState<string>('renovation');

  const handlePercentageChange = (key: string, decimalValue: number) => {
    setCustomPercentages(prev => ({ ...prev, [key]: decimalValue }));
  };

  const handleConstraintChange = (field: keyof CapacityConstraints, value: string) => {
    if (!editableConstraints) return;
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;
    setEditableConstraints((prev) => ({
      ...prev!,
      [field]: numVal,
    }));
  };

  const saveConstraints = () => {
    if (editableConstraints) setSavedConstraints(editableConstraints);
    setIsEditingConstraints(false);
  };

  const resetConstraints = () => {
    setSavedConstraints(null);
    if (constraints) setEditableConstraints({ ...constraints });
  };

  const handleSelectChange = (setter: (value: number | undefined) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setter(val ? parseInt(val) : undefined);
  };

  const showOpenTR = constraints ? constraints.maxOpenTR > 0 : false;
  const showShampoo = constraints ? constraints.maxShampoo > 0 : false;
  const showBlueSpirit = brandRules.hasBlueSpirit;
  const showMaleBed = brandRules.hasMaleBed;
  const showMealPlan = brandRules.hasMealPlan;
  const showTotalBeds = constraints ? true : false;

  const baseCost = result?.renovationBaseCost || 0;
  const customBreakdown = {
    renovation: baseCost,
    refurbishment1st: baseCost * customPercentages.refurbishment1st,
    refurbishment2nd: baseCost * customPercentages.refurbishment2nd,
    refurbishment3rd: baseCost * customPercentages.refurbishment3rd,
    rebranding: baseCost * customPercentages.rebranding,
    reinstatement: baseCost * customPercentages.reinstatement,
  };

  // Get selected amount
  const selectedAmount = customBreakdown[selectedBudgetType as keyof typeof customBreakdown] || 0;

  const handleApply = () => {
    if (onApply) {
      onApply({
        baseRenovationCost: baseCost,
        finalCost: selectedAmount,
        selectedBudgetType,
        breakdown: customBreakdown,
        // Reflects any manually-saved constraint override, not just the raw
        // brand-rules suggestion — see saveConstraints/effectiveConstraints.
        validation: result?.capacityValidation
          ? { ...result.capacityValidation, suggestedConstraints: effectiveConstraints }
          : result?.capacityValidation,
        customPercentages,
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-md">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg font-semibold text-slate-900">Budget Calculator</CardTitle>
          <div className="flex items-center gap-3">
            {!isEditingConstraints && savedConstraints && (
              <button
                type="button"
                onClick={resetConstraints}
                className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
              >
                Reset to suggested values
              </button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isEditingConstraints) {
                  saveConstraints();
                } else {
                  if (effectiveConstraints) setEditableConstraints({ ...effectiveConstraints });
                  setIsEditingConstraints(true);
                }
              }}
              className="gap-1 text-slate-600 border-slate-300"
            >
              {isEditingConstraints ? (
                <>
                  <Save className="h-3.5 w-3.5" /> Save Constraints
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" /> Edit Constraints
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Brand */}
          <div>
            <Label className="text-slate-700">Brand</Label>
            <select
              value={input.brand}
              onChange={(e) => setBrand(e.target.value as BrandKey)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {allBrands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Area */}
          <div>
            <Label className="text-slate-700">Area (sqft)</Label>
            <div className="flex gap-2">
              <select
                value=""
                onChange={(e) => e.target.value && setArea(parseInt(e.target.value))}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Quick select tier</option>
                {areaTiers.map((tier) => (
                  <option key={tier} value={tier}>{tier} sqft</option>
                ))}
              </select>
              <Input
                type="number"
                value={input.areaSqft}
                onChange={(e) => setArea(Number(e.target.value))}
                min={500}
                max={5000}
                className="flex-1"
              />
            </div>
          </div>

          {/* CR */}
          <div>
            <Label className="text-slate-700">Consultation Rooms (CR)</Label>
            {isEditingConstraints && editableConstraints ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editableConstraints.minCR}
                  onChange={(e) => handleConstraintChange('minCR', e.target.value)}
                  className="w-16 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="number"
                  value={editableConstraints.maxCR}
                  onChange={(e) => handleConstraintChange('maxCR', e.target.value)}
                  className="w-16 h-8 text-sm"
                />
              </div>
            ) : effectiveConstraints ? (
              <select
                value={input.desiredCR ?? ''}
                onChange={handleSelectChange(setDesiredCR)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {generateOptions(effectiveConstraints.minCR, effectiveConstraints.maxCR).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <Input
                type="number"
                value={input.desiredCR ?? ''}
                onChange={(e) => setDesiredCR(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Enter manually"
              />
            )}
          </div>

          {/* TR */}
          <div>
            <Label className="text-slate-700">Treatment Rooms (TR)</Label>
            {isEditingConstraints && editableConstraints ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editableConstraints.minTR}
                  onChange={(e) => handleConstraintChange('minTR', e.target.value)}
                  className="w-16 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="number"
                  value={editableConstraints.maxTR}
                  onChange={(e) => handleConstraintChange('maxTR', e.target.value)}
                  className="w-16 h-8 text-sm"
                />
              </div>
            ) : effectiveConstraints ? (
              <select
                value={input.desiredTR ?? ''}
                onChange={handleSelectChange(setDesiredTR)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {generateOptions(effectiveConstraints.minTR, effectiveConstraints.maxTR).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <Input
                type="number"
                value={input.desiredTR ?? ''}
                onChange={(e) => setDesiredTR(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Enter manually"
              />
            )}
          </div>

          {/* Open TR */}
          {showOpenTR && (
            <div>
              <Label className="text-slate-700">Open Treatment Rooms</Label>
              {isEditingConstraints && editableConstraints ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={editableConstraints.minOpenTR}
                    onChange={(e) => handleConstraintChange('minOpenTR', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={editableConstraints.maxOpenTR}
                    onChange={(e) => handleConstraintChange('maxOpenTR', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                </div>
              ) : effectiveConstraints ? (
                <select
                  value={input.desiredOpenTR ?? ''}
                  onChange={handleSelectChange(setDesiredOpenTR)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {generateOptions(effectiveConstraints.minOpenTR, effectiveConstraints.maxOpenTR).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type="number"
                  value={input.desiredOpenTR ?? ''}
                  onChange={(e) => setDesiredOpenTR(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Enter manually"
                />
              )}
            </div>
          )}

          {/* Shampoo */}
          {showShampoo && (
            <div>
              <Label className="text-slate-700">Shampoo Stations</Label>
              {isEditingConstraints && editableConstraints ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={editableConstraints.minShampoo}
                    onChange={(e) => handleConstraintChange('minShampoo', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={editableConstraints.maxShampoo}
                    onChange={(e) => handleConstraintChange('maxShampoo', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                </div>
              ) : effectiveConstraints ? (
                <select
                  value={input.desiredShampoo ?? ''}
                  onChange={handleSelectChange(setDesiredShampoo)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {generateOptions(effectiveConstraints.minShampoo, effectiveConstraints.maxShampoo).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type="number"
                  value={input.desiredShampoo ?? ''}
                  onChange={(e) => setDesiredShampoo(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Enter manually"
                />
              )}
            </div>
          )}

          {/* Brand-specific fields */}
          {showBlueSpirit && (
            <div>
              <Label className="text-slate-700">Blue Spirit Beds</Label>
              {isEditingConstraints && editableConstraints ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={editableConstraints.minBlueSpirit ?? 0}
                    onChange={(e) => handleConstraintChange('minBlueSpirit', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={editableConstraints.maxBlueSpirit ?? 0}
                    onChange={(e) => handleConstraintChange('maxBlueSpirit', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                </div>
              ) : effectiveConstraints && effectiveConstraints.minBlueSpirit !== undefined ? (
                <select
                  value={input.desiredBlueSpirit ?? ''}
                  onChange={handleSelectChange(setDesiredBlueSpirit)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {generateOptions(effectiveConstraints.minBlueSpirit, effectiveConstraints.maxBlueSpirit!).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type="number"
                  value={input.desiredBlueSpirit ?? ''}
                  onChange={(e) => setDesiredBlueSpirit(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Enter manually"
                />
              )}
            </div>
          )}

          {showMaleBed && (
            <div>
              <Label className="text-slate-700">Male Beds</Label>
              {isEditingConstraints && editableConstraints ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={editableConstraints.minMaleBed ?? 0}
                    onChange={(e) => handleConstraintChange('minMaleBed', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={editableConstraints.maxMaleBed ?? 0}
                    onChange={(e) => handleConstraintChange('maxMaleBed', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                </div>
              ) : effectiveConstraints && effectiveConstraints.minMaleBed !== undefined ? (
                <select
                  value={input.desiredMaleBed ?? ''}
                  onChange={handleSelectChange(setDesiredMaleBed)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {generateOptions(effectiveConstraints.minMaleBed, effectiveConstraints.maxMaleBed!).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type="number"
                  value={input.desiredMaleBed ?? ''}
                  onChange={(e) => setDesiredMaleBed(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Enter manually"
                />
              )}
            </div>
          )}

          {showMealPlan && (
            <div>
              <Label className="text-slate-700">Meal Plan Tables</Label>
              {isEditingConstraints && editableConstraints ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={editableConstraints.minMealPlan ?? 0}
                    onChange={(e) => handleConstraintChange('minMealPlan', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={editableConstraints.maxMealPlan ?? 0}
                    onChange={(e) => handleConstraintChange('maxMealPlan', e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                </div>
              ) : effectiveConstraints && effectiveConstraints.minMealPlan !== undefined ? (
                <select
                  value={input.desiredMealPlan ?? ''}
                  onChange={handleSelectChange(setDesiredMealPlan)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {generateOptions(effectiveConstraints.minMealPlan, effectiveConstraints.maxMealPlan!).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type="number"
                  value={input.desiredMealPlan ?? ''}
                  onChange={(e) => setDesiredMealPlan(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Enter manually"
                />
              )}
            </div>
          )}

          {/* Total Beds */}
          {showTotalBeds && (
            <div className="sm:col-span-2">
              <Label className="text-slate-700">Total Beds / Seats</Label>
              <div className="text-sm font-medium text-slate-700">
                {effectiveConstraints?.minTotalBeds} – {effectiveConstraints?.maxTotalBeds}
                {isEditingConstraints && (
                  <span className="ml-2 text-xs text-muted-foreground">(editable in backend rules)</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capacity Validation */}
      {result && (
        <>
          <Card className="border-slate-200 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">Capacity Validation</CardTitle>
            </CardHeader>
            <CardContent>
              {effectiveConstraints ? (
                <BrandMetricsTable
                  constraints={isEditingConstraints && editableConstraints ? editableConstraints : effectiveConstraints}
                  desired={desired}
                />
              ) : (
                <p className="text-muted-foreground">No capacity rules defined for this area range.</p>
              )}
              {result.capacityValidation.errors.length > 0 && (
                <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  <strong>Errors:</strong>
                  <ul className="list-disc pl-5">
                    {result.capacityValidation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Budget Breakdown with Type Selector */}
          <div className="space-y-4">
            {/* Dropdown to choose budget type */}
            <div className="flex items-center gap-3">
              <Label className="text-slate-700 font-medium whitespace-nowrap">Apply Budget Type:</Label>
              <select
                value={selectedBudgetType}
                onChange={(e) => setSelectedBudgetType(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {BUDGET_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>{type.label}</option>
                ))}
              </select>
              <span className="text-sm font-mono font-semibold text-slate-900">
                ${selectedAmount.toLocaleString()}
              </span>
            </div>

            <BudgetBreakdownCard
              baseCost={baseCost}
              breakdown={customBreakdown}
              percentages={customPercentages}
              onPercentageChange={handlePercentageChange}
              selectedKey={selectedBudgetType}
            />
          </div>

          {onApply && (
            <div className="flex justify-end pt-4 border-t border-slate-200">
              <Button
                onClick={handleApply}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                Apply to Tender
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}