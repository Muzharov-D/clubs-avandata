import { pgTable, text, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';

export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ageGroup: text('age_group').notNull(),
    ageLabel: text('age_label'),
    year: integer('year'),
    headCoach: text('head_coach'),
    isOurTeam: boolean('is_our_team').default(true),
    active: boolean('active').default(true),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('teams_tenant_idx').on(t.tenantId)],
);

export type Team = typeof teams.$inferSelect;
export type TeamInsert = typeof teams.$inferInsert;
