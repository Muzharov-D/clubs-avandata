import { pgTable, text, integer, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { matches } from './matches.js';
import { players } from './players.js';

export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    number: integer('number'),
    position: text('position'),
    positionFull: text('position_full'),
    minutes: integer('minutes'),
    ratings: jsonb('ratings'),
    stats: jsonb('stats'),
    splits: jsonb('splits'),
    radar: jsonb('radar'),
    maps: jsonb('maps'),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.playerId] }),
    index('match_players_player_idx').on(t.playerId),
    index('match_players_tenant_idx').on(t.tenantId),
  ],
);

export type MatchPlayer = typeof matchPlayers.$inferSelect;
export type MatchPlayerInsert = typeof matchPlayers.$inferInsert;
