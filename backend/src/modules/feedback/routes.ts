import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../auth/middleware.js';
import { withTenant } from '../../db/tenantContext.js';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../shared/errors.js';
import { callupWriteScope } from '../../auth/scope.js';

/**
 * Обратная связь тренер ↔ игрок (таблица player_feedback, миграция 0020).
 *
 * Тренер пишет разбор конкретному игроку — по матчу или периодический (против
 * индивидуального плана). Игрок отвечает своим видением. Приватно, один-на-один:
 * разбор при команде бьёт по ребёнку, поэтому общего экрана здесь нет.
 *
 * Права:
 *  - пишет разбор — тренер (head_coach любой возраст, team_coach только свой),
 *    правило берём из `callupWriteScope`, чтобы не плодить третий вариант;
 *  - читает — тот же тренер ИЛИ сам игрок (только про себя, playerId из JWT);
 *  - отвечает — ТОЛЬКО сам игрок и только за себя (playerId из тела игнорируем).
 *
 * Ритм (решение владельца): выборочно после матча + полный круг раз в несколько
 * недель. Поэтому периодических записей (ext_match_id IS NULL) может быть много,
 * а на матч — ровно одна (частичный уникальный индекс в миграции).
 */

const MAX_TEXT = 4000;

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, MAX_TEXT) : null;
};

/** Игрок вправе смотреть только свою карточку. */
function playerSelfOnly(req: { user?: { role?: string; playerId?: string | null } }, playerId: string): boolean {
  return req.user?.role === 'player' && req.user?.playerId === playerId;
}

