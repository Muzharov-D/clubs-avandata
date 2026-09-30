import { pgTable, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

/**
 * Кэш протоколов ФФСПб по турниру (см. drizzle/0024). Одна строка на турнир ФФСПб:
 * все матчи турнира в нормализованном виде (federation/ffspbLive.ts → FfMatch[]).
 * full_at — когда была полная загрузка, fetched_at — последнее инкрементальное обновление.
 * Регион-wide, без RLS-скоупа тенанта: доступ только через withBypassRLS.
 */
export const ffspbMatchCache = pgTable('ffspb_match_cache', {
  tournamentId: integer('tournament_id').primaryKey(),
  matches: jsonb('matches').notNull(),
  /** Следующая страница незавершённой полной загрузки; NULL — список полный. */
  nextPage: integer('next_page'),
  fullAt: timestamp('full_at', { withTimezone: true }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});
