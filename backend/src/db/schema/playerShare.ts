import { pgTable, text, jsonb, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { players } from './players.js';
import { users } from './users.js';

/**
 * Что тренер открыл игроку в его кабинете (миграция 0021).
 *
 * Кабинет игрока — не урезанная копия тренерского, а именно то, что тренер решил
 * показать: список осей радара плюс, по желанию, общий индекс. Строки может не
 * быть — тогда действует умолчание (три главных показателя амплуа, общий индекс
 * скрыт), см. `modules/lite/metrics.ts`.
 *
 * Общий индекс скрыт по умолчанию сознательно: одна цифра «твой уровень 6.4»
 * ребёнку ничего не объясняет и легко читается как приговор, а показатели по
 * амплуа — это разговор про игру.
 */
export const playerShare = pgTable(
  'player_share',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Ключи осей радара, открытых игроку: ['shooting','dribbling',...]. */
    metrics: jsonb('metrics').notNull().default([]),
    showOverall: boolean('show_overall').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.playerId] })],
);

export type PlayerShare = typeof playerShare.$inferSelect;
export type PlayerShareInsert = typeof playerShare.$inferInsert;
