// lib/db.ts
import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                       // maximum number of clients in the pool
  idleTimeoutMillis: 30000,      // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection cannot be established
//  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  ssl:false,
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

// Default export for convenience
export default pool;