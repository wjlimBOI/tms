# Tender Management System (TMS) — Architecture, Security & Quality Audit

**Repo:** `wjlimBOI/tms` (branch: `development`)
**Stack:** Next.js 16 (App Router), NextAuth v4, Prisma 5 + raw `pg`, PostgreSQL
**Scope of this pass:** 208 source files, ~47,000 LOC of TS/TSX, full `prisma/schema.prisma` (1,000 lines / ~45 models), `package.json`, middleware (`proxy.ts`), `next.config.ts`, auth/permission libraries, all upload endpoints, the tender stage-transition workflow, and targeted cross-file consistency searches (duplicate indexes, dual auth systems, dual DB clients, secrets, tests).

**Honesty note on methodology:** A codebase this size genuinely warrants a multi-day, multi-pass audit with static analysis tooling, a running database, and interviews with the team about intended vs. actual behavior. What follows is a real, evidence-based pass — every finding below was verified by reading the actual file/line, not inferred — but it is a **representative deep-dive on the highest-risk surfaces** (auth, data access, workflow engine, uploads, schema) rather than a literal line-by-line review of all 208 files. I flag this so the report is trustworthy rather than padded. Where I was not able to confirm something (e.g., runtime behavior, prod env config), I say so explicitly.

---

## 1. Executive Summary

The system is functionally rich (tenders, BQ line items, contractor submissions, awards, extensions, calendar, RBAC, audit logging) and shows real security awareness in places — parameterized SQL everywhere I checked, account lockout, password history, audit logging, CSP/security headers, `.gitignore` correctly excludes `.env*` and upload directories.

However, the codebase has **two systemic problems that will actively hurt it at scale**, both bigger than any individual bug:

1. **There are two competing, independently-evolved subsystems for almost every core concern**: two RBAC schemas (`role`/`permission` vs `roles`/`permissions`/`user_roles`), two database access layers (raw `pg.Pool` in 60 files vs Prisma Client in 30 files), two BQ upload pipelines (`upload-legacy` vs `upload-new`), two CSP header definitions (`next.config.ts` vs `proxy.ts`) with **contradictory policies**, and authorization logic re-implemented with hardcoded numeric role IDs in at least three different places instead of using the permissions tables that exist for exactly this purpose.
2. **Zero automated tests** (no `*.test.*`/`*.spec.*` files anywhere) on a system that moves contract awards and money, and a `schema.prisma` that is already out of sync with the live database (a `tender.stage` column is queried in production code but does not exist in the schema at all).

Neither problem is a "bug" you patch — they're the kind of structural debt that gets dramatically more expensive to unwind the longer the team keeps building on top of it. The good news: nothing found requires a rewrite. It requires picking **one** RBAC model, **one** data-access layer, and **one** CSP policy, and migrating the rest onto it deliberately.

---

## 2. Scores

