# RBAC model — canonical decision

## Decision

`schema.prisma` used to define two independent RBAC systems. As of
2026-08-05, they have been consolidated onto **one canonical family**:

- `roles` / `permissions` / `role_permissions` / `user_roles`

The legacy singular family (`role` / `permission` / `role_permission` /
`roles_backup`) has been **migrated and dropped**. Do not reintroduce it.

## Why the plural family won

- It's the one actually queried by the real login handler (`src/lib/auth.ts`,
  `authorize()`) via `prisma.user_roles.findMany(...)`.
- It supports multi-role users (`user_roles` is a many-to-many join table);
  the legacy family was a single FK per user.
- `session.user.role_id`, `session.user.role_name`, and `session.user.roleIds`
  — the values every authorization check in the app actually reads — all
  originate from this family.

## CRITICAL BUG FOUND AND FIXED (2026-08-05): Contractor was checked as role_id 13

Live DB data (not available to the original static-code-only audit) showed
that **role_id 13 is "Legal Team"**, not Contractor. **Contractor is
role_id 22.**

Roughly 25 files (frontend pages and API routes) hardcoded `role_id === 13`
/ `!== 13` / `.includes(13)` intending "Contractor" — every one of them was
checking the wrong role. Fixed: all Contractor comparisons now use
`ROLE_IDS.CONTRACTOR` (22) from `src/lib/roles.ts`. Role IDs 1 (Admin), 6
(FM Regional Director), and 10 (Finance GM) were already correct.

Regression guard: `src/lib/roles.test.ts` asserts `ROLE_IDS.CONTRACTOR === 22`
and `ROLE_IDS.CONTRACTOR !== ROLE_IDS.LEGAL_TEAM`.

## IMPORTANT CORRECTION (2026-08-05): the legacy tables were not dead

Both the original audit and an earlier draft of this doc assumed
`role`/`permission`/`role_permission` were unused legacy cruft, safe to drop
outright. That was wrong. They backed a **live permissions-management
feature**:

- `admin/security/page.tsx` — a full UI for assigning permissions to roles.
- `/api/admin/permissions`, `/api/admin/role-permissions[/[roleId]]` — CRUD
  for permissions and role→permission mappings.
- `/api/user/permissions` — consumed by `calendar/page.tsx` (gates
  `view_project_schedule`) and `bq/compare/page.tsx` (gates
  `view_cost_comparison`).
- `/api/admin/extension-settings` — tender extension approver settings,
  joined against the legacy `role` table.
- `/api/analytics/costings` — permission-gated via the legacy tables (its
  gate, `costings:view`, was never actually created as a permission, so
  this endpoint was already unreachable by anyone before the migration —
  a pre-existing dead-end, not something this migration changed).

Dropping the tables outright would have broken all of the above. The actual
migration therefore had to move live data, not just drop empty tables.

## F1 migration — completed 2026-08-05

Executed directly against the DB (backup taken first: see session notes),
verified with `npx prisma validate`, `npx prisma generate`, `npm test`, a
full `tsc --noEmit`, and live functional queries reproducing the app's
actual permission/extension-settings lookups.

1. **Permission data migrated**: the 4 rows in legacy `permission` →
   `permissions`, using `resource = module` (verbatim) and
   `action = permission_code` (verbatim) — chosen specifically so the
   `/api/admin/permissions` and `/api/user/permissions` **response shapes
   didn't change**, meaning zero frontend changes were needed.
   - `(calendar, view_project_schedule)`
   - `(BQ, view_cost_comparison)`
   - `(Tender Management, manage_tender_timings)`
   - `(Analytics, budget_calculator)`
2. **Role-permission mappings migrated**: the 2 rows in legacy
   `role_permission` → `role_permissions` (role 1 / Admin → the calendar and
   cost-comparison permissions above).
3. **`users.role_id`** FK repointed from `role` to `roles` (same ID space,
   no data change — every role_id in `role` had a matching row in `roles`).
4. **`tender_extension_settings.role_id`** FK repointed the same way.
5. **Code updated** to match (all preserve prior behavior/response shapes):
   - `src/app/api/admin/permissions/route.ts` — now queries `permissions`,
     translates `resource`/`action`/`description` back to
     `module`/`permission_code`/`permission_name` in the JSON response.
   - `src/app/api/admin/role-permissions/route.ts`,
     `src/app/api/admin/role-permissions/[roleId]/route.ts`,
     `src/app/api/admin/roles/[id]/route.ts` — `prisma.role_permission` →
     `prisma.role_permissions` (including inside `$transaction` callbacks).
   - `src/app/api/user/permissions/route.ts`,
     `src/app/api/analytics/costings/route.ts` — raw SQL rewritten to join
     `role_permissions`/`permissions`; `costings`'s `resource:action`-style
     permission code (`costings:view`) is now split on `:` and matched
     against `resource`/`action` directly.
   - `src/app/api/admin/extension-settings/route.ts` — `JOIN role` →
     `JOIN roles`.
6. **Dropped**: `role`, `permission`, `role_permission`, `roles_backup`.

## Still open

- **`hasPermission()` as the primary authorization mechanism** (replacing
  role-ID checks in `src/lib/permissions.ts` and the ~25 files using
  `ROLE_IDS.*`) is still not built. The permission matrix now has real data
  (4 permissions, 2 mappings, both scoped to Admin) but it's nowhere near
  covering the app's actual authorization surface — building it out is a
  product decision about what the full permission matrix should be, not a
  mechanical migration.
- `src/app/api/tenders/[id]/stage/route.ts`'s email-notification recipient
  lookup queries `users.role_id` directly (a per-user scalar column) rather
  than joining through `user_roles`. Still correct today (same ID space),
  just worth knowing it's a different read path than the rest of the app.

See the full audit (`TMS-Architecture-Security-Audit.md`, findings F1/F2) for
the original rationale.
