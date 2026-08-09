<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tender Management System — Project Instructions (CLAUDE.md)

Claude Code reads this file automatically at the start of every session in
this repo — no need to point subagents at it separately. If you add or edit
subagents in `.claude/agents/`, they inherit this context already; don't
duplicate it into each agent file.

This is the single source of truth every agent and every session checks
itself against. If a rule here stops matching reality, fix this file — don't
let an agent quietly enforce something stale.

---

## 0. Language: TypeScript only

This is a hard IT/security requirement, not a preference. Real stack: Next.js 16.2.6, React 18.3.1, TypeScript strict mode, npm, single app (no monorepo).

- `tsconfig.json` has `strict: true`, `noEmit`, `isolatedModules`, `esModuleInterop`, `skipLibCheck: true` — but NOT `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes`. Don't assume those protections exist.
- ⚠️ `@types/react`/`@types/react-dom` are on `^19` while the actual runtime is React `18.3.1`. This already broke a real install (`react-leaflet@5` needed React 19, had to be downgraded to `^4.2.1`). Check this mismatch before adding any package with a React 19 peer dependency.
- **`any` policy, recalibrated:** 272 occurrences exist across 67 files already — that's debt, not something to relitigate on every PR. Rule: no NEW `any` in code you're touching. Leave pre-existing `any` alone unless the task is specifically a cleanup pass.
- **No `as` casts to route around a type error**, except to narrow something already provably safe.
- `@ts-ignore`/`@ts-expect-error`: currently zero occurrences in `src/`. Keep it that way.
- **Validation library: Zod v4** (`zod@^4.4.3`), real usage in `src/lib/validation.ts` and ~20+ files — but not universal; some routes still do manual `if (!field)` checks. New/touched routes must use Zod, matching the established pattern.
- **Two DB type sources, not one:** Prisma-based routes get typed results; routes using raw `pg` via `src/lib/db.ts` get untyped rows manually reshaped. Check which path a route uses before trusting its types.

## 1. Before writing anything

- Read every related file. Understand existing dependencies, workflows, and business logic before touching them. Never assume.
- Search for an existing component/service/utility/type before creating a new one. State explicitly if nothing reusable was found.

## 2. Design system

- No page-specific styling unless there is genuinely no reusable token/component — and if that happens, it's a signal the design system is missing something, not a license to freelance.
- Light theme, minimal/clean/premium enterprise SaaS tone. No glassmorphism, heavy gradients, dark theme, saturated colors, excessive animation.
- Every button variant (Primary, Secondary, Ghost, Danger, Success, Icon) must support hover/focus/pressed/disabled/loading/success/error states.

## 3. Every async action, no exceptions

- Loading state (skeleton, spinner, progress bar, or button loading state — matched to context).
- Success feedback (toast, inline confirmation, or status indicator).
- Error handling that: explains the issue in plain language, suggests a next action, allows retry, and preserves whatever the user had entered. Never surface a raw error object or stack trace to the user.

## 4. Responsiveness

Must work cleanly at 320 / 375 / 768 / 1024 / 1440 / 1920 / 2560 / 3840px. Never: horizontal scroll, hidden actions, overflowing tables, clipped dialogs, overlapping elements.

## 5. Accessibility

WCAG 2.2 AA minimum. Keyboard navigation, visible focus, ARIA labels, accessible forms/tables/dialogs, touch-friendly targets, never color-only signaling.

## 6. Security

