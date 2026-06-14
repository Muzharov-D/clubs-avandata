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
    // Явно гасим bypass-флаг: под FORCE RLS политика tenant_isolation пускает
    // строки только если app.bypass_rls != 'on'. Connection из пула мог унаследовать
    // 'on' от предыдущей admin-операции — сбрасываем.
    await conn.query(`SELECT set_config('app.bypass_rls', 'off', false)`);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    try {
      await conn.query(`SELECT set_config('app.tenant_id', '', false)`);
      await conn.query(`SELECT set_config('app.bypass_rls', 'off', false)`);
    } catch { /* ignore */ }
    conn.release();
  }
}

/**
 * Как withTenant, но оборачивает callback в одну транзакцию (BEGIN/COMMIT, при
 * ошибке ROLLBACK). Все записи внутри атомарны: либо весь набор, либо ничего —
 * никаких частичных состояний при обрыве на середине цикла/между INSERT'ами.
 *
 * SET app.tenant_id ставится сессионно (is_local=false) ДО BEGIN, поэтому RLS
 * действует и внутри транзакции, а ROLLBACK его не сбрасывает (reset в finally
 * у withTenant отработает на чистом соединении).
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(tenantId, async (tx, conn) => {
    await conn.query('BEGIN');
    try {
      const result = await fn(tx, conn);
      await conn.query('COMMIT');
      return result;
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    }
  });
}

/**
 * Run as platform_admin (bypass RLS). Use only for admin operations.
 * Caller must ensure the requester is authenticated platform_admin.
 *
 * Под FORCE RLS `SET row_security=off` владельцем игнорируется — поэтому bypass
 * выражен явным флагом app.bypass_rls='on', который читает политика tenant_isolation.
 * Сбрасываем в finally, чтобы переиспользованный из пула connection не унаследовал.
 */
export async function withBypassRLS<T>(
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query(`SET row_security = on`);
    await conn.query(`SELECT set_config('app.bypass_rls', 'on', false)`);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    try {
      await conn.query(`SELECT set_config('app.bypass_rls', 'off', false)`);
    } catch { /* ignore */ }
    conn.release();
  }
}

/**
 * Run as a regional federation (federation_admin) — read-only, region-scoped.
 *
 * Ставит app.bypass_rls='on' (федерация читает МНОГО клубов сразу + bypass-only
 * federation_tenants/federations) и app.federation_id=slug. РЕАЛЬНАЯ изоляция
 * региона — НЕ через RLS, а на уровне запроса: каждый федеративный SELECT обязан
 * включать `FED_MEMBERSHIP_SQL` (фильтр tenant_id по членству, читает
 * app.federation_id). Без этого фрагмента запрос вернёт чужие клубы — поэтому он
 * обязателен и проверяется тестом изоляции (Story 0.7). Сбрасываем оба флага в
 * finally, чтобы переиспользованный из пула connection не унаследовал контекст.
 *
 * Read-only — соглашением: федеративные роуты не выставляют write-путей.
 */
export async function withFederation<T>(
  federationSlug: string,
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query(`SET row_security = on`);
    await conn.query(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await conn.query(`SELECT set_config('app.federation_id', $1, false)`, [federationSlug]);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    try {
      await conn.query(`SELECT set_config('app.bypass_rls', 'off', false)`);
      await conn.query(`SELECT set_config('app.federation_id', '', false)`);
    } catch { /* ignore */ }
    conn.release();
  }
}
