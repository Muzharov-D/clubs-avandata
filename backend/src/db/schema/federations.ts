import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Региональная федерация — слой регулятора над клубами-тенантами (ФФСПб и т.п.).
 * `slug` = идентификатор (как у tenants). НЕ tenant-scoped: доступ только через
 * bypass-контекст — platform_admin пишет (withBypassRLS), федерация читает
 * (withFederation, ставит app.bypass_rls='on'). Таблица + RLS (fail-closed
 * bypass-only) создаются в drizzle/0011_federations.sql.
 */
export const federations = pgTable('federations', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  region: text('region').notNull(),
  parentBody: text('parent_body'),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  brand: jsonb('brand').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type Federation = typeof federations.$inferSelect;
export type FederationInsert = typeof federations.$inferInsert;
