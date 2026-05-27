import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import * as schema from './schema/index.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[pg pool error]', err);
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type DB = typeof db;
export type DbSchema = typeof schema;

export async function closePool() {
  await pool.end();
}
