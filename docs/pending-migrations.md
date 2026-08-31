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

## APPLIED — internal team messaging (`conversation` /
## `conversation_participant` / `message`) (applied 2026-08-19, confirmed 2026-08-19)

New, independent internal DM/group-chat feature (`/messages` page) — fully
separate from `tender_message`/`TenderMessagesPanel`, which stays untouched.
Confirmed live: all three tables exist in the dev database and
`npx prisma db pull` shows no drift against `schema.prisma`.

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

## APPLIED — remove hardcoded personal email from "3) SUBMISSION OF TENDER"
## clause (applied 2026-08-20)

`src/lib/tenderClauses.ts`'s `DEFAULT_CRITICAL` clause 3 had a specific
person's email (`annielim@beautyone.com.sg`) hand-typed into the clause text,
wrapped in a literal `<u>...</u>` string — since the clause is rendered as
plain text (`{description}`, not `dangerouslySetInnerHTML`), the tags never
actually rendered as underline; contractors saw the literal characters
`<u>annielim@beautyone.com.sg</u>` on the printed tender document. Replaced
with a `<pm email>` placeholder, following the same convention already used
for `<tender title>` and `<date>` in the same clause, and substituted at
render time with the tender's actual `project_manager_email` (falling back
to `DEFAULT_PM_EMAIL`) in both `src/app/tenders/[id]/page.tsx` and
`src/app/tenders/[id]/edit/page.tsx` — matching how clause 4 ("TENDER
ENQUIRIES") already sourced its contact email dynamically instead of a
hardcoded string.

The wrong email wasn't just in the code fallback — every existing tender's
`clauses` JSONB snapshot (populated at creation time from `contract_template`,
F8) had it baked in too. `contract_template` version 2 was deactivated and a
new version 3 inserted (now `is_active = true`) with the corrected clause
text. All 23 existing tenders (`tender_id` 6, 14–35) had their `clauses`
snapshot and `contract_template_id` refreshed to point at version 3 —
deliberately including the 21 already-Closed/Awarded tenders, which the
2026-08-17 migration's "frozen legal record" precedent would normally have
left untouched. This was an explicit user decision (2026-08-20): the wrong
personal email needed correcting everywhere, not just on new documents going
forward. Verified: `SELECT count(*) FROM tender WHERE clauses::text ILIKE
'%annielim%'` returns 0.

No schema change — `content`/`clauses` are `Json` columns, so no
`prisma db pull`/`generate` was needed.

## CORRECTED — `annielim@beautyone.com.sg` was intentional, not a bug
## (corrected 2026-08-20)

The entry directly above was wrong about intent, though right about a real
rendering bug. User clarified: `annielim@beautyone.com.sg` is the actual
fixed tender-submission mailbox — deliberately different from the per-tender
PM's enquiry email used in clause 4 ("Tender Enquiries"). It should never
have been replaced with the dynamic `project_manager_email`.

What was genuinely broken and stays fixed: the clause rendered as plain text
(`{description}`), not `dangerouslySetInnerHTML`, so the literal `<u>...</u>`
wrapper characters were visible on the printed document instead of an
underline. Re-fixed properly this time — `src/lib/tenderClauses.ts` clause 3
now carries a `<submission email>` placeholder (own constant,
`DEFAULT_SUBMISSION_EMAIL` in `src/lib/tenderConstants.ts`, fixed to
`annielim@beautyone.com.sg`, not tied to any tender's PM). Rendering in
`src/app/tenders/[id]/page.tsx`, `src/app/tenders/[id]/edit/page.tsx`, and
`src/components/admin/BlankTenderTemplatePreview.tsx` now splits the clause
text on that placeholder and wraps the email in a real `<u>` JSX element
(not a raw HTML string) — renders underlined, no `dangerouslySetInnerHTML`,
no risk of interpolated tender-name/date text being parsed as markup.

`contract_template` version 3 deactivated, version 4 inserted with the
corrected clause text, and all 23 tenders' `clauses` snapshot +
`contract_template_id` refreshed to point at it — same "fix everywhere,
including Awarded tenders" scope as the previous entry, per the same
explicit user instruction. Verified: `SELECT count(*) FROM tender WHERE
clauses::text ILIKE '%submission email%'` returns 23 (the clause stores the
`<submission email>` placeholder token, not the resolved address — same
pattern as the pre-existing `<tender title>`/`<date>` placeholders,
substituted at render time).

## APPLIED — invitation-based tender interest: `tender_interest` invite
## columns + `tender_invitation_template` (applied 2026-08-21)

Restructures tender interest from contractor self-service to admin
invitation. Admins now select specific registered contractors to invite from
the tender messaging area ("Send Invitation", replacing free-text "Send
Announcement"); invited contractors get a one-time-token email link to
accept/decline without logging in. Extended `tender_interest` in place
rather than a new model — it already models one row per (tender,
contractor), and `submitted_at` already means "responded":

```sql
ALTER TABLE tender_interest
  ADD COLUMN invited_by Int NULL REFERENCES users(user_id),
  ADD COLUMN invited_at TIMESTAMP NULL,
  ADD COLUMN invite_token VARCHAR(64) NULL,
  ADD COLUMN invite_token_expires_at TIMESTAMP NULL,
  ADD COLUMN invite_token_used_at TIMESTAMP NULL,
  ADD COLUMN declined_at TIMESTAMP NULL;

CREATE UNIQUE INDEX idx_tender_interest_invite_token
  ON tender_interest(invite_token) WHERE invite_token IS NOT NULL;

CREATE TABLE tender_invitation_template (
  id          SERIAL PRIMARY KEY,
  subject     VARCHAR(200) NOT NULL DEFAULT 'You''ve been invited to submit a tender',
  body        TEXT NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_by  INTEGER REFERENCES users(user_id)
);
```

Seeded one default template row. Token generation mirrors
`password_reset_tokens`/`crypto.randomBytes(32).toString("hex")`, 14-day
expiry. On accept, `is_approved`/`approved_by`/`approved_at` are set
automatically (replacing the removed manual Approve step) — required so
`sendUpcomingSubmissionDeadlineReminders()` (`src/lib/tenderLifecycle.ts`)
keeps working, since it filters on `is_approved = true`. On decline, only
`declined_at` is set.

Applied directly against the dev DB, then `npx prisma db pull` resynced
`schema.prisma` (68 models now, no drift). `npx prisma generate`'s client
rebuild failed with the same `EPERM` (native query engine binary locked by
a running `next dev` process) noted in earlier entries — re-run
`npx prisma generate` next time the dev server is stopped; all new
columns/table are read/written through raw `pg` (`src/lib/db.ts`) in the
new invite/respond routes, not Prisma Client, so this doesn't block the
feature working today.

Also seeded a `tender_invitation` row in `notification_event_settings`
(`label` "Tender invitation sent to contractor") so the new invite email
plugs into the existing admin toggle/CC UI in `admin/security` automatically
— that section reads its list dynamically from this table, no hardcoded
event list to update in the component itself.

## APPLIED — per-item BQ notes + contractor read tracking on
## `review_comment` (applied 2026-08-21)

Staff notes on a contractor's BQ (`review_comment`) previously attached only
to the whole submission — no way to say a note was about a specific line
item — and had no read/unread concept beyond `contractor_notified` (whether
a notification was *fired*, not whether the contractor actually saw it).

```sql
ALTER TABLE review_comment
  ADD COLUMN line_item_id INTEGER NULL REFERENCES bq_line_item(line_item_id) ON DELETE CASCADE,
  ADD COLUMN contractor_read_at TIMESTAMP NULL;
```

`line_item_id` targets `bq_line_item` (the real per-submission line-item
table backing the BQ edit page — own serial PK, contractor-editable), not
`bq_template_items`/`bq_submission_items`, which are a separate, unrelated
admin reference-template system. `ON DELETE CASCADE` because a note about a
deleted line item is meaningless. Nullable so existing general-submission
notes remain as read-only history; new notes always populate it — enforced
at the API layer (`src/app/api/bq/[submissionId]/comments/route.ts`), not a
DB constraint.

`contractor_read_at` is set automatically the first time a contractor's
`GET` on the comments route actually returns a given note to them (response
carries `is_new: true` on that same call before the row flips to read) —
no separate mark-as-read endpoint. Read tracking only applies to
`visible_to_contractor = true` notes, per explicit product decision —
internal-only notes have no contractor read state.

Applied directly against the dev DB, then `npx prisma db pull` resynced
`schema.prisma`. `npx prisma generate`'s client rebuild failed with the
same `EPERM` (native query engine binary locked by a running `next dev`
process) noted in earlier entries — re-run `npx prisma generate` next time
the dev server is stopped; both new columns are read/written through raw
`pg` (`src/lib/db.ts`), not Prisma Client, so this doesn't block the
feature working today.
