import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { authenticate } from '../../auth/middleware.js';
import { withTenant } from '../../db/tenantContext.js';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../shared/errors.js';
import { callupWriteScope } from '../../auth/scope.js';
import { posGroupFromCode, posDetailFromCode, type PosGroup } from '../../shared/positions.js';
import {
  AXIS_LABEL, LINE_SETS, axesOfLine, defaultSharedMetrics, sanitizeMetrics, percentileOf,
} from './metrics.js';

/**
 * Кабинет Lite: что тренер открывает игроку и что игрок в итоге видит.
 *
 * Разбор (текст тренера ↔ ответ игрока) живёт в модуле `feedback`; здесь —
 * видимость показателей, доступ игрока в систему и сам экран игрока.
 *
 * ГЛАВНОЕ ПРАВИЛО: фильтрация видимости происходит ЗДЕСЬ. `/lite/me` считает
 * профиль и выкидывает скрытые оси до ответа — фронт получает только открытое.
 * Прятать на клиенте было бы фикцией: значения читались бы прямо из ответа.
 *
 * Права:
 *  - настройка видимости и приглашение — тренер (правило из `callupWriteScope`,
 *    чтобы не заводить третий вариант скоупа);
 *  - `/lite/me` — только сам игрок, только про себя (playerId из JWT).
 */

type AnyRow = Record<string, unknown>;

/** Сколько живёт ссылка-приглашение. Как у тренерского invite (0005). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Сезонный профиль игрока команды — ровно то, что нужно кабинету Lite. */
type SeasonPlayer = {
  id: string;
  fullName: string;
  number: number | null;
  photoUrl: string | null;
  positionDetail: string | null;
  line: PosGroup | null;
  matches: number;
  minutes: number;
  minutesPerMatch: number;
  avgOverall: number;
  radar: Record<string, number>;
};

/**
 * Сезонные средние по команде: радар (индекс 0–10) + линия по сумме минут.
 *
 * Считает то же и так же, как `/data/players/season`, но только нужные поля —
 * кабинету игрока не за чем тянуть 20 суммарных счётчиков. Позиция и линия
 * берутся из общего `shared/positions.ts`, чтобы амплуа у тренера и у игрока
 * совпадало.
 */
async function seasonPlayers(conn: PoolClient, slug: string, teamId: string): Promise<SeasonPlayer[]> {
  const { rows } = await conn.query<AnyRow>(
    `SELECT mp.player_id, p.full_name AS "fullName", p.number, p.photo_url AS "photoUrl",
            mp.position, mp.minutes, mp.ratings, mp.radar
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
       JOIN players  p ON p.id = mp.player_id
      WHERE mp.tenant_id = $1 AND m.team_id = $2`,
    [slug, teamId],
  );

  type Acc = {
    base: Omit<SeasonPlayer, 'line' | 'minutesPerMatch' | 'avgOverall' | 'radar' | 'positionDetail'>;
    sumOverall: number; ratedMatches: number;
    radarAcc: Map<string, { sum: number; count: number }>;
    posMin: Map<string, number>;
  };
  const byId = new Map<string, Acc>();

  for (const r of rows) {
    const id = String(r.player_id);
    let a = byId.get(id);
    if (!a) {
      a = {
        base: {
          id,
          fullName: String(r.fullName ?? ''),
          number: (r.number as number | null) ?? null,
          photoUrl: (r.photoUrl as string | null) ?? null,
          matches: 0,
          minutes: 0,
        },
        sumOverall: 0, ratedMatches: 0,
        radarAcc: new Map(), posMin: new Map(),
      };
      byId.set(id, a);
    }
    a.base.matches += 1;
    a.base.minutes += Number(r.minutes ?? 0);

    // Позиция — по СУММЕ МИНУТ за сезон (не «последний матч»: сырой match_date
    // в БД пуст/неверен, и мультипозиционный игрок получал случайную роль).
    if (r.position != null && String(r.position).trim()) {
      const code = String(r.position).trim().toUpperCase();
      const w = Number(r.minutes) > 0 ? Number(r.minutes) : 1; // 0/нет минут → вес 1
      a.posMin.set(code, (a.posMin.get(code) ?? 0) + w);
    }

    const rt = (r.ratings as Record<string, unknown>) ?? {};
    const ov = Number(rt.overall ?? 0);
    if (ov > 0) { a.ratedMatches += 1; a.sumOverall += ov; }

    const radar = (r.radar as Record<string, unknown>) ?? {};
    for (const [k, v] of Object.entries(radar)) {
      const n = Number(typeof v === 'object' && v ? (v as AnyRow).value : v);
      if (!Number.isFinite(n) || n <= 0) continue;
      const acc = a.radarAcc.get(k) ?? { sum: 0, count: 0 };
      acc.sum += n; acc.count += 1;
      a.radarAcc.set(k, acc);
    }
  }

  return [...byId.values()].map((a) => {
    const dominant = [...a.posMin.entries()]
      .map(([code, mins]) => ({ code, group: posGroupFromCode(code), minutes: mins }))
      .filter((p) => p.group)
      .sort((x, y) => y.minutes - x.minutes)[0] ?? null;
    return {
      ...a.base,
      positionDetail: dominant ? posDetailFromCode(dominant.code) : null,
      line: (dominant?.group as PosGroup | undefined) ?? null,
      minutesPerMatch: a.base.matches ? Math.round(a.base.minutes / a.base.matches) : 0,
      avgOverall: a.ratedMatches ? Number((a.sumOverall / a.ratedMatches).toFixed(2)) : 0,
      radar: Object.fromEntries(
        [...a.radarAcc.entries()].map(([k, { sum, count }]) => [k, Number((sum / count).toFixed(2))]),
      ),
    };
  });
}

