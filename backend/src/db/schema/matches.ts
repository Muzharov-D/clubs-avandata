import { pgTable, text, integer, jsonb, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { teams } from './teams.js';
import { users } from './users.js';

export const matches = pgTable(
  'matches',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    extMatchId: text('ext_match_id'),
    homeTeamId: text('home_team_id'),
    awayTeamId: text('away_team_id'),
    homeTeamName: text('home_team_name'),
    awayTeamName: text('away_team_name'),
    matchDate: timestamp('match_date', { withTimezone: true }),
    season: text('season'),
    tournament: text('tournament').default('league'),
    scoreHome: integer('score_home'),
    scoreAway: integer('score_away'),
    pdfSource: text('pdf_source'),
    uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow(),
    teamSummaryStats: jsonb('team_summary_stats'),
    teamAggregates: jsonb('team_aggregates'),
    teamAvgRatings: jsonb('team_avg_ratings'),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    unique('matches_tenant_ext_uq').on(t.tenantId, t.extMatchId),
    index('matches_team_idx').on(t.teamId),
    index('matches_date_idx').on(t.matchDate),
    index('matches_tournament_idx').on(t.tournament),
  ],
);

export type Match = typeof matches.$inferSelect;
export type MatchInsert = typeof matches.$inferInsert;
