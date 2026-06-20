import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '../shared/errors.js';

/**
 * Tenant-scoped API «Вызов состава на матч» (callups, Sprint 5.B).
 *
 * Раньше существовали только схема (db/schema/matchCallups → таблица создана
 * в drizzle/0002, RLS в 0007) и фронт (CallupRoster.jsx + services/api.js) —
 * бэкенда не было, поэтому /api/v1/callups/* отвечал 404 и модалка «Состав на
 * матч» вечно висела на «Загрузка...».
 *
 * Паттерн как в trainings/routes: JWT + явная фильтрация по tenant_id +
 * withTenant (ставит app.tenant_id для RLS). matches/players под FORCE RLS —
 * все обращения строго через withTenant.
 *
 * Контракт диктует фронт (НЕ меняем):
 *  - callup-строка содержит { playerId, playerName, playerNumber, status, note }
 *    → имя/номер берём JOIN'ом с players (в самой match_callups их нет).
 *  - статусы: pending (добавлен, ещё не призван) | called (призван/уведомлён) |
 *    confirmed (идёт) | declined (не идёт) | excused (уваж.).
 */
const CALLUP_STATUSES = ['pending', 'called', 'confirmed', 'declined', 'excused'] as const;
type CallupStatus = (typeof CALLUP_STATUSES)[number];

function isCallupStatus(v: unknown): v is CallupStatus {
  return typeof v === 'string' && (CALLUP_STATUSES as readonly string[]).includes(v);
}

// Колонки одной callup-строки в форме, которую ждёт фронт (CallupRoster).
// playerName/playerNumber приходят из JOIN'а с players.
const CALLUP_SELECT = `
  c.player_id    AS "playerId",
  p.full_name    AS "playerName",
  p.number       AS "playerNumber",
  c.status       AS "status",
  c.note         AS "note",
  c.called_at    AS "calledAt",
  c.responded_at AS "respondedAt"`;

