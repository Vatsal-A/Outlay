import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render/Railway managed Postgres typically requires SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Unexpected errors on idle clients — log and let the process manager restart if needed
  console.error('Unexpected Postgres pool error:', err);
});

/**
 * Small query helper so callers don't need to check out/release clients
 * for simple, single-statement queries.
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Use for multi-statement transactions (e.g. creating a transaction row
 * and updating a recurring group in the same unit of work).
 */
export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
