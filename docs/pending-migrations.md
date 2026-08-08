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
