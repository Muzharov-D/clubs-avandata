import { pgTable, bigserial, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Недельные снимки состояния когорт Первенства — основа «недельного радара» (Фаза B).
 * Регион-wide (НЕ tenant-scoped, без RLS): одна региональная картина на всех. INSERT-only
 * история — diff этой недели против прошлой даёт «За неделю» (Фаза C). payload — компактный
 * срез когорты: таблица всех дивизионов (id/имя/место/очки/разница) + рейтинг по клубу.
 */
export const federationSnapshots = pgTable(
  'federation_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    season: integer('season').notNull(),
    birthYear: integer('birth_year').notNull(),
    payload: jsonb('payload').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('fed_snapshot_lookup_idx').on(t.season, t.birthYear, t.capturedAt)],
);

export type FederationSnapshot = typeof federationSnapshots.$inferSelect;
export type FederationSnapshotInsert = typeof federationSnapshots.$inferInsert;
