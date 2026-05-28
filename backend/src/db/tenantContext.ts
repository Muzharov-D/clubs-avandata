import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { pool } from './client.js';
import * as schema from './schema/index.js';

/**
 * Acquire a dedicated PG connection, SET app.tenant_id on it,
 * run callback with a tenant-scoped Drizzle client, then RESET.
 *
 * Используем `set_config(name, value, is_local=false)` — session-scoped,
 * иначе без транзакции `is_local=true` это no-op. В finally сбрасываем
 * чтобы next user тот же connection не унаследовал tenant context.
 *
 * Дополнительно ставим row_security=on (явно) — на случай если admin-сессия
 * выключила его в этом connection ранее.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query(`SET row_security = on`);
    await conn.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    try {
      await conn.query(`SELECT set_config('app.tenant_id', '', false)`);
    } catch { /* ignore */ }
    conn.release();
  }
}

/**
 * Run as platform_admin (bypass RLS). Use only for admin operations.
 * Caller must ensure the requester is authenticated platform_admin.
 *
 * SET row_security=off + сбрасываем в finally (чтобы next user не унаследовал).
 */
export async function withBypassRLS<T>(
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query(`SET row_security = off`);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    try {
      await conn.query(`SET row_security = on`);
    } catch { /* ignore */ }
    conn.release();
  }
}
