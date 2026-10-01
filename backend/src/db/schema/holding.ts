import { pgTable, bigserial, integer, jsonb, text, date, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Кабинет холдинга (см. drizzle/0026). Холдинги — в коде (federation/holdings.ts), ключ holding_slug.
 * Доступ только через withBypassRLS, фильтр по slug — в holding/routes.ts.
 */

/** Недельный срез решений холдинга (INSERT-only) — база для «Что изменилось». */
export const holdingSnapshots = pgTable(
  'holding_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    holdingSlug: text('holding_slug').notNull(),
    season: integer('season').notNull(),
    payload: jsonb('payload').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('holding_snapshot_lookup_idx').on(t.holdingSlug, t.season, t.capturedAt)],
);

/** Пометка руководителя по игроку: решение, напоминание, срез рейтинга на момент решения. */
export const holdingNotes = pgTable(
  'holding_notes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    holdingSlug: text('holding_slug').notNull(),
    playerId: integer('player_id').notNull(),
    playerName: text('player_name').notNull(),
    kind: text('kind').notNull().$type<HoldingNoteKind>(),
    text: text('text').notNull().default(''),
    remindOn: date('remind_on'),
    ratingAt: integer('rating_at'),
    rankAt: integer('rank_at'),
    sizeAt: integer('size_at'),
    authorId: text('author_id').notNull(),
    authorName: text('author_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    index('holding_notes_player_idx').on(t.holdingSlug, t.playerId),
    index('holding_notes_open_idx').on(t.holdingSlug, t.closedAt),
  ],
);

export type HoldingNoteKind = 'youth' | 'promote' | 'older' | 'watch' | 'keep' | 'other';
export type HoldingNote = typeof holdingNotes.$inferSelect;
