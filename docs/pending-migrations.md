# Pending manual database migrations

No migration tooling exists in this project — schema changes are applied
directly against Postgres, then `npx prisma db pull` + `npx prisma generate`
re-sync `prisma/schema.prisma` from the live database (see `AGENTS.md` §7).

## APPLIED — DLP / handover tracking, tender messaging, `costings:view` seed,
## `notification_event_settings` (applied 2026-08-08)

All four migrations from this section (DLP/handover columns on `tender`,
the `tender_message` table, the `costings:view` permission seed, and the
`notification_event_settings` table + seed) have been run against the dev
database and verified: `prisma db pull` + `prisma validate` confirm the
schema matches, `tsc --noEmit` and the full test suite (88/88) pass clean.

## APPLIED — seed `budget_calculator` permission mappings (applied 2026-08-08)

Part of continued incremental `hasPermission()` adoption (see `docs/rbac.md`
"Still open"). The `budget_calculator` permission (`Analytics`/`budget_calculator`,
`permission_id = 4`) was migrated from the legacy RBAC tables in F1 but never
got any `role_permissions` mappings — `/analytics/budget-calculator` had zero
auth gating at all (no session check, no permission check) and relied purely
on the Navbar hiding its link, which was itself wrong (`isFinance` checked
`role_id === 8`, i.e. Project Manager, not any real Finance role — fixed in
`src/components/Navbar.tsx`). Seeded directly against the dev DB (real access
was available) rather than left as a pending SQL block:

```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM (VALUES (1),(2),(3),(4),(9),(10),(11)) AS v(role_id)
JOIN roles r ON r.role_id = v.role_id
CROSS JOIN permissions p
WHERE p.action = 'budget_calculator'
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

Roles granted: Admin(1), Executive Director(2), CEO(3), SCOO(4), Finance
Manager(9), Finance General Manager(10), Finance Team(11) — matching who the
Navbar actually shows the "Budget Planner" link to. `analytics/budget-calculator/page.tsx`
now has a real client-side gate (session check + Admin bypass +
`/api/user/permissions` check), mirroring the pattern already used by
`calendar/page.tsx`.

## APPLIED — add missing `tender_acknowledgment.checklist_data` column (applied 2026-08-09)

Found during a development-stage gap-analysis pass (not a bug sweep):
`POST /api/tenders/[id]/acknowledge` (`src/app/api/tenders/[id]/acknowledge/route.ts`)
has always inserted into a `checklist_data` column that did not exist on the
live `tender_acknowledgment` table — every single call threw a Postgres
"column does not exist" error, meaning document acknowledgment has **never
successfully persisted**, independent of the earlier acknowledgment-status
endpoint-spelling fix (`docs/audit-history.md`) — that fix corrected which
URL got called, but the underlying write was still broken regardless.

```sql
ALTER TABLE tender_acknowledgment ADD COLUMN checklist_data JSONB;
```

Applied directly against the dev DB (real access was available), then
`npx prisma db pull` + `npx prisma generate` + `npx prisma validate` to
resync `schema.prisma`. Live-verified: POST'd a real acknowledgment with
checklist data, confirmed the row persisted with `checklist_data` populated,
then cleaned up the test row.

## NOT YET APPLIED — also required: `CRON_SECRET` env var + hosting confirmation

Not a database migration, but blocking for the scheduler half of this same
pass. `src/app/api/cron/run/route.ts` refuses all requests (500) until
`CRON_SECRET` is set in the deployment environment. `vercel.json` assumes
Vercel Cron hits this endpoint hourly (`0 * * * *`) — confirm the actual
Vercel plan tier before relying on that: **Hobby (free) only allows daily
cron invocations**, Pro allows arbitrary frequency. If the deployment isn't
Vercel at all, replace `vercel.json`'s cron with an external crontab line
calling the same endpoint (documented in the route's own comments). Remove
this note once `CRON_SECRET` is set and the schedule is confirmed correct
for the actual hosting/plan.
