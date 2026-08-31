# Database access policy

PostgreSQL is the only application database, accessed through two deliberate
mechanisms — see `AGENTS.md` §0/§7 for the full rationale (this doc doesn't
repeat it). Quick reference:

- **Prisma** (`src/lib/prisma.ts`) — simple CRUD, admin/RBAC/auth,
  straightforward relational queries, typed `select`/`include`.
- **Raw `pg`** (`src/lib/db.ts`, `query`/`getClient`/`withTransaction`) —
  complex joins/CTEs/unions, reporting, BQ comparison, bulk operations,
  performance-sensitive or explicit-transaction workflows.

Match whatever the surrounding/related route already does; don't introduce a
third data-access mechanism without explicit justification.

## Transactions

`src/lib/db.ts` exports `withTransaction(fn)`, which standardises
`BEGIN`/`COMMIT`/`ROLLBACK`/`release` around a single pooled client:

```ts
import { withTransaction, TransactionAbortError } from '@/lib/db';

const result = await withTransaction(async (client) => {
  const row = await client.query(/* ... */);
  if (row.rows.length === 0) {
    throw new TransactionAbortError('Tender not found', 404);
  }
  await client.query(/* ... */);
  return row.rows[0];
});
```

`fn` must not call `BEGIN`/`COMMIT`/`ROLLBACK` itself. Throw to roll back —
`TransactionAbortError(message, status)` when the route needs a specific
HTTP status/message, or any other error for a generic failure — and catch it
in the route's own `try/catch` to build the `NextResponse`.

This is for **new and touched code only**. Existing hand-rolled
`getClient()`/`BEGIN`/`COMMIT`/`ROLLBACK` blocks (e.g.
`src/app/api/tenders/[id]/award/route.ts`) are not required to migrate —
follow the project's "touch it when you modify it" convention (`AGENTS.md`
non-negotiables #2/#13/#17).

## Rules

1. All raw SQL must use parameterized queries (no string-built SQL).
2. Transactions use a single client for their whole lifetime — never mix a
   pooled `query()` call and a transaction client for the same operation.
3. Don't mix Prisma and `pg` operations inside one logical transaction.
4. Database access should move out of route handlers into
   services/repositories gradually, only in modules already being modified —
   not as a standalone refactor pass.
