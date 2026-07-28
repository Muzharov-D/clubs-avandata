import { pgTable, bigserial, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { players } from './players.js';
import { users } from './users.js';

/**
 * Обратная связь тренер ↔ игрок.
 *
 * Тренер пишет разбор конкретному игроку, игрок отвечает своим видением —
 * так устроен цикл в академиях: индивидуальный план + регулярный разбор + рефлексия
 * игрока. Приватно, один-на-один: негативный разбор при команде бьёт по ребёнку.
 *
 * `extMatchId` = null — это периодический разбор (раз в несколько недель, против
 * индивидуального плана), а не привязанный к матчу. Ритм выбран владельцем:
 * выборочно после матча + полный круг раз в N недель; каждому после каждого тура
 * тренер физически не осилит.
 *
 * Ответ игрока живёт в этой же строке: пара «разбор → ответ» и есть единица цикла.
 */
export const playerFeedback = pgTable(
  'player_feedback',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    ageGroup: text('age_group').notNull(),
    /** null = разбор вне матча (периодический, по индивидуальному плану). */
    extMatchId: text('ext_match_id'),
    /** Текст тренера. */
    coachText: text('coach_text').notNull(),
    coachUserId: text('coach_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    /** Ответ игрока — его собственное видение эпизода/матча. */
    playerText: text('player_text'),
    playerRespondedAt: timestamp('player_responded_at', { withTimezone: true }),
  },
  (t) => [
    // ВНИМАНИЕ: уникальность «один разбор на (игрок, матч)» держится ЧАСТИЧНЫМ
    // индексом в миграции 0020 (`WHERE ext_match_id IS NOT NULL`) — здесь его не
    // объявляем, чтобы схема не расходилась с БД: периодических разборов
    // (ext_match_id IS NULL) у игрока может быть много.
    index('player_feedback_player_idx').on(t.tenantId, t.playerId),
    index('player_feedback_match_idx').on(t.tenantId, t.ageGroup, t.extMatchId),
  ],
);

export type PlayerFeedback = typeof playerFeedback.$inferSelect;
export type PlayerFeedbackInsert = typeof playerFeedback.$inferInsert;
