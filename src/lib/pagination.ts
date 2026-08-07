// lib/pagination.ts
// Shared pagination convention for list endpoints (Phase 4 / API consistency).
// See docs/api-conventions.md.
//
// Query params: `page` (1-indexed) and `limit` (max 100). Pagination is
// opt-in: if neither is present, callers get every row, unchanged — this
// lets existing/unknown callers keep working while new callers (or ones
// updated later) can request paged results.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

// Returns null when the caller didn't ask for pagination (no page/limit
// query params) — the caller should then run its query unbounded, exactly
// as before.
export function parsePagination(searchParams: URLSearchParams): PaginationParams | null {
  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");
  if (rawPage === null && rawLimit === null) return null;

  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(rawLimit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginationMeta(pagination: PaginationParams, total: number) {
  return {
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}
