/**
 * Гейт «код ⇄ миграция» (Phase 1).
 *
 * Инцидент логина (500): код был задеплоен с Drizzle-колонками, которых ещё не
 * было в БД (миграция не применилась). Drizzle `select()` тянет ВСЕ колонки
 * схемы → SQL-ошибка → 500 на любом запросе, читающем эту таблицу.
 *
 * Этот скрипт ловит ровно тот класс: после прогона миграций сверяет, что КАЖДАЯ
 * колонка из Drizzle-схемы реально существует в БД. Если в схеме есть колонка,
 * которой нет в таблице — падаем с ненулевым кодом, и CI краснеет ДО деплоя.
 *
 * Запуск (CI): build → db:migrate → node scripts/check-schema-drift.mjs
 */
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from '../dist/db/schema/index.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
let drift = 0;
let checked = 0;

for (const exp of Object.values(schema)) {
  if (!is(exp, PgTable)) continue;
  const table = getTableName(exp);
  const cols = getTableColumns(exp);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table],
  );
  const dbCols = new Set(rows.map((r) => r.column_name));
  if (dbCols.size === 0) {
    console.error(`✗ table "${table}" not found in DB`);
    drift++;
    continue;
  }
  for (const col of Object.values(cols)) {
    checked++;
    if (!dbCols.has(col.name)) {
      console.error(`✗ DRIFT: ${table}.${col.name} exists in Drizzle schema but NOT in DB`);
      drift++;
    }
  }
}

await pool.end();

if (drift > 0) {
  console.error(`\n❌ schema drift: ${drift} issue(s). Add a migration before deploying.`);
  process.exit(1);
}
console.log(`✓ no schema drift — ${checked} columns verified against DB`);
