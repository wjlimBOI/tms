# Audit history — F1–F15 (original: `TMS-Architecture-Security-Audit.md`)

This document replaces the original architecture/security audit, which has
been removed from the repo root. Its findings are summarized here with their
resolution status, verified against the real code as of 2026-08-07 — not
taken on faith from the original report. See `docs/rbac.md` for the full
detail on F1/F2 specifically.

## Why this doc exists instead of the original audit file

The audit was a point-in-time snapshot (208 files, ~47,000 LOC, representative
deep-dive on auth/data-access/uploads/schema — not a literal line-by-line
review of everything). Leaving it in the repo root risked a future session
reading stale "Critical" findings as still-current problems, or trusting
claims (e.g. "zero tests exist") that had already been overtaken by later
work. This file exists so the *history* is preserved without the *staleness
risk*.

## Resolved

| # | Finding | Resolution |
|---|---|---|
| F1 | Two independent, disconnected RBAC systems (`role`/`permission`/`role_permission` singular family vs `roles`/`permissions`/`role_permissions`/`user_roles` plural family) | Migrated onto the plural family only; legacy tables (`role`, `permission`, `role_permission`, `roles_backup`) dropped. Full migration record in `docs/rbac.md`. |
| F3 | Unauthenticated public upload endpoint, no validation, path-traversal-prone filenames | `src/app/api/tenders/upload/route.ts` now requires a session, enforces a size cap, an extension/MIME allowlist, magic-byte signature verification, and UUID-only filenames. |
| F6 | Duplicate BQ upload endpoints (`upload-legacy` vs `upload-new`) with inconsistent auth | `upload-legacy` removed; only `upload-new` (with the Contractor role check) remains. |
| F7 | Two contradictory CSP definitions (`next.config.ts` vs `proxy.ts`) | `next.config.ts` no longer sets CSP; `proxy.ts`'s nonce-based policy is the single source. |
| F8 | Standard contract clause text baked into a Prisma schema column default | `tender.clauses` is now populated at tender-creation time from a versioned `contract_template` table, not a schema default. |
| F9 | Duplicate/redundant indexes (`tender`, `bq_line_item`, `tender_submission`) | Confirmed via schema grep: no duplicate index pairs remain. |
| F10 | Live "backup" tables (`roles_backup`, `users_backup`) including password hashes | Both dropped as part of the F1 migration. |
| F12 | Unused dependencies (`bcryptjs`, `jsonwebtoken`), rate-limiter installed but unused | Both dependencies removed from `package.json`; `src/lib/rate-limit.ts` is wired into the login flow (per-IP and per-username) in `src/lib/auth.ts`. |
| F14 | Ad hoc `stage` integer state machine not reflected in the schema; `revert` didn't check for an existing award record | `tender.stage`/`tender.stage_updated_at` are now real schema columns; `src/app/api/tenders/[id]/stage/route.ts` blocks reverting past a stage with an existing `tender_award` record. |
| F15 | Boilerplate `README.md`, undocumented known issues, stray `find-role-checks.js` | `README.md` now documents the real stack, env vars, and RBAC model; the stray script is gone. |

## Partially resolved / accepted as known, documented debt

