import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import * as schema from './schema/index.js';

const isLocalhost =
  env.DATABASE_URL.includes('@localhost') || env.DATABASE_URL.includes('@127.0.0.1');

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Render PG требует SSL, но использует self-signed cert — отключаем verify.
  // Локальный Postgres SSL обычно не использует.
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
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
