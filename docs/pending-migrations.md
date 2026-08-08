# Pending manual database migrations

No migration tooling exists in this project — schema changes are applied
directly against Postgres, then `npx prisma db pull` + `npx prisma generate`
re-sync `prisma/schema.prisma` from the live database (see `AGENTS.md` §7).

## NOT YET APPLIED — DLP / handover tracking (added 2026-08-08)

The code for this feature (`src/lib/dlp.ts`, `POST /api/tenders/[id]/handover`,
the tender creation/edit form fields, the dashboard DLP fixes) has been
written and expects these columns to exist, but the migration itself has
**not** been run — no DB access was available at implementation time.

Run this against the production/staging Postgres database as soon as access
is available, then re-pull the Prisma schema:

```sql
ALTER TABLE tender
  ADD COLUMN handover_by INTEGER NULL REFERENCES users(user_id),
  ADD COLUMN handover_notes TEXT NULL,
  ADD COLUMN dlp_reminder_sent_at TIMESTAMP NULL,
  ADD COLUMN expected_handover_date DATE NULL;
```

```
npx prisma db pull
npx prisma generate
npx prisma validate
npx tsc --noEmit
```

Until this is run, `POST /api/tenders/[id]/handover`, the tender
creation/edit "Expected Handover Date"/"Defect Liability Period" fields, and
the dashboard DLP summary will fail at runtime (the columns don't exist yet)
even though the code compiles and type-checks cleanly — the app's raw
`pg.Pool` query layer doesn't depend on Prisma's generated types, so `tsc`
and `npm run build` will not catch this. Remove this section once the
migration has been applied and verified.

## NOT YET APPLIED — Tender messaging / contractor Q&A (added 2026-08-08)

The code for this feature (`src/lib/permissions.ts`'s `canAccessTenderMessages`,
`POST/GET /api/tenders/[id]/messages`, `GET /api/tenders/[id]/messages/contractors`,
`GET /api/messages/recent`, the tender detail page's Messages section, the
Navbar inbox) has been written and expects this table to exist, but the
migration has **not** been run — same reason as above, no DB access was
available at implementation time.

Run this against the production/staging Postgres database as soon as access
is available, then re-pull the Prisma schema:

```sql
CREATE TABLE tender_message (
  message_id SERIAL PRIMARY KEY,
  tender_id INTEGER NOT NULL REFERENCES tender(tender_id),
  contractor_id INTEGER NOT NULL REFERENCES users(user_id),
  sender_id INTEGER NOT NULL REFERENCES users(user_id),
  is_announcement BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tender_message_thread ON tender_message (tender_id, contractor_id, created_at);
```

```
npx prisma db pull
npx prisma generate
npx prisma validate
npx tsc --noEmit
```

Until this is run, every tender-messaging route will fail at runtime (the
table doesn't exist yet) even though the code compiles and type-checks
cleanly, for the same reason as the DLP migration above. Remove this section
once the migration has been applied and verified.

## NOT YET APPLIED — seed `costings:view` permission (added 2026-08-08)

Part of the incremental `hasPermission()` adoption pass (see `docs/rbac.md`
"Still open"). `src/app/api/analytics/costings/route.ts` has always gated
itself on a `costings:view` permission that was never actually created as a
row in `permissions` — the route has been unreachable by anyone, including
Admin, since it was written. This data-only fix seeds the permission and
maps it to Admin by default; other roles can then be granted it through the
existing Role Permissions matrix in `admin/security` (no code change needed
for that — the matrix already lists every row in `permissions` generically).

```sql
INSERT INTO permissions (resource, action, description)
VALUES ('costings', 'view', 'View cost analytics dashboard')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, permission_id FROM permissions WHERE resource = 'costings' AND action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

No `prisma db pull` needed for this one — `permissions`/`role_permissions`
are already fully represented in `schema.prisma`; this is pure data, not a
schema change. `src/app/api/analytics/costings/route.ts` already has an
explicit `hasRole(roleIds, ROLE_IDS.ADMIN) ||` bypass alongside the
permission check, so Admin access doesn't strictly depend on this seed
running — but the Role Permissions matrix will show `costings:view` as
ungranted to everyone (including Admin) until it does, and no other role
can be granted it without this row existing. Remove this section once
applied and verified.