| # | Finding | Current state | Why not fully closed |
|---|---|---|---|
| F2 | Hardcoded numeric role IDs across the codebase, no permission-table-driven `hasPermission()` | The specific bug this finding flagged — Contractor checked against role_id 13, which is actually "Legal Team" (Contractor is 22) — is fixed across ~25 files, now via the named `ROLE_IDS` constant in `src/lib/roles.ts`, with a regression test (`src/lib/roles.test.ts`) asserting `CONTRACTOR !== LEGAL_TEAM`. Role-ID checks (not full `permissions`/`role_permissions`-table-driven authorization) remain the pattern for most of the app. | Building `hasPermission()` as the *primary* authorization mechanism requires deciding the shape of a full permission matrix — a product decision, not a mechanical refactor. `docs/rbac.md` records this as explicitly open. |
| F4 | Raw `pg.Pool` connections had SSL disabled outright | `src/lib/db.ts` now enables SSL in production by default with certificate verification (`rejectUnauthorized: true`), with an optional CA bundle via `DB_SSL_CA_PATH` and an explicit, loudly-logged opt-out via `DB_SSL_REJECT_UNAUTHORIZED=false` for ops emergencies. | Prisma-based routes get their SSL behavior from `DATABASE_URL`'s `sslmode` parameter, not from this file — production deployments must confirm that connection string carries proper `sslmode` (e.g. `verify-full`) for full coverage. That's a deployment/ops action, not a code change. |
| F5 | Dual database access layers (raw `pg.Pool` vs Prisma), with confirmed schema drift on `tender.stage` | The concrete drift is fixed — `stage`/`stage_updated_at` are real Prisma-tracked columns. | The dual-layer architecture itself is unchanged by design; `README.md`'s "Data access" section documents this as an accepted current state ("no firm rule yet for which to use where"), not something this session attempted to unify. |
| F11 | Zero automated test coverage | No longer true: Vitest is wired up (`npm test`), now 170 tests across 14 files, covering `ROLE_IDS` regression, `canEditSubmission` permission logic, BQ line-item amount calculations, tender stage-transition authorization (`tenderStage.ts`), and `tenderLifecycle.ts`'s full scheduler surface — `autoOpenScheduledTenders`/`autoCloseExpiredTenders`/`applyScheduledTenderTransitions` (mocked via `vi.mock("@/lib/db")`) plus `sendDueDlpReminders`/`sendUpcomingSubmissionDeadlineReminders`, added once those two existed (they postdated the original auto-open/close tests). Includes a regression test for a previously-real bug: `pg` returns date columns as native `Date` objects, which broke notification/email text formatting until `toDateOnly()` was applied. | Coverage is still narrow relative to the app's full surface — this was one specific gap closed, not a claim of comprehensive coverage. |
| F13 | Verbose debug logging (5 `console.log` calls) in `canEditSubmission` | Down to 0 — the remaining line was removed in this session. | — (fully resolved as of this pass) |

## Resolved since (stage-model decision + auto-open/close)

The two items below were open as of 2026-08-07 and have since been resolved
by an explicit product decision:

- **Stage model**: collapsed from the old 7-stage internal review workflow
  (Submission → Finance GM Viewing → FM RD Viewing → Cost Comparison → FM RD
  Final Viewing → Award → Closed) to the real external lifecycle —
  **Upcoming(0) → Open(1) → Closed(2) → Awarded(3)**, plus Cancelled(-1).
  Closed → Awarded is exclusively `src/app/api/tenders/[id]/award/route.ts`
  (Admin-only); the stage endpoint (`src/app/api/tenders/[id]/stage/route.ts`)
  only ever handles 0→1 and 1→2, also Admin-only.
- **Auto-open/auto-close**: the "no auto-open mechanism anywhere" gap
  (previously noted here) is closed for both directions. `tender_date`
  ("Tender Start", set at creation) now drives Upcoming→Open, and
  `closing_date` drives Open→Closed, both applied by
  `src/lib/tenderLifecycle.ts`'s `applyScheduledTenderTransitions()`. This is
  a lazily-checked-on-request date comparison, not a real background job —
  no cron/scheduler exists in this app (single instance, no queue), so the
  check runs at the top of every route that reads or gates on tender
  open/closed status. EOT (extension of time) approval extends
  `closing_date` directly, so no separate "extended" branch was needed.
  Bid submission is still handled entirely outside the app via email per IT
  policy — this only automates the internal Upcoming/Open/Closed state, not
  an upload flow.

See `AGENTS.md` §7 for the current, authoritative description of this model
— treat it as settled, not as a decision still pending a product call.

## Scope note

This summary covers F1–F15 as originally numbered. The original audit's
§7 "Refactoring Roadmap" Phase 3/4 items (multi-tenancy, object storage for
uploads, API versioning, full UI/API consistency pass) were explicitly
out-of-scope future work in the original document and remain so here — they
were never findings requiring "resolved" status, just roadmap notes.
