# Pending manual database migrations

No migration tooling exists in this project — schema changes are applied
directly against Postgres, then `npx prisma db pull` + `npx prisma generate`
re-sync `prisma/schema.prisma` from the live database (see `AGENTS.md` §7).

## APPLIED — `audit_log.request_id` Int → String (applied 2026-08-19)

`request_id` was `Int?`, but `proxy.ts` has always populated the
`x-request-id` header with `crypto.randomUUID()`, and `src/lib/audit.ts`
passes that header value straight through to the insert. Every audit-logged
write that reached `logEvent()` with a request present was throwing
`invalid input syntax for type integer` on the `request_id` param — caught
and only `console.error`'d, so it never surfaced as a user-facing error, it
just silently dropped the audit row. Verified before altering: all 54
existing `audit_log` rows had `request_id IS NULL`, so no data was at risk.
Changed to `VARCHAR(36)` (UUID length) directly against the dev DB, then
`prisma db pull` + `prisma generate` re-synced the schema.

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

## APPLIED — full-text contract clauses in `contract_template` (applied 2026-08-17)

`contract_template` (version 1, active) held condensed/paraphrased clause
text instead of the real legal wording — sub-clause lettering (Insurance
a/b/c, Indemnity a-d, Determination of Contract a/b/c with i-iv, etc.) had
been dropped when the template was first seeded. `src/lib/tenderClauses.ts`'s
`DEFAULT_CRITICAL`/`DEFAULT_SCOPE`/`DEFAULT_TERMS` (the fallback used only
when a tender has no `clauses` snapshot yet) were rewritten to match the
full text first, then that same content was inserted as `contract_template`
version 2 (`is_active = true`, version 1 deactivated) directly against the
dev DB. The two tenders present at the time (`tender_id` 6 and 14) were both
stage 1 (Open, no signed/finalized document yet) and had their `clauses`
snapshot + `contract_template_id` refreshed to the new version — tenders at
Closed(2)/Awarded(3) would intentionally be left untouched as a frozen legal
record, but none existed in this DB. Verified by reading the rows back
directly.

## APPLIED — `contractor_company` table + 6 historical tenders imported from
## `Project Schedule 2026-V9.xlsx` (applied 2026-08-17)

New table `contractor_company` (company_name, registration_no, address,
pic_name, linked_user_id → users) — a company directory separate from
`users`, since `tender_award.winning_contractor_id` is a `users` FK but
these real contractor firms have no portal login. 4 companies inserted
(registration_no left `NULL` — not supplied): D'Co Contracts Pte Ltd (PIC
Mr. Raymond Ng), Teck Guang Interior Design Pte Ltd (PIC Mr. Cheng Wai
Meng), Novelty Project Services Pte Ltd (PIC Mr. Jason Goh), KD2 Interior
Pte Ltd (PIC Mr. Ang Yi Bao). Each got one inactive (`is_active=false`)
Contractor-role `users` account + `user_profile` row, with a non-real
`@contractor.tms.local` email so nothing can log in or collide with a real
inbox — created solely to satisfy `tender_award`'s FK requirement.

6 tenders (`tender_id` 15–20) inserted directly at stage 3 (Awarded),
covering the branches/date ranges/contract values confirmed by the user
from the "2026" sheet (col B branch, col T dates) and named contractors:
NX (D'Co, $30,870), JN (Teck Guang, $343,000), JP (Novelty, $331,000), LX
(D'Co, $164,000), WS (KD2, $50,988), AY (D'Co, $53,500). Each has a matching
minimal `tender_submission` (status `Awarded`) and `tender_award` row
(`remark` flags it as an xlsx import, not a live bid), plus one
`calendar_events` row for the renovation period. `contract_sum` used the
user-confirmed final values, not the sheet's pre-award budget estimate.
NYSS-TN (Tiong Bahru Plaza) was excluded — sheet marks it "Postponed to
2027", not completed.

`prisma db pull` + `prisma generate` were run to resync `schema.prisma`
with the new `contractor_company` table; `prisma generate`'s client rebuild
step failed with `EPERM` because a running `next dev` process holds the
native query engine binary locked — re-run `npx prisma generate` next time
the dev server is stopped. This only affects the generated Prisma Client's
knowledge of the new table; all inserts above were done via `pg` directly
and are already live in the database.

## APPLIED — `tender.dlp_case_status` manual override column (applied 2026-08-18)

The DLP deadlines page (`admin/dlp-deadlines`) always showed "N days overdue"
once a case's expiry date passed, with no way to record that the case was
actually being worked or had been resolved. Added a nullable manual-override
column so the auto-computed date-derived status (`src/lib/dlp.ts`'s
`getDlpStatus`, unchanged) can be overridden per tender:

```sql
ALTER TABLE tender ADD COLUMN dlp_case_status VARCHAR(20)
  CHECK (dlp_case_status IS NULL OR dlp_case_status IN ('processing', 'completed'));
```

Applied directly against the dev DB, then `npx prisma db pull` to resync
`schema.prisma` (64 models now). `npx prisma generate`'s client rebuild
failed with the same `EPERM` (native query engine binary locked by a running
`next dev` process) noted in the `contractor_company` entry below — re-run
`npx prisma generate` next time the dev server is stopped; all reads/writes
of the new column go through raw `pg` (`src/lib/db.ts`), not Prisma Client,
so this doesn't block the feature working today.

`PATCH /api/tenders/[id]/handover` (new handler, same route as the existing
handover-recording `POST`) sets/clears the override, gated by the same
`canMarkHandover` check (Admin, or the tender's assigned PM) as recording
the handover itself. The dlp-deadlines page and the tender detail page's
read-only DLP panel both display the override (`Processing`/`Completed`
badge) in place of the auto status when set.

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

Confirmed 2026-08-14: this app is not deployed anywhere yet, so nothing is
actually blocked by this today — it's prep for whenever deployment happens.
`.env.production` (gitignored, local template only) now documents both this
and the matching `DATABASE_URL?sslmode=verify-full` requirement from the
section above, so neither gets missed at actual deploy time.

## NOT YET APPLIED — internal team messaging (`conversation` /
## `conversation_participant` / `message`) (added 2026-08-19)

New, independent internal DM/group-chat feature (`/messages` page) — fully
separate from `tender_message`/`TenderMessagesPanel`, which stays untouched.
`prisma/schema.prisma` has already been updated with the three new models;
run this against the dev database, then `npx prisma db pull &&
npx prisma generate` (stop `next dev` first to avoid the Windows `EPERM`
lock issue on the generated client) and confirm `npx prisma validate`
matches with no diff.

Note the deliberate deviation on `conversation_participant`: it uses
`ON DELETE CASCADE` on both FKs (unlike the rest of this schema, which
favors `NoAction` + app-level cleanup) because a participant row has no
independent meaning once its conversation is gone. `message` also cascades
from `conversation` for the same reason.

```sql
CREATE TABLE conversation (
  conversation_id SERIAL PRIMARY KEY,
  is_group        BOOLEAN NOT NULL DEFAULT false,
  title           VARCHAR(150),
  created_by      INTEGER NOT NULL REFERENCES users(user_id),
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participant (
  conversation_participant_id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  joined_at       TIMESTAMP NOT NULL DEFAULT now(),
  last_read_at    TIMESTAMP,
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX idx_conversation_participant_user ON conversation_participant(user_id);

CREATE TABLE message (
  message_id      SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(user_id),
  body            TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_message_thread ON message(conversation_id, created_at);
```

Remove this note once the SQL has been run against the live database and
`prisma db pull` confirms the schema matches with no drift.
