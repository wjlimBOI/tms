// lib/bqCalculations.ts
// Pure BQ line item amount calculation, extracted from
// app/api/bq/items/route.ts so it can be unit tested and reused without
// duplicating the arithmetic in each route handler.

export function calculateLineItemAmount(
  quantity: number,
  unitPrice: number,
  discount?: number
): number {
  return quantity * unitPrice - (discount || 0);
}
