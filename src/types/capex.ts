export type BrandKey =
  | 'Yun Nam'
  | 'London'
  | 'New York'
  | 'Dorra'
  | 'Shakura'
  | 'Jonsson'
  | 'Victoria';

export interface BrandRules {
  brand: BrandKey;
  baseRenovationCostPerSqft: number;
  nextTierCostPerSqft: number;
  tierThresholds: number[];
  budgetAllocation: BudgetAllocation;
  hasBlueSpirit: boolean;
  hasMaleBed: boolean;
  hasMealPlan: boolean;
  minSqftPerTreatmentRoom?: number;
  capacityRules: Record<string, CapacityConstraints>;
}

export interface BudgetAllocation {
  renovation: number;
  refurbishment1st: number;
  refurbishment2nd: number;
  refurbishment3rd: number;
  rebranding: number;
  reinstatement: number;
}

export interface CapacityConstraints {
  // Laike removed
  minCR: number;
  maxCR: number;
  minTR: number;
  maxTR: number;
  minOpenTR: number;
  maxOpenTR: number;
  minShampoo: number;
  maxShampoo: number;
  minBlueSpirit?: number;
  maxBlueSpirit?: number;
  minMaleBed?: number;
  maxMaleBed?: number;
  minMealPlan?: number;
  maxMealPlan?: number;
  minTotalBeds: number;
  maxTotalBeds: number;
}

export interface CapExInput {
  brand: BrandKey;
  areaSqft: number;
  desiredTR?: number;
  desiredCR?: number;
  desiredShampoo?: number;
  // desiredLaike removed
  desiredOpenTR?: number;
  desiredBlueSpirit?: number;
  desiredMaleBed?: number;
  desiredMealPlan?: number;
}

export interface CapExResult {
  renovationBaseCost: number;
  finalCost: number;
  areaBreakdown: {
    firstTier: number;
    nextTier: number;
    firstTierCost: number;
    nextTierCost: number;
  };
  capacityValidation: CapacityValidation;
  budgetBreakdown: {
    renovation: number;
    refurbishment1st: number;
    refurbishment2nd: number;
    refurbishment3rd: number;
    rebranding: number;
    reinstatement: number;
  };
}

export interface CapacityValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestedConstraints?: CapacityConstraints;
}