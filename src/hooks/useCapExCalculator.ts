import { useState, useMemo, useCallback } from 'react';
import { CapExInput, CapExResult, BrandKey } from '@/types/capex';
import { calculateCapExMetrics } from '@/lib/capex-engine/calculator';

export interface UseCapExCalculatorReturn {
  input: CapExInput;
  result: CapExResult | null;
  updateField: <K extends keyof CapExInput>(field: K, value: CapExInput[K]) => void;
  reset: () => void;
  setBrand: (brand: BrandKey) => void;
  setArea: (area: number) => void;
  setDesiredCR: (value: number | undefined) => void;
  setDesiredTR: (value: number | undefined) => void;
  setDesiredOpenTR: (value: number | undefined) => void;
  setDesiredShampoo: (value: number | undefined) => void;
  setDesiredBlueSpirit: (value: number | undefined) => void;
  setDesiredMaleBed: (value: number | undefined) => void;
  setDesiredMealPlan: (value: number | undefined) => void;
}

const defaultInput: CapExInput = {
  brand: 'Yun Nam',
  areaSqft: 1200,
  desiredCR: undefined,
  desiredTR: undefined,
  desiredOpenTR: undefined,
  desiredShampoo: undefined,
  desiredBlueSpirit: undefined,
  desiredMaleBed: undefined,
  desiredMealPlan: undefined,
};

export function useCapExCalculator(initialInput?: Partial<CapExInput>): UseCapExCalculatorReturn {
  const [input, setInput] = useState<CapExInput>({ ...defaultInput, ...initialInput });

  const result = useMemo(() => {
    try {
      return calculateCapExMetrics(input);
    } catch (err) {
      console.error('Calculation error:', err);
      return null;
    }
  }, [input]);

  const updateField = useCallback(<K extends keyof CapExInput>(field: K, value: CapExInput[K]) => {
    setInput((prev) => ({ ...prev, [field]: value }));
  }, []);

  const reset = useCallback(() => setInput({ ...defaultInput, ...initialInput }), [initialInput]);

  const setBrand = useCallback((brand: BrandKey) => updateField('brand', brand), [updateField]);
  const setArea = useCallback((area: number) => updateField('areaSqft', area), [updateField]);
  const setDesiredCR = useCallback((value: number | undefined) => updateField('desiredCR', value), [updateField]);
  const setDesiredTR = useCallback((value: number | undefined) => updateField('desiredTR', value), [updateField]);
  const setDesiredOpenTR = useCallback((value: number | undefined) => updateField('desiredOpenTR', value), [updateField]);
  const setDesiredShampoo = useCallback((value: number | undefined) => updateField('desiredShampoo', value), [updateField]);
  const setDesiredBlueSpirit = useCallback((value: number | undefined) => updateField('desiredBlueSpirit', value), [updateField]);
  const setDesiredMaleBed = useCallback((value: number | undefined) => updateField('desiredMaleBed', value), [updateField]);
  const setDesiredMealPlan = useCallback((value: number | undefined) => updateField('desiredMealPlan', value), [updateField]);

  return {
    input,
    result,
    updateField,
    reset,
    setBrand,
    setArea,
    setDesiredCR,
    setDesiredTR,
    setDesiredOpenTR,
    setDesiredShampoo,
    setDesiredBlueSpirit,
    setDesiredMaleBed,
    setDesiredMealPlan,
  };
}