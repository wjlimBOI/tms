import {
  CapExInput,
  CapExResult,
  CapacityValidation,
  CapacityConstraints,
  BrandRules,
  BrandKey,
} from '@/types/capex';
import { getBrandRules } from './brand-rules';

function getAreaRangeKey(brand: BrandKey, area: number): string {
  switch (brand) {
    // Haircare: Yun Nam, Jonsson
    case 'Yun Nam':
    case 'Jonsson':
      if (area < 1300) return 'Below 1300';
      if (area <= 1500) return '1301 - 1500';
      if (area <= 1700) return '1501 - 1700';
      if (area <= 1900) return '1701 - 1900';
      if (area <= 2100) return '1901 - 2100';
      if (area <= 2300) return '2101 - 2300';
      return '2301 above';

    // Slimming: London, Dorra
    case 'London':
    case 'Dorra':
      if (area <= 1400) return 'Min 1400';
      if (area <= 1600) return '1401 - 1600';
      if (area <= 1800) return '1601 - 1800';
      if (area <= 2000) return '1801 - 2000';
      if (area <= 2200) return '2001 - 2200';
      if (area <= 2400) return '2201 - 2400';
      return '2400 above';

    // Facial: New York, Shakura, Victoria
    case 'New York':
    case 'Shakura':
    case 'Victoria':
      if (area <= 1400) return '1201 - 1400';
      if (area <= 1600) return '1401 - 1600';
      if (area <= 1800) return '1601 - 1800';
      if (area <= 2000) return '1801 - 2000';
      if (area <= 2200) return '2001 - 2200';
      return '2201 above';

    default:
      return 'Below 1300';
  }
}

function getFirstTier(area: number, thresholds: number[]): number {
  if (area < thresholds[0]) return thresholds[0];
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (area >= thresholds[i]) return thresholds[i];
  }
  return thresholds[0];
}

function validateCapacities(
  input: CapExInput,
  constraints: CapacityConstraints
): CapacityValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const check = (label: string, value: number | undefined, min: number, max: number) => {
    if (value === undefined) return;
    if (value < min) errors.push(`${label} ${value} is below minimum ${min}`);
    if (value > max) errors.push(`${label} ${value} exceeds maximum ${max}`);
  };

  check('CR', input.desiredCR, constraints.minCR, constraints.maxCR);
  check('TR', input.desiredTR, constraints.minTR, constraints.maxTR);
  check('Open TR', input.desiredOpenTR, constraints.minOpenTR, constraints.maxOpenTR);
  check('Shampoo', input.desiredShampoo, constraints.minShampoo, constraints.maxShampoo);

  if (constraints.minBlueSpirit !== undefined && constraints.maxBlueSpirit !== undefined) {
    check('Blue Spirit', input.desiredBlueSpirit, constraints.minBlueSpirit, constraints.maxBlueSpirit);
  }
  if (constraints.minMaleBed !== undefined && constraints.maxMaleBed !== undefined) {
    check('Male Bed', input.desiredMaleBed, constraints.minMaleBed, constraints.maxMaleBed);
  }
  if (constraints.minMealPlan !== undefined && constraints.maxMealPlan !== undefined) {
    check('Meal Plan', input.desiredMealPlan, constraints.minMealPlan, constraints.maxMealPlan);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestedConstraints: constraints,
  };
}

export function calculateCapExMetrics(input: CapExInput): CapExResult {
  const rules: BrandRules = getBrandRules(input.brand);
  const { areaSqft } = input;
  const thresholds = rules.tierThresholds;
  const multiplier = 1.2; // Excel applies a 20% uplift to all costs

  const firstTierArea = getFirstTier(areaSqft, thresholds);
  const nextTierArea = Math.max(0, areaSqft - firstTierArea);
  const firstTierCost = firstTierArea * rules.baseRenovationCostPerSqft * multiplier;
  const nextTierCost = nextTierArea * rules.nextTierCostPerSqft * multiplier;
  const renovationBaseCost = firstTierCost + nextTierCost;

  const areaRangeKey = getAreaRangeKey(input.brand, areaSqft);
  const capacityConstraints = rules.capacityRules[areaRangeKey];
  const capacityValidation = capacityConstraints
    ? validateCapacities(input, capacityConstraints)
    : { isValid: true, errors: [], warnings: [], suggestedConstraints: undefined };

  const alloc = rules.budgetAllocation;
  const budgetBreakdown = {
    renovation: renovationBaseCost * alloc.renovation,
    refurbishment1st: renovationBaseCost * alloc.refurbishment1st,
    refurbishment2nd: renovationBaseCost * alloc.refurbishment2nd,
    refurbishment3rd: renovationBaseCost * alloc.refurbishment3rd,
    rebranding: renovationBaseCost * alloc.rebranding,
    reinstatement: renovationBaseCost * alloc.reinstatement,
  };

  return {
    renovationBaseCost,
    finalCost: renovationBaseCost,
    areaBreakdown: {
      firstTier: firstTierArea,
      nextTier: nextTierArea,
      firstTierCost,
      nextTierCost,
    },
    capacityValidation,
    budgetBreakdown,
  };
}