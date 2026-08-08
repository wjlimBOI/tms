'use client';

import { CapExCalculator } from '@/components/capex/CapExCalculator';

export default function BudgetPlannerPage() {
  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <CapExCalculator />
      </div>
    </div>
  );
}