Scores are directional, based on verified findings plus known unknowns (things I couldn't check without a running DB/CI, noted per section).

| Dimension | Score /100 | Rationale (short) |
|---|---|---|
| **Technical Debt** | 38/100 | Parallel systems (auth, DB access, uploads) are the dominant cost driver; no tests to enable safe refactors. |
| **Security** | 45/100 | Good header/CSP intent and parameterized queries, undermined by an unauthenticated public upload endpoint, DB connections with SSL explicitly disabled, and inconsistent authorization checks between "legacy" and "new" versions of the same features. |
| **Scalability** | 42/100 | Schema mostly fine (indexed FKs), but recursive self-joins (`bq_line_item`, `bq_template_items`) with no depth guard, a dual data-access layer that will fragment connection pooling under load, and a hand-rolled `stage` state machine that isn't reflected in the schema. |
| **Maintainability** | 40/100 | Duplicate implementations of the same feature (RBAC, BQ upload, DB clients) multiply the surface area every future change has to touch. |
| **Architecture** | 44/100 | Reasonably conventional Next.js App Router layout; the debt is concentrated in cross-cutting concerns (auth, data access), not folder structure. |

These are not meant as precise metrics — treat them as "where to start worrying first" signals, in this order: **Security > Architecture (auth/data-access duplication) > Scalability > Maintainability > Debt.**

---

## 3. Findings

Format per the requested template. I've prioritized issues that are (a) verified in the actual code, and (b) structural rather than cosmetic. Line numbers are from the current `development` HEAD at time of audit.

---

### F1 — Two independent, disconnected RBAC systems in the same schema
**Severity:** Critical
**Category:** Architecture / Security / Data consistency
**Location:** `prisma/schema.prisma` — `role` (L564), `permission`, `role_permission` (singular family) **vs.** `roles` (L596), `permissions`, `role_permissions`, `user_roles` (L849) (plural family); consumed in `src/lib/auth.ts` L108–133.

**Problem:** The schema defines a full singular RBAC model (`role` → `role_permission` → `permission`) *and* a full plural RBAC model (`roles` → `role_permissions` → `permissions`, plus a many-to-many `user_roles` join table). `users.role_id` is a required FK into the **singular** `role` table. But `src/lib/auth.ts` (the actual login handler) fetches roles from `user_roles`/`roles` (the **plural**, many-to-many family) and puts `primaryRole.role_id` — which is a `roles.role_id`, not a `users.role_id` — into the session under the field name `role_id`. Downstream code (e.g. `src/app/api/bq/upload-new/route.ts` L38, `src/app/api/tenders/[id]/stage/route.ts`) then reads `session.user.role_id` and treats it as if it were the canonical role, with no idea it originates from the plural system.

**Why it matters:** The `role`/`permission`/`role_permission` tables appear to be dead — nothing in `src/lib` references them for authorization decisions — yet they're still a mandatory, non-nullable FK on every user row, meaning every user-creation path has to maintain a value that isn't actually used to authorize anything. Meanwhile, the *real* authorization data (`permissions`, `role_permissions`) is never queried either — see F2. This is exactly the "different implementations of the same feature" failure mode the review was designed to catch, and it's happening in the single most security-sensitive part of the system.

**Recommended solution:** Pick one model (the plural `roles`/`permissions`/`user_roles` family, since it's the one actually wired to login and supports multi-role users). Migrate `users.role_id` off the singular `role` table (either drop it or repoint it), drop `role`/`permission`/`role_permission`, and rename the session/JWT field from the overloaded `role_id` to something unambiguous like `primaryRoleId` to stop it colliding conceptually with `users.role_id`.

**Example implementation:** Add a Prisma migration that (1) backfills `roles`/`user_roles` from `role` if any records only exist there, (2) drops `role_permission`, `permission`, `role`, `roles_backup`, (3) renames `session.user.role_id` → `session.user.primaryRoleId` and updates the ~dozen call sites via a codemod/grep-and-replace, verified by a smoke-test login for each of the ~6-8 roles in the system.

**Potential side effects:** Any code silently depending on `users.role_id` (I didn't find any beyond the FK itself, but a full grep before dropping is essential) would break. Session shape change invalidates all existing JWTs — requires a coordinated deploy + forced re-login.

**Estimated effort:** L

---

### F2 — Authorization is enforced with hardcoded numeric role IDs in at least three different places, none of which use the `permissions` tables
**Severity:** Critical
**Category:** Security / Architecture
**Location:** `src/lib/permissions.ts` (`hasRole(roles, 1)` for Admin, `hasRole(roles, 13)` for Contractor, throughout); `src/app/api/tenders/[id]/stage/route.ts` L14–21 (`allowedAdvanceRoles` keyed by stage → `[1]`, `[10]`, `[6]`, `[1,10]`); `src/app/api/bq/upload-new/route.ts` L38 (`if (userRole !== 13)`).

**Problem:** Three separate, hand-maintained mappings of "which numeric role ID is allowed to do X" exist, using magic numbers (`1` = Admin, `6` = "FM RD", `10` = "Finance GM", `13` = Contractor) with no shared constant, enum, or lookup against the `permissions`/`role_permissions` tables that were clearly built to answer exactly this question generically.

**Why it matters:** If a new role is added, or an existing role's ID changes (e.g. after the F1 migration), there are at least three files that must be updated in lockstep, with nothing enforcing that they are. This is also brittle for the "role permissions become complex" scalability scenario explicitly called out in the review brief — the current design cannot express "Finance GM AND has the `tender.stage.advance` permission" without another hardcoded branch.

**Recommended solution:** Introduce a single `hasPermission(userId, 'tender:stage:advance')` function backed by the `role_permissions`/`permissions` tables (once consolidated per F1), and replace every `hasRole(roles, <magic number>)` / `userRole !== 13` check with it. Define role IDs as a named `enum`/const map in one file as an interim step if the full permission-table migration is phased.

**Example implementation:**
```ts
// lib/authz.ts
export async function hasPermission(userId: number, permissionKey: string): Promise<boolean> {
  const count = await prisma.role_permissions.count({
    where: {
      permissions: { resource_action_key: permissionKey }, // resource+action per schema
      roles: { user_roles: { some: { user_id: userId } } },
    },
  });
  return count > 0;
}
```
**Potential side effects:** Requires seeding `permissions`/`role_permissions` with real data for every check currently done by role ID — non-trivial data migration, and a period where both mechanisms must agree (recommend a shadow-mode comparison in staging before cutover).

**Estimated effort:** L

---

### F3 — Public file-upload endpoint with no authentication, no validation, and path-traversal-prone filenames
**Severity:** Critical
**Category:** Security
**Location:** `src/app/api/tenders/upload/route.ts` (entire file, ~15 lines)

**Problem:** This route:
- Has **no session/auth check at all** (contrast with `bq/upload-legacy` and `bq/upload-new`, which do call `getServerSession`).
- Performs **no file-type, MIME, or size validation**.
- Writes the file into `public/uploads/tenders/`, i.e. **directly web-servable, unauthenticated**, regardless of whether the associated tender is public.
- Builds the filename as `` `${uuidv4()}-${file.name}` `` using the client-supplied `file.name` verbatim — if `file.name` contains path segments (`../../`), behavior depends on the OS/`path.join` normalization, but this is exactly the pattern that causes path-traversal writes; it should never trust `file.name` structurally, only for display.

**Why it matters:** Anyone (no login required) can currently upload arbitrary content to the server, and anything uploaded is immediately publicly downloadable at a guessable-ish `/uploads/tenders/<uuid>-<name>` URL. On a system whose entire purpose is confidential tender/bid documents, this is the most severe finding in the audit.

**Recommended solution:** Require `getServerSession` + authorization (must be tied to an actual tender the user can act on); validate extension + MIME type against an allowlist (PDF/DOCX/XLSX/images only); cap file size; sanitize the filename to a UUID with the *extension* only (drop the original name from the path, store the original name only in DB metadata); move storage outside `public/` and serve via an authenticated route that checks tender access before streaming the file.

**Example implementation:**
```ts
const session = await getServerSession(authOptions);
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const ext = path.extname(file.name).toLowerCase();
if (!ALLOWED_EXT.includes(ext)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

const filename = `${uuidv4()}${ext}`;                     // no user-controlled name in the path
const uploadDir = path.join(process.env.PRIVATE_UPLOAD_DIR!, "tenders"); // outside /public
```
**Potential side effects:** Any current frontend flow relying on this endpoint being unauthenticated (e.g. an anonymous "express interest" attachment) will need a defined, legitimate access model instead of "no auth at all."

**Estimated effort:** M

---

### F4 — Raw database connections have SSL explicitly disabled
**Severity:** Critical
**Category:** Security
**Location:** `src/lib/db.ts` L9 — `ssl: false` (with a commented-out `rejectUnauthorized: false` line above it, showing this was a deliberate, considered choice, not an oversight).

**Problem:** The hand-rolled `pg.Pool` used by ~60 files (see F5) connects to PostgreSQL with `ssl: false` unconditionally — including whatever `NODE_ENV` is set to. Prisma's own client (`@prisma/client`) may negotiate TLS independently via the connection string, but this pool does not.

**Why it matters:** All query traffic through this pool — including password hashes fetched during login flows that don't go through Prisma, tender pricing (BQ line items), and PII — travels unencrypted between the app and DB. If the database is anywhere other than literally the same host (common for managed Postgres/RDS/Cloud SQL), this is credential- and data-exposure risk on the network path.

**Recommended solution:** Enable SSL conditionally based on environment (`ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false`), and prefer supplying a CA bundle rather than disabling verification.

**Estimated effort:** S

---

### F5 — Two parallel database access layers (raw `pg.Pool` and Prisma) with no clear ownership boundary, and schema drift between them
**Severity:** High
**Category:** Architecture / Data consistency
**Location:** `src/lib/db.ts` (raw pool, used in ~60 files) vs `src/lib/prisma.ts` (Prisma Client, used in ~30 files); confirmed drift: `src/app/api/tenders/[id]/stage/route.ts` selects/updates `tender.stage` and `tender.stage_updated_at`, **neither of which exists anywhere in `prisma/schema.prisma`**.

**Problem:** Roughly two-thirds of API routes talk to Postgres directly with hand-written SQL via `pg`; the rest go through Prisma. There's no documented rule for which to use when, and — critically — this has already caused schema/reality drift: the entire tender-stage workflow (arguably the core business process) operates on columns Prisma doesn't know about, meaning `prisma migrate`/`db pull` cannot be trusted as a source of truth, and any developer using Prisma's types for `tender` will not see `stage` at all.

**Why it matters:** This is a direct threat to the "10 developers working simultaneously" and "new modules added" scalability criteria in the brief — every new engineer has to learn *both* access patterns, and worse, cannot trust the schema file to reflect the database. Connection pooling is also being managed twice (Prisma's internal pool + this custom `pg.Pool` with `max: 20`), which under concurrent load can multiply total connections beyond what's actually budgeted for the DB tier.

**Recommended solution:** Run `prisma db pull` against the real database to regenerate a schema that includes `stage`/`stage_updated_at` (and anything else drifted), commit it, and set a team convention: Prisma for all CRUD, raw SQL only for genuinely complex reporting queries Prisma can't express well — behind a single query-builder module, not scattered `pool.query` calls.

**Estimated effort:** L

---

### F6 — Duplicate/legacy BQ upload endpoints with inconsistent authorization
**Severity:** High
**Category:** Logic inconsistency / Security
**Location:** `src/app/api/bq/upload-legacy/route.ts` vs `src/app/api/bq/upload-new/route.ts`

**Problem:** Both endpoints parse an uploaded Excel BQ (Bill of Quantities) file into line items for a tender submission — the same business function, implemented twice, with different column-mapping logic and, importantly, **different authorization rules**: `upload-legacy` only checks that a session exists; `upload-new` additionally requires `role_id === 13` (Contractor). If `upload-legacy` is still routable (nothing in the code marks it disabled/deprecated), non-contractor authenticated users can upload BQs through it that `upload-new` would reject.

**Why it matters:** This is the textbook "different implementations of the same feature" risk called out in the brief — bugs fixed in one won't be fixed in the other, and the security gap (missing role check) in the older path is live as long as it's reachable.

**Recommended solution:** Confirm whether `upload-legacy` is still linked from any UI; if not, delete it. If it must stay temporarily (e.g. for an old client integration), add the identical role check and file a ticket with a hard removal date.

**Estimated effort:** S–M

---

### F7 — Two contradictory Content-Security-Policy definitions
**Severity:** Medium-High
**Category:** Security / Configuration
**Location:** `next.config.ts` `headers()` (applies to `/:path*`) vs `src/proxy.ts` (Next's middleware, renamed `proxy.ts` in this Next version) (applies to page routes via nonce-based CSP).

**Problem:** `proxy.ts` builds a strict, nonce-based CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'`, no `unsafe-inline`/`unsafe-eval` in production). `next.config.ts` **also** sets a CSP header on the same routes, but its production policy explicitly allows `"script-src 'self' 'unsafe-inline' 'unsafe-eval'"` — the opposite of what the middleware is trying to enforce — and references a literal placeholder domain (`https://api.your-domain.com`) that was evidently never filled in.

**Why it matters:** Sending two CSP headers is technically handled by browsers (policies are intersected directive-by-directive), but this means the actual effective policy is not the one anyone can read from either file in isolation — it's whatever the intersection happens to compute to, which is fragile and will confuse the next person who tries to loosen or tighten it. The unfilled placeholder domain also suggests this config block was copy-pasted from a template and never revisited.

**Recommended solution:** Set CSP in exactly one place — `proxy.ts` is the better choice since it can generate a per-request nonce, which `next.config.ts`'s static headers cannot. Remove the CSP entry from `next.config.ts` entirely (keep the other static headers there if desired).

**Estimated effort:** S

---

### F8 — `tender.clauses` stores a multi-KB legal-text JSON blob as a Prisma column *default value*, baked directly into the schema/migration file
**Severity:** Medium
**Category:** Architecture / Data consistency
**Location:** `prisma/schema.prisma`, `tender.clauses` field default (the single longest line in the file — the full standard contract terms, scope-of-works clauses, and critical dates text for Singapore-market tenders, several KB of content).

**Problem:** The entire standard tender contract boilerplate (31 numbered terms, scope-of-works, critical dates, payment schedule, LD rates, etc.) is embedded as a JSON string literal default value on a database column, directly in the Prisma schema/migration.

**Why it matters:** Any change to standard contract wording (which is legal/business content, likely to be revised over time — e.g., updating the S$5,000/day LD rate, or the 90-day tender validity period) requires a **database migration** to a text blob buried inside a schema file, rather than an edit to a config file, CMS record, or admin-editable settings table. It also means every new tender created without an explicit override silently gets whatever text was frozen into that default at schema-authoring time, with no versioning of "which contract terms version applies to this tender" — a real risk for a system whose stated growth path includes hundreds of thousands of tenders across multiple organizations, each of which will likely need their own clause sets.

**Recommended solution:** Move standard clause content to a `contract_template` (or similar) table with its own versioning (`effective_from`, `version_id`), referenced by the tender via a foreign key, and populate `tender.clauses` explicitly at creation time from the active template rather than relying on a column default.

**Estimated effort:** M

---

### F9 — Duplicate/redundant indexes in the schema
**Severity:** Low-Medium
**Category:** Data consistency / Performance
**Location:** `prisma/schema.prisma`:
- `tender`: `idx_tender_is_deleted_status` and `idx_tender_status_lookup` are both `@@index([is_deleted, status_id])` — identical, defined twice under different names (L64–65).
- `bq_line_item`: `idx_bq_line_item_sub_cat` and `idx_bq_line_item_submission_category` are both `@@index([submission_id, category_id])` (L136, L138).
- `tender_submission`: `idx_submission_contractor_id` and `idx_tender_submission_contractor` are both `@@index([contractor_id])` (L812–813).

**Why it matters:** Each duplicate index doubles write-amplification (every insert/update maintains both) and storage for zero query benefit — small today, but compounding at the "millions of documents"/500k-tenders scale target explicitly named in the brief. It's also a signal that indexes have been added ad hoc over time (likely by different contributors or AI-assisted edits) without checking what already exists — worth a one-time full index audit against actual query plans (`pg_stat_user_indexes`) rather than guesswork.

**Recommended solution:** Drop one of each duplicate pair via migration; before dropping, check `pg_stat_user_indexes.idx_scan` in the real DB to confirm which (if either) name is referenced anywhere by convention/tooling.

**Estimated effort:** S

---

### F10 — Two "backup" tables committed as live schema models (`roles_backup`, `users_backup`)
**Severity:** Low-Medium
**Category:** Architecture / Data consistency / Security
**Location:** `prisma/schema.prisma` L609 (`roles_backup`), L937 (`users_backup`), both marked `@@ignore` (Prisma won't generate client methods, but the tables/columns are still tracked in the schema and presumably exist in the DB).

**Problem:** `users_backup` duplicates the **entire** `users` table structure, including `password_hash`. Ad hoc "just in case" backup tables living alongside production tables (rather than actual DB snapshots/backups) are a known anti-pattern: they're rarely kept in sync, nobody owns a retention/deletion policy for them, and — worst case here — a stale password-hash dump sitting in a table with looser access review than the primary `users` table is a real exposure if row-level access control differs at all between the two.

**Recommended solution:** If these exist for a real historical reason, export their contents to an actual backup/cold-storage mechanism (S3 snapshot, pg_dump, etc.) and drop the tables from the live schema. If they're leftovers from a migration/incident, confirm no code references them (the `@@ignore` suggests none does) and drop them.

**Estimated effort:** S

---

### F11 — Zero automated test coverage
**Severity:** High
**Category:** Test coverage
**Location:** Repo-wide — no `*.test.ts(x)`, `*.spec.ts(x)`, `jest.config.*`, `vitest.config.*`, or `playwright.config.*` found anywhere; `package.json` has no `test` script and no testing framework in `devDependencies`.

**Why it matters:** For a system whose core function is financial/contractual (tender awards, contract sums, liquidated-damages clauses), there is currently no automated safety net for the workflow state machine (F-item on stage transitions above), authorization logic (F1/F2), or the BQ pricing calculations. Every refactor recommended in this report — consolidating RBAC, unifying DB access, fixing the upload endpoint — currently has to be verified by hand, which both slows the fixes down and makes regressions likely.

**Recommended solution:** Introduce Vitest (fast, works well with Next.js/TS) starting with the highest-risk, highest-value areas first: (1) `lib/permissions.ts` and the future `hasPermission`, (2) the tender stage-transition state machine (valid/invalid transitions per role), (3) BQ line-item total calculations. Add Playwright for a small number of critical E2E flows (login, create tender, submit bid, award) once unit coverage exists.

**Estimated effort:** L (ongoing)

---

### F12 — Unused/duplicate dependencies
**Severity:** Low
**Category:** Dependency analysis / Code quality
**Location:** `package.json`

**Problem:**
- `bcrypt` **and** `bcryptjs` are both dependencies; only `bcrypt` is imported anywhere in `src`. `bcryptjs` is dead weight (and a native-vs-pure-JS pair like this is a classic source of "why doesn't this hash verify" bugs if someone ever imports the wrong one).
- `jsonwebtoken` is a dependency but has zero imports in `src` — NextAuth handles JWT internally. Dead dependency (or a sign that a custom-JWT code path existed and was removed without cleaning up `package.json`).
- `@upstash/ratelimit` + `@upstash/redis` are installed and `src/lib/rate-limit.ts` exists, but **nothing else in the codebase imports it** — meaning there is currently no rate limiting actually applied to any route (login included), despite the tooling being present. This is worth calling out separately from "unused dependency" because the login endpoint (`authOptions.authorize`) has no rate limiting beyond the 5-attempt account lockout, which is per-account, not per-IP — a distributed credential-stuffing attempt across many usernames from one IP is not slowed down at all.
- `@prisma/client`/`prisma` are pinned to `^5.22.0` while `@prisma/adapter-pg` is pinned to `^7.8.0` — these are different Prisma major-version lines; worth confirming this resolves/works as intended rather than silently no-op'ing the adapter.

**Recommended solution:** Remove `bcryptjs` and `jsonwebtoken`. Wire `src/lib/rate-limit.ts` into at minimum the login route (per-IP + per-username) and password-reset endpoints. Verify (and if needed pin) compatible major versions for `@prisma/client` and `@prisma/adapter-pg`.

**Estimated effort:** S

---

### F13 — Extensive `console.log`/`console.error` debug output left in permission and error-handling code
**Severity:** Low
**Category:** Code quality / Sensitive logging
**Location:** `src/lib/permissions.ts` `canEditSubmission()` — 5 `console.log` calls per invocation logging `submissionId`, `userId`, `roleIds`, and the intermediate `owns`/`isDraft`/`isLatest` booleans on every permission check.

**Why it matters:** Not a secrets leak (no passwords/tokens found logged — that part is clean), but this is verbose debug instrumentation firing on a hot path in production, which both pollutes logs at any meaningful traffic volume and hints these checks were being actively debugged rather than finished. Worth a pass to convert to structured, level-gated logging (`debug` level, off by default in prod) or removing entirely once confidence in the logic is established.

**Recommended solution:** Replace with a proper logger (e.g. `pino`) at `debug` level, or delete.

**Estimated effort:** S

---

### F14 — Ad hoc `stage` integer state machine, undocumented in the schema, running in parallel with the formal `tender_status` table
**Severity:** Medium-High
**Category:** Tender workflow validation / Data consistency
**Location:** `src/app/api/tenders/[id]/stage/route.ts`

**Problem:** The real production tender workflow is: `Submission(0) → Finance GM Viewing(1) → FM RD Viewing(2) → Cost Comparison(3) → FM RD Final Viewing(4) → Award(5) → Closed(6+)`, encoded as a bare integer (`tender.stage`, not in the Prisma schema — see F5) with hand-written `allowedAdvanceRoles`/`getStatusCodeForStage` maps. Meanwhile, the schema also has a fully-modeled `tender_status` table with its own `status_code`, `label`, and `sort_order` — exactly the shape you'd want to drive a workflow off of — but it's used only as a coarse `Upcoming/Open/Closed` bucket derived *from* the stage number, not as the source of truth.
Additionally, `revert` lets an admin move a tender backward through any stage (including from `Award(5)` back to `4`) with no check on whether a `tender_award` record already exists for that tender — so a tender can end up in a pre-award stage while an award row still references it as awarded.

**Why it matters:** This is precisely the "impossible transitions" risk called out in the brief's tender-workflow section — not because forward transitions are wrong, but because (a) the state machine's source of truth (a raw integer) is invisible to the schema/ORM, and (b) reverts don't cascade to dependent records, so `stage` and `tender_award` can silently disagree about whether a tender is awarded.

**Recommended solution:** Model stages as an explicit enum/lookup table (extend `tender_status` to be the single source of truth, including for reverts), and make `revert` transactionally clean up/void dependent records (or refuse to revert past a point where an award exists, unless the award is explicitly voided in the same transaction).

**Estimated effort:** M

---

### F15 — Documentation is default boilerplate; no real README, no setup instructions matching the actual stack
**Severity:** Low-Medium
**Category:** Documentation
**Location:** `README.md` (still the unmodified `create-next-app` template — no mention of Prisma, Postgres, environment variables, or the auth/RBAC model); `find-role-checks.js` (a one-off grep script for `role_name`/`roleName` left committed at the repo root — itself evidence the team already suspects the role-naming inconsistency documented in F1/F2, but no findings/fix were captured anywhere).

**Why it matters:** A new developer (or the "10 developers working simultaneously" scenario in the brief) has no documented path to get a working local environment (`DATABASE_URL`, seed data, which of the two RBAC tables to trust), and no record that the role-naming problem was already known internally — meaning this audit is likely rediscovering something the team already suspected without ever writing it down or fixing it.

**Recommended solution:** Replace `README.md` with real setup docs (env vars required, DB setup/seed steps, auth model explanation once F1 is resolved). Remove `find-role-checks.js` from the repo root (or move it into a documented `scripts/` maintenance-tools folder) once the underlying inconsistency it was investigating is fixed.

**Estimated effort:** S

---

## 4. Tender Workflow Validation — Note on Scope

The brief's example lifecycle (`Draft → Internal Review → Published → Vendor Submission → Evaluation → Clarification → Recommendation → Awarded → Contract → Closed`) does **not** match the actual implemented workflow, which is the stage-numbered process in F14 (`Submission → Finance GM Viewing → FM RD Viewing → Cost Comparison → FM RD Final Viewing → Award → Closed`). That's expected — the example was illustrative — but it means the workflow-consistency analysis had to be done against the real stage machine rather than the example, and that's what F14 covers. I did not find code implementing "Internal Review," "Clarification," or "Contract" as distinct states; if those are intended future states, they don't exist yet, which is worth confirming against product requirements rather than treating as a bug.

---

## 5. Scalability Assessment Against Stated Targets

| Scenario from brief | Current readiness | Notes |
|---|---|---|
| 10 developers working simultaneously | **Weak** | F1/F2/F5/F6 mean there are 2–3 "right ways" to do auth and data access at once; without a documented convention, concurrent development will keep adding a 4th variant. |
| 500,000 tenders | **Moderate** | Most FK-heavy tables have indexes on `is_deleted`/status lookups; F9's duplicate indexes are a (currently minor) cost that compounds at this volume; the JSON `clauses` blob (F8) per tender is fine at this scale storage-wise but painful operationally if it ever needs a bulk update. |
| Millions of documents | **Unverified/at-risk** | Document storage goes through the flawed upload path in F3 (filesystem-based, `public/` served) — this does not scale operationally (no CDN offload, no per-file access control) regardless of raw volume; recommend object storage (S3-compatible) with signed URLs before volume grows. |
| Thousands of concurrent users | **At-risk** | Two independent connection pools (Prisma + custom `pg.Pool` with `max: 20`, F5) make total DB connection usage hard to reason about and cap; no rate limiting live anywhere (F12) means concurrent load includes unthrottled abuse potential. |
| Multiple organizations | **Not yet modeled** | I found no `organization_id`/tenant column on `tender`, `users`, or `branch` — the current model is single-tenant (branches/brands within one org). Multi-org would need a tenancy column threaded through essentially every table and every query in both data-access layers — significant, but more tractable if F5 is resolved first (one access layer to add tenancy checks to, not two). |
| Complex role permissions | **Not ready** | Directly blocked by F1/F2 — the permission tables built for this don't drive any actual authorization decision today. |
| New modules added | **Moderate** | Folder structure (`src/app/api/<domain>/...`) is conventional and extends reasonably; the risk is new modules copying the existing dual-auth/dual-DB pattern rather than a clean one, compounding F1/F2/F5. |

---

## 6. Top Issues (Priority Order)

1. F3 — Unauthenticated public upload endpoint (Critical, security)
2. F4 — DB SSL disabled (Critical, security)
3. F1 — Dual RBAC schema (Critical, architecture/security)
4. F2 — Hardcoded role-ID authorization in 3+ places (Critical, security)
5. F5 — Dual DB access layer + confirmed schema drift on `tender.stage` (High, architecture)
6. F6 — Duplicate BQ upload endpoints, inconsistent auth (High, security)
7. F11 — Zero test coverage (High, quality/risk)
8. F14 — Ad hoc stage state machine / award-revert consistency gap (Medium-High, workflow)
9. F7 — Contradictory CSP definitions (Medium-High, security/config)
10. F8 — Contract clause text baked into schema default (Medium, architecture)
11. F10 — Live "backup" tables incl. password hashes (Medium, security)
12. F9 — Duplicate indexes (Medium, performance/data)
13. F12 — Unused deps + unused rate-limiter + no login rate limiting (Medium, dependency/security)
14. F15 — Boilerplate docs, undocumented known issues (Low-Medium, docs)
15. F13 — Debug logging on hot path (Low, quality)
16–20. Not yet deep-dived in this pass (flagged for a follow-up session, see §7): UI component consistency across `src/components/{tenders,admin,capex,bq,privacy,ui}`; full API response-shape/error-format consistency across all ~25 API sub-routes (only 1 route found using `page`/`limit`/`skip`/`take` — pagination appears to be the exception, not the norm, across list endpoints, which will matter directly at the "500,000 tenders" scale target); API versioning (none found — no `/v1/` etc., meaning any breaking API change has no migration path); accessibility of the `src/components/ui` primitives; N+1 query risk in whichever list endpoints call Prisma `include` inside loops (not yet checked file-by-file).

---

## 7. Refactoring Roadmap

**Phase 1 — Critical (do before any further feature work touching auth, uploads, or the DB layer)**
- Lock down or fix `src/app/api/tenders/upload/route.ts` (F3)
- Fix `ssl: false` in `src/lib/db.ts` (F4)
- Decide and document the canonical RBAC model; stop new code from touching the losing side (F1 groundwork)
- Wire `rate-limit.ts` into login + password reset (F12, partial)

**Phase 2 — Important (structural, needs a real migration plan)**
- Execute the F1 RBAC consolidation migration
- Replace hardcoded role-ID checks with `hasPermission()` (F2)
- Reconcile schema with reality via `prisma db pull`; bring `tender.stage` into the ORM (F5)
- Resolve F6 (delete or fix `upload-legacy`)
- Fix F7 (single CSP source)
- Start F11 (unit tests for permissions + stage machine + BQ totals, as the riskiest logic to touch during Phase 2 itself)

**Phase 3 — Enhancement**
- Move contract clauses to a real templated/versioned table (F8)
- Drop duplicate indexes and backup tables (F9, F10)
- Clean up dependencies and debug logging (F12 remainder, F13)
- Real README/setup docs (F15)
- Formalize the stage/state-machine + award-revert consistency (F14)

**Phase 4 — Future Scaling**
- Object storage (S3-compatible) for documents instead of `public/uploads` (ties into F3's fix but is the longer-term scale answer)
- Multi-tenancy column + query-layer changes if multi-organization support is actually on the roadmap
- API versioning strategy and consistent pagination across all list endpoints
- Full UI/API consistency pass (component library audit, response-shape standardization) — recommend as a dedicated follow-up review once Phases 1–2 land, since a lot of that surface will change shape anyway once the DB-access and auth consolidation happens

---

## 8. What This Pass Did Not Cover (be aware, don't assume clean)

- Line-by-line review of all 208 files — this pass targeted cross-cutting risk areas.
- `src/components/**` UI consistency, accessibility, and responsive-design review.
- Full N+1 query audit across all API routes.
- Runtime/production environment configuration (actual `DATABASE_URL`, deployed CSP behavior, actual Vercel/host config) — config code was reviewed, not a live deployment.
- Full dependency vulnerability scan (recommend `npm audit` / Snyk / Dependabot as a fast, cheap follow-up — not run here since it requires network access to npm's advisory DB in a way that goes beyond this session's scope).

I'm happy to go deeper on any single area above (e.g., a full pass on `src/components` for UI consistency, or a proper `npm audit`/dependency vulnerability scan, or drafting the actual Prisma migration for F1) — just say which one.
