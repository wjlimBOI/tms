// Pure logic behind the whole-BQ auto pricing scan
// (src/app/api/admin/bq-template/rate-summary/route.ts) - deciding which
// items are priced significantly above/below their comparison average, and
// composing the local (non-AI) fallback summary sentence used when
// ANTHROPIC_API_KEY isn't configured or the API call fails.

export const DEVIATION_THRESHOLD_PCT = 20;

export interface FlaggedItem {
  item_id: number;
  description: string;
  rate: number;
  comparisonAvg: number;
  deviationPct: number;
}

// Returns the deviation if the rate differs from comparisonAvg by more than
// thresholdPct, otherwise null (not flagged — either within range, or no
// comparison data exists at all).
export function classifyDeviation(
  rate: number,
  comparisonAvg: number | null,
  thresholdPct: number = DEVIATION_THRESHOLD_PCT
): number | null {
  if (comparisonAvg === null || comparisonAvg <= 0) return null;
  const deviationPct = ((rate - comparisonAvg) / comparisonAvg) * 100;
  if (Math.abs(deviationPct) <= thresholdPct) return null;
  return deviationPct;
}

export function buildLocalSummary(
  flaggedHigh: FlaggedItem[],
  flaggedLow: FlaggedItem[],
  withinRange: number,
  noHistory: number,
  totalPriced: number
): string {
  if (totalPriced === 0) {
    return "No priced items yet — add rates to see a pricing summary.";
  }

  const parts: string[] = [
    `Of ${totalPriced} priced item${totalPriced === 1 ? "" : "s"}, ${withinRange} ${withinRange === 1 ? "is" : "are"} within the typical range.`,
  ];

  if (flaggedHigh.length > 0) {
    const worst = flaggedHigh.reduce((a, b) => (b.deviationPct > a.deviationPct ? b : a));
    parts.push(
      `${flaggedHigh.length} item${flaggedHigh.length === 1 ? "" : "s"} ${flaggedHigh.length === 1 ? "is" : "are"} priced significantly above the historical average, the largest being "${worst.description}" at ${worst.deviationPct.toFixed(0)}% above.`
    );
  }

  if (flaggedLow.length > 0) {
    const worst = flaggedLow.reduce((a, b) => (b.deviationPct < a.deviationPct ? b : a));
    parts.push(
      `${flaggedLow.length} item${flaggedLow.length === 1 ? "" : "s"} ${flaggedLow.length === 1 ? "is" : "are"} priced significantly below the historical average, the lowest being "${worst.description}" at ${Math.abs(worst.deviationPct).toFixed(0)}% below.`
    );
  }

  if (noHistory > 0) {
    parts.push(`${noHistory} item${noHistory === 1 ? "" : "s"} have no historical data to compare against yet.`);
  }

  return parts.join(" ");
}
