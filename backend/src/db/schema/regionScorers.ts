import { pgTable, bigserial, integer, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Бомбардиры региона — region-wide срез ГОЛОВ по протоколам матчей FFSPB
 * (Первенство, когорты 2009–2016). Из events[] деталей матча: гол (eventType 0)
 * и пенальти (eventType 2) кредитуются автору; автоголы (eventType 1) исключены.
 * Зеркалит regionMinutes: регион-wide (НЕ tenant-scoped, bypass-RLS), INSERT-only история.
 *
 * Тяжёлый живой обход FFSPB (детали КАЖДОГО сыгранного матча по 8 турнирам
 * Первенства — events каждого матча; Render IP-блокирован от stat.ffspb.org) делает
 * офлайн-скрипт `npm run sync:region-scorers` ~раз в месяц — пишет ОДИН ряд. Эндпоинт
 * region-scorers читает последний ряд мгновенно, без живого FFSPB.
 *
 * payload — компактный агрегат: сколько матчей просканировано + топ-15 бомбардиров
 * (имя, клуб, эмблема клуба, год рождения когорты, голы). Ассисты в протоколах FFSPB
 * не заполнены — topAssists остаётся пустым (контракт сохранён для будущего).
 */
export const regionScorers = pgTable(
  'region_scorers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    federationSlug: text('federation_slug').notNull(),
    season: integer('season').notNull(),
    payload: jsonb('payload').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('region_scorers_lookup_idx').on(t.federationSlug, t.season, t.capturedAt)],
);

export type RegionScorers = typeof regionScorers.$inferSelect;
export type RegionScorersInsert = typeof regionScorers.$inferInsert;
