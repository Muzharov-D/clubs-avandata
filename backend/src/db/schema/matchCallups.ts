import { pgTable, bigserial, text, jsonb, timestamp, unique, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { players } from './players.js';
import { users } from './users.js';

export const matchCallups = pgTable(
  'match_callups',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    ageGroup: text('age_group').notNull(),
    extMatchId: text('ext_match_id').notNull(),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    note: text('note'),
    calledAt: timestamp('called_at', { withTimezone: true }).defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    byUserId: text('by_user_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('match_callups_uq').on(t.tenantId, t.ageGroup, t.extMatchId, t.playerId),
    check('match_callups_status_chk', sql`${t.status} IN ('pending','called','confirmed','declined','excused')`),
    index('match_callups_match_idx').on(t.tenantId, t.ageGroup, t.extMatchId),
    index('match_callups_player_idx').on(t.playerId),
  ],
);

export type MatchCallup = typeof matchCallups.$inferSelect;
export type MatchCallupInsert = typeof matchCallups.$inferInsert;