export async function feedbackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /feedback/player/:age/:playerId — вся переписка по игроку (свежие сверху).
  app.get<{ Params: { age: string; playerId: string } }>(
    '/feedback/player/:age/:playerId',
    async (req) => {
      const slug = req.user?.tenantId;
      if (!slug) throw new UnauthorizedError('нет клуба в токене');
      const { age, playerId } = req.params;
      const canCoach = callupWriteScope(req.user?.role, req.user?.teamId, slug, age) !== 'deny';
      if (!canCoach && !playerSelfOnly(req, playerId)) {
        throw new UnauthorizedError('нет доступа к разборам этого игрока');
      }
      return withTenant(slug, async (_tx, conn) => {
        const { rows } = await conn.query(
          `SELECT id, ext_match_id AS "extMatchId", coach_text AS "coachText",
                  created_at AS "createdAt", updated_at AS "updatedAt",
                  player_text AS "playerText", player_responded_at AS "playerRespondedAt"
             FROM player_feedback
            WHERE tenant_id = $1 AND player_id = $2 AND age_group = $3
            ORDER BY created_at DESC`,
          [slug, playerId, age],
        );
        return { playerId, items: rows };
      });
    },
  );

  // GET /feedback/match/:age/:extMatchId — разборы по всем игрокам матча.
  // Нужен тренеру, чтобы видеть, кому уже написал, а кому нет.
  app.get<{ Params: { age: string; extMatchId: string } }>(
    '/feedback/match/:age/:extMatchId',
    async (req) => {
      const slug = req.user?.tenantId;
      if (!slug) throw new UnauthorizedError('нет клуба в токене');
      const { age, extMatchId } = req.params;
      if (callupWriteScope(req.user?.role, req.user?.teamId, slug, age) === 'deny') {
        throw new UnauthorizedError('нет доступа к разборам матча');
      }
      return withTenant(slug, async (_tx, conn) => {
        const { rows } = await conn.query(
          `SELECT f.id, f.player_id AS "playerId", p.full_name AS "playerName",
                  f.coach_text AS "coachText", f.player_text AS "playerText",
                  f.created_at AS "createdAt", f.player_responded_at AS "playerRespondedAt"
             FROM player_feedback f
             JOIN players p ON p.id = f.player_id
            WHERE f.tenant_id = $1 AND f.age_group = $2 AND f.ext_match_id = $3
            ORDER BY p.full_name`,
          [slug, age, extMatchId],
        );
        return { extMatchId, items: rows };
      });
    },
  );

  // PUT /feedback/player/:age/:playerId — тренер пишет разбор.
  // extMatchId в теле: строка — разбор матча (перезаписывает прежний по этому матчу),
  // null/отсутствует — периодический разбор (добавляется новой записью).
  app.put<{ Params: { age: string; playerId: string }; Body: { text?: string; extMatchId?: string | null } }>(
    '/feedback/player/:age/:playerId',
    async (req) => {
      const slug = req.user?.tenantId;
      if (!slug) throw new UnauthorizedError('нет клуба в токене');
      const { age, playerId } = req.params;
      if (callupWriteScope(req.user?.role, req.user?.teamId, slug, age) === 'deny') {
        throw new UnauthorizedError('нет прав писать разбор этому игроку');
      }
      const text = clean(req.body?.text);
      if (!text) throw new BadRequestError('пустой разбор', 'EMPTY_TEXT');
      const extMatchId = typeof req.body?.extMatchId === 'string' && req.body.extMatchId.trim()
        ? req.body.extMatchId.trim() : null;

      return withTenant(slug, async (_tx, conn) => {
        // Игрок обязан принадлежать этому клубу — иначе тренер мог бы писать
        // в чужую карточку, подставив id (RLS проверяет tenant, но не связь).
        const { rowCount: exists } = await conn.query(
          'SELECT 1 FROM players WHERE tenant_id = $1 AND id = $2',
          [slug, playerId],
        );
        if (!exists) throw new NotFoundError('игрок не найден в клубе');

        if (extMatchId) {
          // Разбор матча: один на игрока — обновляем, если уже писали.
          const { rows } = await conn.query(
            `INSERT INTO player_feedback (tenant_id, player_id, age_group, ext_match_id, coach_text, coach_user_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, player_id, ext_match_id) WHERE ext_match_id IS NOT NULL
             DO UPDATE SET coach_text = EXCLUDED.coach_text, updated_at = now()
             RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt"`,
            [slug, playerId, age, extMatchId, text, req.user?.sub ?? null],
          );
          return { ok: true, ...rows[0], extMatchId };
        }
        const { rows } = await conn.query(
          `INSERT INTO player_feedback (tenant_id, player_id, age_group, ext_match_id, coach_text, coach_user_id)
           VALUES ($1, $2, $3, NULL, $4, $5)
           RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt"`,
          [slug, playerId, age, text, req.user?.sub ?? null],
        );
        return { ok: true, ...rows[0], extMatchId: null };
      });
    },
  );

  // PATCH /feedback/:id/response — ответ игрока. Пишет ТОЛЬКО сам игрок и только
  // в свою запись: playerId берём из JWT, тело игнорируем (как в callups/respond).
  app.patch<{ Params: { id: string }; Body: { text?: string } }>(
    '/feedback/:id/response',
    async (req) => {
      const slug = req.user?.tenantId;
      if (!slug) throw new UnauthorizedError('нет клуба в токене');
      const selfPlayerId = req.user?.role === 'player' ? req.user?.playerId : null;
      if (!selfPlayerId) {
        throw new UnauthorizedError('отвечать на разбор может только сам игрок');
      }
      const text = clean(req.body?.text);
      if (!text) throw new BadRequestError('пустой ответ', 'EMPTY_TEXT');
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw new BadRequestError('битый id', 'BAD_ID');

      return withTenant(slug, async (_tx, conn) => {
        const { rowCount, rows } = await conn.query(
          `UPDATE player_feedback
              SET player_text = $1, player_responded_at = now()
            WHERE tenant_id = $2 AND id = $3 AND player_id = $4
            RETURNING id, player_text AS "playerText", player_responded_at AS "playerRespondedAt"`,
          [text, slug, id, selfPlayerId],
        );
        if (!rowCount) throw new NotFoundError('разбор не найден');
        return { ok: true, ...rows[0] };
      });
    },
  );
}
