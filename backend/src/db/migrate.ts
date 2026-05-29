import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';
import { logger } from '../shared/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'drizzle');

// Фиксированный id для pg advisory lock — чтобы при scale>1 два инстанса не
// накатывали миграции одновременно на старте.
const MIGRATION_LOCK_ID = 873_214_567;

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM _migrations ORDER BY id`,
  );
  return new Set(rows.map((r) => r.name));
}

async function listMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

/**
 * Применяет все непримененные миграции из drizzle/*.sql.
 * Идемпотентно (трекинг в _migrations), безопасно для повторного вызова.
 * Вызывается И из CLI (`npm run db:migrate`), И из server.ts на старте —
 * чтобы схема всегда соответствовала коду, независимо от того, какой start-команды
 * использует хостинг (Render dashboard может переопределять Dockerfile CMD).
 */
export async function runMigrations(): Promise<void> {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await ensureMigrationsTable();
    const applied = await appliedMigrations();
    const files = await listMigrationFiles();
    if (files.length === 0) {
      logger.warn({ dir: MIGRATIONS_DIR }, 'no migration files found — проверь, что drizzle/ в образе');
    }

    for (const file of files) {
      if (applied.has(file)) {
        logger.debug({ file }, 'migration already applied');
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      logger.info({ file }, 'applying migration');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        logger.info({ file }, 'migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, file }, 'migration failed');
        throw err;
      } finally {
        client.release();
      }
    }
    logger.info('all migrations applied');
  } finally {
    try {
      await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } catch {
      /* ignore */
    }
    lock.release();
  }
}

// CLI-режим: `npm run db:migrate` / `node dist/db/migrate.js`.
// Guard по argv: при `import` из server.ts этот блок НЕ выполняется.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      logger.error({ err }, 'migration runner failed');
      process.exit(1);
    });
}
