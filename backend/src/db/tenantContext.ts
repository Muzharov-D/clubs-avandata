import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { pool } from './client.js';
import * as schema from './schema/index.js';

/**
 * Acquire a dedicated PG connection, SET app.tenant_id on it,
 * run callback with a tenant-scoped Drizzle client, then release.
 *
 * All RLS-protected tables filter via current_setting('app.tenant_id').
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    conn.release();
  }
}

/**
 * Run as platform_admin (bypass RLS). Use only for admin operations.
 * Caller must ensure the requester is authenticated platform_admin.
 */
export async function withBypassRLS<T>(
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query(`SET LOCAL row_security = off`);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    conn.release();
  }
}
