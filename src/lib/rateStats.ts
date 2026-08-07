// Shared by src/app/api/admin/bq-template/market-rate/route.ts (per-item
// compare) and src/app/api/admin/bq-template/rate-summary/route.ts
// (whole-BQ auto scan) - both compare a rate against the same two internal
// signals (reference rates set elsewhere, real contractor bid rates).

export interface RateStats {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export function computeStats(values: number[]): RateStats {
  if (values.length === 0) return { count: 0, avg: null, min: null, max: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
