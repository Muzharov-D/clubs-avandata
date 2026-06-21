import { pgTable, bigserial, integer, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Перепись региона по «пирамиде лиг» FFSPB — region-wide срез ВСЕХ лиг сезона
 * (Высшая…Четвёртая + прочие), НЕ только клубов-членов. Зеркалит federationSnapshots:
 * регион-wide (НЕ tenant-scoped, bypass-RLS), INSERT-only история.
 *
 * Тяжёлый живой обход FFSPB (~330 ростеров + таблицы, минуты; Render IP-блокирован
 * от stat.ffspb.org) делает офлайн-скрипт `npm run sync:region-census` ~раз в месяц —
 * пишет ОДИН ряд. Эндпоинт region-map читает последний ряд мгновенно, без живого FFSPB.
 *
 * payload — компактный агрегат: per-league (команды/клубы/игроки/Q1%/Q4%/перекос) +
 * региональные тоталы (игроки-дедуп/команды/клубы/матчи + распределение по кварталам).
 */
export const regionCensus = pgTable(
  'region_census',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    federationSlug: text('federation_slug').notNull(),
    season: integer('season').notNull(),
    payload: jsonb('payload').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('region_census_lookup_idx').on(t.federationSlug, t.season, t.capturedAt)],
);

export type RegionCensus = typeof regionCensus.$inferSelect;
export type RegionCensusInsert = typeof regionCensus.$inferInsert;
