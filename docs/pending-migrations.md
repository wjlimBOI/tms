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
and `npm run build` will not catch this. Remove this file/section once the
migration has been applied and verified.
