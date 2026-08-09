# API conventions

## Versioning strategy

There is no `/api/v1/` prefix today, and there won't be one retroactively —
renaming ~60 existing routes would force every frontend fetch call in the
app to change at once, for zero present benefit, since nothing is actually
breaking today.

**Decision:** every route under `src/app/api/**` today is implicitly v1.
The rule going forward:

- **Non-breaking changes** (new optional fields, new optional query params,
  new endpoints) land on the existing route — no versioning needed. The
  pagination work below is a case in point: it's additive and opt-in, so it
  shipped on the existing routes with no version bump.
- **Breaking changes** (removing/renaming a response field, changing a
  field's type or meaning, changing required request shape) must ship as a
  new route under `src/app/api/v2/<same-path>/route.ts`, with the v1 route
  kept working and marked deprecated (a comment + a deprecation ticket) —
  not deleted — until every known caller has migrated.
- Internal-only routes (called exclusively by this app's own frontend, which
  ships in lockstep) can usually just change in place — versioning matters
  most for endpoints with external or slow-moving consumers.

Nobody's built a `v2` route yet — this section exists so the *next* breaking
change has a documented path instead of becoming another ad hoc decision.

## Pagination

**Convention:** query params `page` (1-indexed) and `limit` (max 100,
default 50). Response shape adds `total`, `page`, `limit`, `totalPages`
alongside the existing data field — see `src/lib/pagination.ts`
(`parsePagination` / `paginationMeta`).

This matches the convention 3 routes were already using before this pass
(`admin/tenders`, `bq/my-submissions`, `admin/audit-logs`) — codified rather
than reinvented.

### Opt-in, not default

Pagination on the routes touched in this pass (`bq/submission`,
`users`, `approval/request/pending`, `approval/request/all`,
`analytics/costings?groupBy=tender`) is **opt-in**: if neither `page` nor
`limit` is present in the request, the endpoint returns the full unbounded
result exactly as it did before, in the same response shape. Only when a
caller explicitly passes `page` and/or `limit` does the response switch to
the `{ data, total, page, limit, totalPages }` envelope.

This was a deliberate safety choice, not the ideal end state: `bq/submission`
GET, `users`, and both `approval/request/*` routes had **zero discoverable
frontend callers** when this was implemented (grepped across `src/`) — but
"no caller found" isn't proof none exists, so changing their response shape
unconditionally risked silently breaking something outside this repo (an
external integration, a stale bookmarked script, etc.) with no way to
verify. Opt-in pagination adds the capability with zero risk to whatever's
calling these today.

**Follow-up work, not done here:** once you've confirmed there's truly no
external caller (or once the frontend is updated to pass `page`/`limit`),
flip these to non-opt-in — i.e., always paginate, defaulting to `page=1`.
Leaving pagination opt-in-only doesn't actually cap the worst case (a caller
that never passes `page`/`limit` still gets everything) — it just makes the
capability available. The real fix for "500,000 tenders" scale is default
pagination becoming mandatory, not optional.

### Endpoints identified as needing pagination but not yet on this convention

Surveyed all 60 GET routes under `src/app/api/**`. Four were unbounded lists
over growing transactional tables with no cap at all — these are the ones
this pass added pagination to:

| Route | Table | Status |
|---|---|---|
| `bq/submission` (GET) | `tender_submission` (admin view = all rows) | Done — opt-in pagination |
| `users` | `users` | Done — opt-in pagination |
| `approval/request/pending` | `approval_requests` | Done — opt-in pagination |
| `approval/request/all` | `approval_requests` | Done — opt-in pagination |
| `analytics/costings?groupBy=tender` | `spending_facts` × `tender` | Done — opt-in pagination (other `groupBy` branches are naturally bounded — months/years/categories) |

Everything else surveyed was either: a single-record fetch by ID (no
pagination applicable), bounded reference/config data (statuses, categories,
units, brands — realistically capped at a few hundred rows), or already
scoped to something inherently small (one tender's submissions, one user's
own records, an explicit existing `LIMIT`).

One thing noticed during the survey, not fixed here (out of scope for
pagination):
- `calendar/events` (GET) has no upper bound on the date-range window a
  caller can request; low risk today, but worth a sanity cap if it's ever
  exposed to less-trusted callers.

(`bq/template` (GET), the empty stub previously noted here, was removed
during an orphaned-routes cleanup pass rather than fixed — see AGENTS.md
§6.)
