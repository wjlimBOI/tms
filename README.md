# Tender Management System (TMS)

Internal system for managing renovation/fit-out tenders: publishing tenders,
contractor bid submissions (BQ line items), stage-based review workflow,
awards, and extensions.

**Stack:** Next.js 16 (App Router) · NextAuth v4 (credentials/JWT) · Prisma 5
+ raw `pg` (see note below) · PostgreSQL

## Getting started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables** — copy `.env.example` if present, or
   create `.env` with at least:

   | Variable | Required | Purpose |
   |---|---|---|
   | `DATABASE_URL` | Yes | Postgres connection string |
   | `NEXTAUTH_SECRET` | Yes | NextAuth JWT signing secret |
   | `NEXTAUTH_URL` | Yes | Base URL used in emailed links (password reset, notifications) |
   | `LOCAL_ENCRYPTION_KEY` | Yes | Symmetric key for `src/lib/encryption.ts` (AES-256-GCM). Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Once real encrypted data exists, never change this value — doing so makes that data permanently undecryptable. |
   | `ALLOWED_ORIGINS` | No | Comma-separated CORS allowlist (defaults to localhost) |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | For email features | Outbound mail (stage notifications, tender requests, password reset) |
   | `TEAM_EMAIL` | For tender-requests | Notification recipient |
   | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | Enables rate limiting (login, password reset, AI description generation); without these, rate limiting is a no-op |
   | `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | No | Rate limit tuning (defaults: 60000ms / 100 requests) |
   | `ANTHROPIC_API_KEY` | For AI description generation | Powers "Generate with AI" on the tender description field (`src/app/api/tenders/generate-description`) |
   | `CRON_SECRET` | For scheduled jobs | Bearer token required by `GET /api/cron/run` (tender stage transitions, DLP/submission-deadline reminders). Endpoint refuses all requests if unset. Trigger hourly (or per host cron limits) via `vercel.json` on Vercel, or an external `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/run` cron line otherwise. |

   The four "Yes" (required) variables are validated at server startup by
   `src/instrumentation.ts` — if any are missing, the server refuses to
   start and prints exactly which ones, instead of failing confusingly at
   whatever request first happens to touch the missing value. A basic
   unauthenticated health check (DB connectivity only) is available at
   `GET /api/health` for load balancers/uptime monitors.

3. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push   # or apply migrations if you have a migration history
   ```
   `prisma/schema.prisma` is hand-maintained against the real DB — if you
   suspect drift, `npx prisma db pull` against a real environment and diff
   before trusting the file blindly.

4. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

5. **Run tests**
   ```bash
   npm test
   ```
   Vitest-based; still early (see `src/lib/roles.test.ts`,
   `src/lib/permissions.test.ts`). Most coverage still needs to be written —
   don't take a green test run as proof the app works end-to-end.

## Auth & authorization model

See **[`docs/rbac.md`](docs/rbac.md)** — this is required reading before
touching any authorization code. Short version: role IDs are canonical via
the `roles` / `user_roles` / `permissions` / `role_permissions` tables;
named constants live in `src/lib/roles.ts` (`ROLE_IDS`). Do not hardcode
numeric role IDs in new code.

## Data access

Two data-access layers coexist: Prisma Client (`src/lib/prisma.ts`) and a
raw `pg.Pool` (`src/lib/db.ts`, exposed as `query`/`getClient`). There's no
firm rule yet for which to use where — check how the surrounding route
already does it before picking one for a new endpoint. Don't assume
`prisma/schema.prisma` is a complete picture of the live database; verify
against the real DB when in doubt.

## API conventions

See **[`docs/api-conventions.md`](docs/api-conventions.md)** for the
versioning strategy and the pagination convention (`src/lib/pagination.ts`)
new list endpoints should use.

## Known architectural notes

- `TMS-Architecture-Security-Audit.md` (repo root) has the full findings
  history and rationale behind decisions like the RBAC consolidation.
- `docs/rbac.md` tracks the RBAC migration state and what's still open.
- Contract clause text (`tender.clauses`) is now sourced from a versioned
  `contract_template` table at tender-creation time, not a schema default —
  see `contract_template` in `prisma/schema.prisma` and the `POST` handler
  in `src/app/api/tenders/route.ts`.
