import { pgTable, bigserial, text, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { users } from './users.js';

/**
 * Конструктор кабинета: per-user видимость блоков/графиков по страницам.
 * Одна строка на пользователя; весь конфиг в `layout`:
 *   { "<pageId>": { "<blockId>": false } }  (false = скрыто; отсутствие = видимо)
 * Таблица + RLS создаются в drizzle/0010_dashboard_layouts.sql.
 */
export const dashboardLayouts = pgTable(
  'dashboard_layouts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    layout: jsonb('layout').notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('dashboard_layouts_tenant_user_uq').on(t.tenantId, t.userId)],
);

export type DashboardLayout = typeof dashboardLayouts.$inferSelect;
export type DashboardLayoutInsert = typeof dashboardLayouts.$inferInsert;