/** Команда, за которую игрок реально играет: та, где у него больше всего матчей. */
async function teamOfPlayer(conn: PoolClient, slug: string, playerId: string): Promise<string | null> {
  const { rows } = await conn.query<AnyRow>(
    `SELECT m.team_id AS "teamId", COUNT(*)::int AS cnt
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
      WHERE mp.tenant_id = $1 AND mp.player_id = $2 AND m.team_id IS NOT NULL
      GROUP BY m.team_id
      ORDER BY cnt DESC
      LIMIT 1`,
    [slug, playerId],
  );
  return (rows[0]?.teamId as string | undefined) ?? null;
}

/** Настройка видимости из БД или умолчание (три главных показателя амплуа). */
async function shareOf(conn: PoolClient, slug: string, playerId: string, line: PosGroup | null) {
  const { rows } = await conn.query<AnyRow>(
    `SELECT metrics, show_overall AS "showOverall", updated_at AS "updatedAt"
       FROM player_share WHERE tenant_id = $1 AND player_id = $2`,
    [slug, playerId],
  );
  const row = rows[0];
  if (!row) {
    return { metrics: defaultSharedMetrics(line), showOverall: false, isDefault: true, updatedAt: null };
  }
  return {
    metrics: sanitizeMetrics(row.metrics, line),
    showOverall: Boolean(row.showOverall),
    isDefault: false,
    updatedAt: (row.updatedAt as string | null) ?? null,
  };
}