Auth is NextAuth (session-cookie), enforced **per-route, not centrally** — no `src/middleware.ts`; `proxy.ts` only sets security headers. This exact pattern already caused a real incident: ~25 files checked Contractor against the wrong `role_id` before being fixed (`docs/rbac.md`). Verify any role/permission check against `docs/rbac.md` or the real `permissions`/`role_permissions` tables — don't copy a neighboring file's check on faith. Input validated at every boundary (see §0). No secrets/credentials/PII in logs or client-visible code. File uploads: local disk storage. Content validation (size cap + magic-byte signature check, `src/lib/fileValidation.ts` for the shared .xlsx check) is now consistent across all 4 upload routes (`tenders/upload`, `bq/upload-new`, `bq/import`, `admin/bq-template/upload`) — previously only `tenders/upload` had the full check, the three .xlsx routes relied solely on ExcelJS throwing on bad content. `tenders/upload` is Admin-only (was previously any authenticated user, including Contractor — closed 2026-08-08) but is itself unused by any caller in `src/`; it exists alongside a real, unused `tender_document` DB table — a scaffolded-but-unfinished per-tender document feature, not dead code to remove on sight. ⚠️ `file_hash` (schema field on `interest_document`) is confirmed dead, not just unconfirmed: no code anywhere computes or checks it, and `interest_document` itself has zero writers in `src/` — the whole document-verification side of that table is unbuilt. Same pattern again with `approval_requests`/`approval_chains`: `admin/approval-chains` (the config side — defining which roles approve which `resource_type`) is real and wired into `admin/security`, but the runtime side (`api/approval/request` and its `pending`/`all`/`action` siblings — actually creating and acting on a pending approval against a specific object) has zero callers anywhere in `src/`. `POST /api/approval/request` accepts a caller-supplied `resource_type`/`resource_id` with no ownership/authorization check against that specific object — a real IDOR-shaped gap, but `resource_type` is a free-form admin-defined label with no fixed enum, so a correct object-level check can't be written until whatever feature actually calls this route decides what "owns resource_type X" means. Fix when that feature is wired up, not before.

⚠️ `tenders/documents/[filename]` (serves files written by `tenders/upload`) is auth-only by design, documented in the route's own header comment: there is no filename↔tender association in the schema to authorize against yet (the same missing `tender_document` link above), so it can only enforce "must be logged in," not "must be entitled to this specific tender's documents." UUIDv4-only filenames limit practical exploitability. Fixing this properly requires the `tender_document` feature to exist first, not a change to this route in isolation.

Raw `pg.Pool` connections (`src/lib/db.ts`) verify TLS certificates in production by default (`getSslConfig()` — `rejectUnauthorized: true`, optional `DB_SSL_CA_PATH` CA bundle, explicit logged opt-out via `DB_SSL_REJECT_UNAUTHORIZED=false` for genuine emergencies only). ⚠️ Prisma-based routes get their SSL behavior from `DATABASE_URL`'s `sslmode` query param instead — this file's fix doesn't cover them. Before treating a production deployment as fully TLS-verified, confirm `DATABASE_URL` actually carries `sslmode=verify-full` (or equivalent); this is a deployment/ops config item, not something checkable from the code alone.

Authorization is still role-ID-based (`ROLE_IDS` constants + `hasRole()`/`canEdit*`/`canView*` in `src/lib/permissions.ts`), not driven by the `permissions`/`role_permissions` tables — those tables exist and back the admin permissions-management UI (`admin/security`), but a general-purpose `hasPermission()` covering the app's full authorization surface was never built; it's a deliberate, documented open item (`docs/rbac.md` "Still open"), not an oversight. Don't invent one ad hoc for a single feature — flag it if a task seems to need it.

See `docs/audit-history.md` for the full resolved/accepted-debt history behind these notes (the original audit doc it replaces has been removed from the repo root).

## 7. Database

Real schema: ~62 Prisma models, PostgreSQL, snake_case naming — NOT the PascalCase 13-entity ER diagram used in early planning. No `Tender_Submission_Version` (no versioning exists), no `Account` (use `users`/`user_profile`), no singular `Role` (dropped; `permissions`/`role_permissions` plural are canonical). No migrations tooling exists — schema changes go via direct SQL/`prisma db push`, then `schema.prisma` is re-pulled from the DB. The database is the source of truth, not the schema file. Every FK indexed. No NOT NULL column added to a populated table without a default.

