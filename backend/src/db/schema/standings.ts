import { pgTable, bigserial, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const standings = pgTable(
  'standings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    ageGroup: text('age_group').notNull(),
    season: text('season').notNull(),
    leagueName: text('league_name'),
    sourceUrl: text('source_url'),
    tableData: jsonb('table_data').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('standings_lookup_idx').on(t.tenantId, t.ageGroup, t.season, t.fetchedAt)],
);

export const cupBrackets = pgTable(
  'cup_brackets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    ageGroup: text('age_group').notNull(),
    season: text('season').notNull(),
    cupName: text('cup_name'),
    sourceUrl: text('source_url'),
    roundsData: jsonb('rounds_data').notNull(),
    parseHint: text('parse_hint'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('cup_lookup_idx').on(t.tenantId, t.ageGroup, t.season, t.fetchedAt)],
);

export type Standings = typeof standings.$inferSelect;
export type StandingsInsert = typeof standings.$inferInsert;
export type CupBracket = typeof cupBrackets.$inferSelect;
export type CupBracketInsert = typeof cupBrackets.$inferInsert;