/** Состояние доступа игрока: приглашён / вошёл / нет учётной записи. */
async function accessOf(conn: PoolClient, slug: string, playerId: string) {
  const { rows } = await conn.query<AnyRow>(
    `SELECT id, username, password_hash AS "passwordHash",
            invite_expires_at AS "inviteExpiresAt", last_login AS "lastLogin"
       FROM users
      WHERE tenant_id = $1 AND role = 'player' AND player_id = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [slug, playerId],
  );
  const u = rows[0];
  if (!u) return { status: 'none' as const, username: null, lastLogin: null, inviteExpiresAt: null };
  const expires = u.inviteExpiresAt ? new Date(String(u.inviteExpiresAt)) : null;
  const status = u.passwordHash
    ? ('active' as const)
    : expires && expires.getTime() > Date.now()
      ? ('invited' as const)
      : ('expired' as const);
  return {
    status,
    username: (u.username as string | null) ?? null,
    lastLogin: (u.lastLogin as string | null) ?? null,
    inviteExpiresAt: (u.inviteExpiresAt as string | null) ?? null,
  };
}

/** Транслит для логина игрока: латиница читаема на любой клавиатуре. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};
function loginFromName(fullName: string): string {
  const base = String(fullName || 'player').toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return base || 'player';
}

export async function liteRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  /** Тренер ли это и вправе ли он трогать данный возраст. */
  function assertCoach(req: { user?: { role?: string; teamId?: string | null } }, slug: string, age: string) {
    if (callupWriteScope(req.user?.role, req.user?.teamId, slug, age) === 'deny') {
      throw new UnauthorizedError('нет доступа к этой команде');
    }
  }

  function tenantOf(req: { user?: { tenantId?: string | null } }): string {
    const slug = req.user?.tenantId;
    if (!slug) throw new UnauthorizedError('нет клуба в токене');
    return slug;
  }

  // ── GET /lite/share/:age/:playerId — что открыто игроку + состояние доступа ──
  app.get<{ Params: { age: string; playerId: string } }>(
    '/lite/share/:age/:playerId',
    async (req) => {
      const slug = tenantOf(req);
      const { age, playerId } = req.params;
      assertCoach(req, slug, age);
      return withTenant(slug, async (_tx, conn) => {
        const teamId = `${slug}-${age}`;
        const squad = await seasonPlayers(conn, slug, teamId);
        const me = squad.find((p) => p.id === playerId) ?? null;
        const line = me?.line ?? null;
        const share = await shareOf(conn, slug, playerId, line);
        return {
          playerId,
          line,
          lineLabel: line ? LINE_SETS[line].label : null,
          // Полный набор осей амплуа с подписями — тренеру для галочек.
          axes: line
            ? axesOfLine(line).map((key) => ({
              key,
              label: AXIS_LABEL[key] ?? key,
              focus: LINE_SETS[line].focus.includes(key),
            }))
            : [],
          ...share,
          access: await accessOf(conn, slug, playerId),
        };
      });
    },
  );

  // ── PUT /lite/share/:age/:playerId — тренер меняет видимость ──
  app.put<{
    Params: { age: string; playerId: string };
    Body: { metrics?: unknown; showOverall?: unknown };
  }>(
    '/lite/share/:age/:playerId',
    async (req) => {
      const slug = tenantOf(req);
      const { age, playerId } = req.params;
      assertCoach(req, slug, age);
      return withTenant(slug, async (_tx, conn) => {
        const { rowCount: exists } = await conn.query(
          'SELECT 1 FROM players WHERE tenant_id = $1 AND id = $2',
          [slug, playerId],
        );
        if (!exists) throw new NotFoundError('игрок не найден в клубе');

        const squad = await seasonPlayers(conn, slug, `${slug}-${age}`);
        const line = squad.find((p) => p.id === playerId)?.line ?? null;
        const metrics = sanitizeMetrics(req.body?.metrics, line);
        const showOverall = req.body?.showOverall === true;

        await conn.query(
          `INSERT INTO player_share (tenant_id, player_id, metrics, show_overall, updated_by)
           VALUES ($1, $2, $3::jsonb, $4, $5)
           ON CONFLICT (tenant_id, player_id)
           DO UPDATE SET metrics = EXCLUDED.metrics, show_overall = EXCLUDED.show_overall,
                         updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [slug, playerId, JSON.stringify(metrics), showOverall, req.user?.sub ?? null],
        );
        return { ok: true, metrics, showOverall, isDefault: false };
      });
    },
  );

  // ── POST /lite/invite/:age/:playerId — тренер выдаёт игроку вход ──
  // Возвращает одноразовую ссылку на установку пароля. Пароль сервер не
  // придумывает и не показывает: его задаёт сам игрок по ссылке.
  app.post<{ Params: { age: string; playerId: string } }>(
    '/lite/invite/:age/:playerId',
    async (req) => {
      const slug = tenantOf(req);
      const { age, playerId } = req.params;
      assertCoach(req, slug, age);

      return withTenant(slug, async (_tx, conn) => {
        const { rows: prow } = await conn.query<AnyRow>(
          'SELECT id, full_name AS "fullName" FROM players WHERE tenant_id = $1 AND id = $2',
          [slug, playerId],
        );
        const player = prow[0];
        if (!player) throw new NotFoundError('игрок не найден в клубе');

        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

        const { rows: urow } = await conn.query<AnyRow>(
          `SELECT id, username FROM users
            WHERE tenant_id = $1 AND role = 'player' AND player_id = $2
            ORDER BY created_at ASC LIMIT 1`,
          [slug, playerId],
        );
        const existing = urow[0];

        let username: string;
        if (existing) {
          // Повторное приглашение: логин не меняем (игрок мог его запомнить),
          // пароль гасим — старая ссылка/пароль перестают работать.
          username = String(existing.username);
          await conn.query(
            `UPDATE users SET invite_token_hash = $1, invite_expires_at = $2,
                              password_hash = NULL, invited_by = $3
              WHERE id = $4`,
            [tokenHash, expiresAt, req.user?.sub ?? null, existing.id],
          );
        } else {
          // Логин глобально уникален: /auth/login без указания клуба ищет по всей
          // платформе и на дубле отвечает «ambiguous». Суффикс это исключает.
          username = `${loginFromName(String(player.fullName))}-${randomBytes(2).toString('hex')}`;
          const userId = `u-${slug}-pl-${randomBytes(4).toString('hex')}`;
          await conn.query(
            `INSERT INTO users (id, tenant_id, username, full_name, role, player_id,
                                team_id, password_hash, invite_token_hash, invite_expires_at, invited_by)
             VALUES ($1, $2, $3, $4, 'player', $5, $6, NULL, $7, $8, $9)`,
            [userId, slug, username, String(player.fullName), playerId,
              `${slug}-${age}`, tokenHash, expiresAt, req.user?.sub ?? null],
          );
        }

        const origin = String(req.headers.origin || '').replace(/\/+$/, '');
        const base = /^https?:\/\//.test(origin) ? origin : 'https://clubs.avandata.ru';
        return {
          ok: true,
          username,
          setupUrl: `${base}/set-password?token=${token}`,
          expiresAt,
          renewed: Boolean(existing),
        };
      });
    },
  );

  // ── GET /lite/me — кабинет игрока ──
  // Только сам игрок и только про себя. Скрытые оси не попадают в ответ вообще.
  app.get('/lite/me', async (req) => {
    const slug = tenantOf(req);
    if (req.user?.role !== 'player' || !req.user?.playerId) {
      throw new UnauthorizedError('этот раздел — для игрока');
    }
    const playerId = req.user.playerId;

    return withTenant(slug, async (_tx, conn) => {
      const teamId = await teamOfPlayer(conn, slug, playerId);
      const { rows: prow } = await conn.query<AnyRow>(
        'SELECT id, full_name AS "fullName", number, photo_url AS "photoUrl" FROM players WHERE tenant_id = $1 AND id = $2',
        [slug, playerId],
      );
      const base = prow[0];
      if (!base) throw new NotFoundError('игрок не найден');

      const age = teamId ? String(teamId).split('-').pop() ?? '' : '';
      const squad = teamId ? await seasonPlayers(conn, slug, teamId) : [];
      const me = squad.find((p) => p.id === playerId) ?? null;
      const line = me?.line ?? null;
      const share = await shareOf(conn, slug, playerId, line);

      // Перцентиль — внутри своей линии в команде (сравнение со сверстниками
      // на своей позиции; сравнивать вратаря с нападающим бессмысленно).
      const peers = line ? squad.filter((p) => p.line === line) : [];
      const metrics = (line ? share.metrics : []).map((key) => {
        const value = me?.radar?.[key];
        const v = Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
        const pool = peers
          .map((p) => p.radar?.[key])
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
        return {
          key,
          label: AXIS_LABEL[key] ?? key,
          value: v,
          percentile: v == null ? 0 : percentileOf(v, pool),
          focus: line ? LINE_SETS[line].focus.includes(key) : false,
        };
      });

      const { rows: feedback } = await conn.query<AnyRow>(
        `SELECT id, ext_match_id AS "extMatchId", coach_text AS "coachText",
                created_at AS "createdAt", player_text AS "playerText",
                player_responded_at AS "playerRespondedAt"
           FROM player_feedback
          WHERE tenant_id = $1 AND player_id = $2
          ORDER BY created_at DESC`,
        [slug, playerId],
      );

      return {
        player: {
          id: base.id,
          fullName: base.fullName,
          number: base.number ?? null,
          photoUrl: base.photoUrl ?? null,
          positionDetail: me?.positionDetail ?? null,
          matches: me?.matches ?? 0,
          minutes: me?.minutes ?? 0,
          minutesPerMatch: me?.minutesPerMatch ?? 0,
        },
        age,
        line,
        lineLabel: line ? LINE_SETS[line].label : null,
        peersCount: peers.length,
        metrics,
        // Общий индекс — только если тренер его открыл (по умолчанию скрыт).
        overall: share.showOverall ? (me?.avgOverall ?? null) : null,
        feedback,
      };
    });
  });

  // ── PATCH /lite/me/response/:id — игрок отвечает на разбор ──
  // Дублирует `PATCH /feedback/:id/response` по смыслу, но живёт в кабинете
  // игрока: фронту игрока незачем знать про адресацию тренерского модуля.
  app.patch<{ Params: { id: string }; Body: { text?: string } }>(
    '/lite/me/response/:id',
    async (req) => {
      const slug = tenantOf(req);
      const selfPlayerId = req.user?.role === 'player' ? req.user?.playerId : null;
      if (!selfPlayerId) {
        throw new UnauthorizedError('отвечать на разбор может только сам игрок');
      }
      const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 4000) : '';
      if (!text) throw new BadRequestError('пустой ответ', 'EMPTY_TEXT');
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw new BadRequestError('битый id', 'BAD_ID');

      return withTenant(slug, async (_tx, conn) => {
        const { rowCount, rows } = await conn.query<AnyRow>(
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