export async function callupsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  function tenantId(req: { user?: { tenantId: string | null } }): string {
    const id = req.user?.tenantId;
    if (!id) throw new UnauthorizedError('tenant context required');
    return id;
  }
  function assertCoach(req: { user?: { role?: string; tenantId?: string | null; teamId?: string | null }; params?: unknown }): void {
    const role = req.user?.role;
    if (role !== 'head_coach' && role !== 'team_coach') {
      throw new ForbiddenError('только тренер может управлять составом на матч');
    }
    // team_coach — только СВОЯ возрастная команда (teamId = `${slug}-${age}`); head_coach — любой возраст клуба.
    if (role === 'team_coach' && req.user?.teamId) {
      const age = (req.params as { age?: string } | undefined)?.age;
      const slug = req.user?.tenantId ?? '';
      if (age && req.user.teamId !== `${slug}-${age}`) {
        throw new ForbiddenError('тренер команды управляет составом только своей команды');
      }
    }
  }

  // GET /callups/match/:age/:extMatchId — список вызванных на матч.
  // Возвращает { callups: [...] } — именно это читает CallupRoster (results[0].callups).
  app.get<{ Params: { age: string; extMatchId: string } }>(
    '/callups/match/:age/:extMatchId',
    async (req) => {
      const slug = tenantId(req);
      const { age, extMatchId } = req.params;
      return withTenant(slug, async (_tx, conn) => {
        const { rows } = await conn.query(
          `SELECT ${CALLUP_SELECT}
             FROM match_callups c
             JOIN players p ON p.id = c.player_id AND p.tenant_id = c.tenant_id
            WHERE c.tenant_id = $1 AND c.age_group = $2 AND c.ext_match_id = $3
            ORDER BY p.number NULLS LAST, p.full_name`,
          [slug, age, extMatchId],
        );
        return { callups: rows };
      });
    },
  );

  // GET /callups/match/:age/:extMatchId/summary — счётчики по статусам.
  // Фронт сейчас считает сводку сам, но эндпоинт по контракту существует
  // (fetchCallupSummary) — отдаём готовую агрегацию в тех же терминах, что и UI.
  app.get<{ Params: { age: string; extMatchId: string } }>(
    '/callups/match/:age/:extMatchId/summary',
    async (req) => {
      const slug = tenantId(req);
      const { age, extMatchId } = req.params;
      return withTenant(slug, async (_tx, conn) => {
        const { rows } = await conn.query<{
          total: string;
          confirmed: string;
          declined: string;
          excused: string;
          noAnswer: string;
        }>(
          `SELECT
             COUNT(*)::int                                                  AS "total",
             COUNT(*) FILTER (WHERE status = 'confirmed')::int              AS "confirmed",
             COUNT(*) FILTER (WHERE status = 'declined')::int               AS "declined",
             COUNT(*) FILTER (WHERE status = 'excused')::int                AS "excused",
             COUNT(*) FILTER (WHERE status IN ('pending','called'))::int    AS "noAnswer"
           FROM match_callups
          WHERE tenant_id = $1 AND age_group = $2 AND ext_match_id = $3`,
          [slug, age, extMatchId],
        );
        const r = rows[0] ?? { total: 0, confirmed: 0, declined: 0, excused: 0, noAnswer: 0 };
        return { summary: r };
      });
    },
  );

  // GET /callups/me — мои вызовы (для игрока/родителя): где меня вызвали.
  // Возвращает { callups: [...] } с инфой о матче.
  app.get('/callups/me', async (req) => {
    const slug = tenantId(req);
    const playerId = req.user?.playerId;
    if (!playerId) return { callups: [] };
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT
           c.age_group    AS "ageGroup",
           c.ext_match_id AS "extMatchId",
           c.status       AS "status",
           c.note         AS "note",
           c.called_at    AS "calledAt",
           c.responded_at AS "respondedAt"
         FROM match_callups c
        WHERE c.tenant_id = $1 AND c.player_id = $2
        ORDER BY c.called_at DESC NULLS LAST`,
        [slug, playerId],
      );
      return { callups: rows };
    });
  });

  // POST /callups/match/:age/:extMatchId/call — добавить игроков в состав.
  // Body { playerIds: string[] }. Идемпотентно: повторное добавление не сбрасывает
  // уже выставленный статус (ON CONFLICT DO NOTHING) — иначе «+ Добавить всех»
  // обнулило бы ответы уже отвечавших.
  app.post<{ Params: { age: string; extMatchId: string }; Body: { playerIds?: unknown } }>(
    '/callups/match/:age/:extMatchId/call',
    async (req) => {
      const slug = tenantId(req);
      assertCoach(req);
      const { age, extMatchId } = req.params;
      const raw = req.body?.playerIds;
      const playerIds = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
        : [];
      if (playerIds.length === 0) throw new BadRequestError('playerIds пуст');
      return withTenant(slug, async (_tx, conn) => {
        let added = 0;
        for (const pid of playerIds) {
          const { rowCount } = await conn.query(
            `INSERT INTO match_callups
               (tenant_id, age_group, ext_match_id, player_id, status, by_user_id)
             VALUES ($1, $2, $3, $4, 'pending', $5)
             ON CONFLICT (tenant_id, age_group, ext_match_id, player_id) DO NOTHING`,
            [slug, age, extMatchId, pid, req.user?.sub ?? null],
          );
          added += rowCount ?? 0;
        }
        return { ok: true, added };
      });
    },
  );

  // POST /callups/match/:age/:extMatchId/call-all — призвать всех «pending» →
  // перевести в 'called' (помечает «уведомление отправлено»). Не трогает тех,
  // кто уже ответил (confirmed/declined/excused).
  app.post<{ Params: { age: string; extMatchId: string } }>(
    '/callups/match/:age/:extMatchId/call-all',
    async (req) => {
      const slug = tenantId(req);
      assertCoach(req);
      const { age, extMatchId } = req.params;
      return withTenant(slug, async (_tx, conn) => {
        const { rowCount } = await conn.query(
          `UPDATE match_callups
              SET status = 'called', called_at = now()
            WHERE tenant_id = $1 AND age_group = $2 AND ext_match_id = $3
              AND status = 'pending'`,
          [slug, age, extMatchId],
        );
        return { ok: true, called: rowCount ?? 0 };
      });
    },
  );

  // DELETE /callups/match/:age/:extMatchId/player/:playerId — убрать из состава.
  app.delete<{ Params: { age: string; extMatchId: string; playerId: string } }>(
    '/callups/match/:age/:extMatchId/player/:playerId',
    async (req) => {
      const slug = tenantId(req);
      assertCoach(req);
      const { age, extMatchId, playerId } = req.params;
      return withTenant(slug, async (_tx, conn) => {
        await conn.query(
          `DELETE FROM match_callups
            WHERE tenant_id = $1 AND age_group = $2 AND ext_match_id = $3 AND player_id = $4`,
          [slug, age, extMatchId, playerId],
        );
        return { ok: true };
      });
    },
  );

  // POST /callups/match/:age/:extMatchId/respond — ответ/смена статуса.
  // Body { status, note, playerId }.
  //  - Тренер: может выставить статус ЛЮБОМУ игроку (playerId из body).
  //  - Игрок/родитель: отвечает только за себя (playerId из JWT, body игнорируется).
  app.post<{
    Params: { age: string; extMatchId: string };
    Body: { status?: unknown; note?: unknown; playerId?: unknown };
  }>(
    '/callups/match/:age/:extMatchId/respond',
    async (req) => {
      const slug = tenantId(req);
      const { age, extMatchId } = req.params;
      const role = req.user?.role;
      const isCoach = role === 'head_coach' || role === 'team_coach';
      // team_coach отвечает за состав только своей возрастной команды.
      if (role === 'team_coach' && req.user?.teamId && req.user.teamId !== `${slug}-${age}`) {
        throw new ForbiddenError('тренер команды управляет составом только своей команды');
      }

      const targetPlayerId = isCoach
        ? (typeof req.body?.playerId === 'string' ? req.body.playerId : null)
        : (req.user?.playerId ?? null);
      if (!targetPlayerId) {
        throw new ForbiddenError('не удалось определить игрока для ответа');
      }

      const status = req.body?.status;
      if (!isCallupStatus(status)) throw new BadRequestError('недопустимый статус');
      const note = typeof req.body?.note === 'string' ? req.body.note : null;

      return withTenant(slug, async (_tx, conn) => {
        // Upsert: игрок мог ещё не быть в составе — но штатно тренер сначала
        // добавляет. Если строки нет — создаём (тренер вправе).
        const { rows } = await conn.query(
          `INSERT INTO match_callups
             (tenant_id, age_group, ext_match_id, player_id, status, note, responded_at, by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
           ON CONFLICT (tenant_id, age_group, ext_match_id, player_id) DO UPDATE
             SET status = EXCLUDED.status,
                 note = EXCLUDED.note,
                 responded_at = now()
           RETURNING player_id AS "playerId", status, note`,
          [slug, age, extMatchId, targetPlayerId, status, note, req.user?.sub ?? null],
        );
        return { ok: true, callup: rows[0] ?? null };
      });
    },
  );

  // POST /callups/match/:age/:extMatchId/notify — разослать призыв (push).
  // ЗАГЛУШКА: реального web-push сервиса в проекте нет. Помечаем все 'pending'
  // как 'called' (для UI «отправлено») и возвращаем счётчики. Фронт читает
  // r.notified и r.push.sent.
  // TODO: реальная web-push отправка (подписки в push_subscriptions),
  //       когда появится push-сервис на бэкенде.
  app.post<{ Params: { age: string; extMatchId: string } }>(
    '/callups/match/:age/:extMatchId/notify',
    async (req) => {
      const slug = tenantId(req);
      assertCoach(req);
      const { age, extMatchId } = req.params;
      return withTenant(slug, async (_tx, conn) => {
        // Сколько всего в составе (notified) — фронт показывает «Отправлено N».
        const { rows: totalRows } = await conn.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total
             FROM match_callups
            WHERE tenant_id = $1 AND age_group = $2 AND ext_match_id = $3`,
          [slug, age, extMatchId],
        );
        const notified = totalRows[0]?.total ?? 0;

        // Помечаем ещё-не-призванных как 'called' — «уведомление отправлено».
        await conn.query(
          `UPDATE match_callups
              SET status = 'called', called_at = now()
            WHERE tenant_id = $1 AND age_group = $2 AND ext_match_id = $3
              AND status = 'pending'`,
          [slug, age, extMatchId],
        );

        // push.sent = 0 — реальной отправки нет (заглушка). Структура ответа
        // совместима с фронтом: notified + push.sent.
        return { ok: true, notified, push: { sent: 0 } };
      });
    },
  );
}
