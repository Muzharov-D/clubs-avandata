import { pgTable, bigserial, integer, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Карта возможностей региона — region-wide срез ИГРОВОГО ВРЕМЕНИ по протоколам
 * FFSPB: сколько зарегистрированных «выживших» Первенства (когорты 2009–2016) не
 * выходят на поле ни разу / погребены на лавке, + двойной штраф поздно-рождённых.
 * Зеркалит regionCensus: регион-wide (НЕ tenant-scoped, bypass-RLS), INSERT-only история.
 *
 * Тяжёлый живой обход FFSPB (детали матчей с participatedPlayers по 8 турнирам —
 * минуты каждого игрока; Render IP-блокирован от stat.ffspb.org) делает офлайн-скрипт
 * `npm run sync:region-minutes` ~раз в месяц — пишет ОДИН ряд. Эндпоинт minutes читает
 * последний ряд мгновенно, без живого FFSPB.
 *
 * payload — компактный агрегат: оценённые игроки, не выходят ни разу / погребённые<15%,
 * медиана игрового времени, распределение по бакетам (0 / 0–15 / 15–30 / 30–50 / ≥50%),
 * медиана+погребённые по кварталам рождения (Q4 — самый низкий = двойной штраф).
 */
export const regionMinutes = pgTable(
  'region_minutes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    federationSlug: text('federation_slug').notNull(),
    season: integer('season').notNull(),
    payload: jsonb('payload').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('region_minutes_lookup_idx').on(t.federationSlug, t.season, t.capturedAt)],
);

export type RegionMinutes = typeof regionMinutes.$inferSelect;
export type RegionMinutesInsert = typeof regionMinutes.$inferInsert;
