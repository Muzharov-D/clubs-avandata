import { pgTable, text, integer, date, jsonb, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { teams } from './teams.js';

export const players = pgTable(
  'players',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    number: integer('number'),
    position: text('position'),
    positionFull: text('position_full'),
    birthDate: date('birth_date'),
    photoUrl: text('photo_url'),
    extraTeams: text('extra_teams').array().notNull().default(sql`ARRAY[]::TEXT[]`),
    externalIds: jsonb('external_ids').notNull().default(sql`'{}'::jsonb`),
    dataConsent: boolean('data_consent').notNull().default(false),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('players_tenant_team_idx').on(t.tenantId, t.teamId)],
);

export type Player = typeof players.$inferSelect;
export type PlayerInsert = typeof players.$inferInsert;
