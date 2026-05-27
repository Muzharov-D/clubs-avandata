import { pgTable, bigserial, text, integer, boolean, jsonb, timestamp, unique, index, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';

export const calendar = pgTable(
  'calendar',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    ageGroup: text('age_group').notNull(),
    season: text('season').notNull(),
    extMatchId: text('ext_match_id'),
    matchDate: timestamp('match_date', { withTimezone: true }),
    homeTeam: text('home_team'),
    awayTeam: text('away_team'),
    extHomeTeamId: text('ext_home_team_id'),
    extAwayTeamId: text('ext_away_team_id'),
    scoreHome: integer('score_home'),
    scoreAway: integer('score_away'),
    isOurMatch: boolean('is_our_match').default(false),
    venue: text('venue'),
    groupName: text('group_name'),
    round: text('round'),
    sourceUrl: text('source_url'),
    tournament: text('tournament').default('league'),
    homeShield: text('home_shield'),
    awayShield: text('away_shield'),
    eventsData: jsonb('events_data'),
    eventsFetchedAt: timestamp('events_fetched_at', { withTimezone: true }),
    lineupsData: jsonb('lineups_data'),
    lineupsFetchedAt: timestamp('lineups_fetched_at', { withTimezone: true }),
    coachComment: text('coach_comment'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('calendar_tenant_age_ext_uq').on(t.tenantId, t.ageGroup, t.extMatchId),
    index('calendar_lookup_idx').on(t.tenantId, t.ageGroup, t.matchDate),
  ],
);

export const calendarMeta = pgTable(
  'calendar_meta',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    ageGroup: text('age_group').notNull(),
    season: text('season'),
    title: text('title'),
    parserHint: text('parser_hint'),
    sources: jsonb('sources').notNull().default(sql`'[]'::jsonb`),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.ageGroup] })],
);

export type CalendarRow = typeof calendar.$inferSelect;
export type CalendarInsert = typeof calendar.$inferInsert;
export type CalendarMeta = typeof calendarMeta.$inferSelect;