Two data-access layers coexist by design, not by accident: Prisma Client (`src/lib/prisma.ts`) and a raw `pg.Pool` (`src/lib/db.ts`, exposed as `query`/`getClient`). There's no firm rule for which a new route should use — match whatever the surrounding/related routes already do. `tender.stage`/`tender.stage_updated_at` are real, schema-tracked columns.

`tender.stage` is now a settled 4-stage model matching the real external lifecycle: **Upcoming(0) → Open(1) → Closed(2) → Awarded(3)**, plus Cancelled(-1). The old 6-stage internal-review workflow (Submission → Finance GM Viewing → FM RD Viewing → Cost Comparison → FM RD Final Viewing → Award → Closed) has been removed from `src/app/api/tenders/[id]/stage/route.ts` — don't reintroduce it. Rules of this model, extracted into pure/tested predicates in `src/lib/tenderStage.ts` (see `src/lib/tenderStage.test.ts`):
- `PUT /api/tenders/[id]/stage` only handles 0→1 and 1→2, both Admin-only. Closed(2)→Awarded(3) is exclusively `src/app/api/tenders/[id]/award/route.ts` (also Admin-only) — no role can advance past Closed via the stage endpoint, by design (absence from `allowedAdvanceRoles` is the guard, not a special case).
- Both Upcoming→Open and Open→Closed also happen **automatically**, driven by `tender.tender_date` ("Tender Start" at creation) and `tender.closing_date` respectively, via `src/lib/tenderLifecycle.ts`'s `applyScheduledTenderTransitions()`. There is no cron/scheduler in this app — it's a lazy, request-time check called at the top of every route that reads or gates on tender open/closed status (list, detail, submit, interest, extension request, stage advance/revert). Any new route with the same dependency must call it too.
- EOT (extension of time) approval is FM Regional Director only (`src/app/api/tender-extension/[id]/route.ts`) and rewrites `tender.closing_date` directly — the auto-close check needs no separate "extended" branch because of this.
- Revert (Admin-only) refuses to move a tender out of Awarded(3) while a `tender_award` row still exists for it (F14 guard, `awardBlocksRevert`) — award and stage must never disagree.

## 9. Existing docs to read, not duplicate

`docs/api-conventions.md` (versioning, pagination), `docs/rbac.md` (canonical RBAC family, Contractor incident), and `docs/design-system.md` (colors, typography, spacing, radius, shadows, breakpoints, icon sizing — documents actual usage, not an aspirational scale) already exist in the repo. Also check `CLAUDE.md`/`AGENTS.md` for existing AI-agent instructions before treating this file as the sole source of truth.

## 10. Scale — target vs. reality

"Hundreds of thousands of tenders / millions of files / thousands of concurrent users" is a future target. Current reality: single-instance app, local disk file storage, no queue, no CDN, no confirmed read replicas or active caching layer. Don't fire scale-calibrated performance blockers on ordinary changes to a small dataset — flag genuine scale-relevant decisions as roadmap notes, not PR blockers.

## 8. Non-negotiables (from the original constitution, condensed)

1. Functionality before aesthetics. 2. Architecture before shortcuts. 3. Reuse before creating new. 4. Consistency before creativity. 5. Accessibility mandatory. 6. Responsive mandatory. 7. Every async action needs a loading state. 8. Every action needs user feedback. 9. Shared features must be reusable. 10–11. Never duplicate business logic or UI components. 12. No page-specific styles without justification. 13. Preserve existing functionality. 14. Build for future expansion. 15. Leave the codebase cleaner than you found it. 17. If uncertain, inspect more before acting. 18. Every change must improve scalability, maintainability, usability, or performance — or it doesn't ship.

---

*Maintained alongside the codebase. If a rule here stops matching reality, that's a conversation with the project owner, not something an agent should quietly override.*