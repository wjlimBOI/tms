// lib/db.ts
import { Pool, PoolClient } from 'pg';
import fs from 'fs';

// Note: this only controls SSL for the raw `pg.Pool` used by `query`/
// `getClient` below. Prisma-based routes (src/lib/prisma.ts) get their SSL
// behavior entirely from the `DATABASE_URL` connection string's `sslmode`
// param, not from this file — so production `DATABASE_URL` must also carry
// a proper `sslmode` (e.g. `verify-full`) for full coverage.
function getSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    console.warn(
      'WARNING: DB_SSL_REJECT_UNAUTHORIZED=false — Postgres SSL certificate verification is DISABLED. ' +
        'This should only ever be used temporarily; the connection is vulnerable to MITM attacks.'
    );
    return { rejectUnauthorized: false };
  }

  const caPath = process.env.DB_SSL_CA_PATH;
  if (caPath) {
    try {
      const ca = fs.readFileSync(caPath, 'utf8');
      return { rejectUnauthorized: true, ca };
    } catch (err) {
      // Fail fast at startup rather than silently falling back to an
      // unverified connection.
      throw new Error(
        `DB_SSL_CA_PATH is set to "${caPath}" but the file could not be read: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Verify against the OS/system trust store — correct default for
  // managed Postgres providers with publicly-trusted certs.
  return { rejectUnauthorized: true };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                       // maximum number of clients in the pool
  idleTimeoutMillis: 30000,      // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection cannot be established
  ssl: getSslConfig(),
});

// Optional: handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Helper to execute queries (uses pool directly)
export const query = (text: string, params?: any[]) => pool.query(text, params);

// Helper to get a client from the pool (for transactions)
export const getClient = (): Promise<PoolClient> => pool.connect();

// Helper to get the pool itself (if needed for advanced use)
export const getPool = (): Pool => pool;

// Thrown inside a withTransaction() callback to abort with a specific HTTP
// response (e.g. a validation failure found mid-transaction) instead of a
// generic 500. withTransaction() still rolls back before rethrowing; the
// caller's own catch block is responsible for turning this into a
// NextResponse, e.g.:
//
//   } catch (err) {
//     if (err instanceof TransactionAbortError) {
//       return NextResponse.json({ error: err.message }, { status: err.status });
//     }
//     ...
//   }
export class TransactionAbortError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'TransactionAbortError';
  }
}

// Standardises BEGIN/COMMIT/ROLLBACK/release around a single pooled client.
// New and touched code should prefer this over hand-rolled
// getClient()/BEGIN/COMMIT/ROLLBACK blocks; existing call sites are not
// required to migrate. The callback receives the client to run queries on
// and must not call BEGIN/COMMIT/ROLLBACK itself — throw (optionally a
// TransactionAbortError) to roll back, or return normally to commit.
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed after transaction error:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

// Default export for convenience
export default pool;