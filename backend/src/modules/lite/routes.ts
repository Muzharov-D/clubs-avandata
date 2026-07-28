import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { authenticate } from '../../auth/middleware.js';
import { withTenant } from '../../db/tenantContext.js';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../shared/errors.js';
import { callupWriteScope } from '../../auth/scope.js';
import { posGroupFromCode, posDetailFromCode, posFullFromCode, type PosGroup } from '../../shared/positions.js';
import { ourResult } from '../../shared/matchResult.js';
import { applyFixtureDates, type DatedMatchRow } from '../../data/matchDate.js';
import { statAt } from './base36.js';
import {
  AXES, LINE_SETS, axesOfLine, defaultSharedMetrics, sanitizeMetrics, percentileOf, perMatch,
} from './metrics.js';

/**
 * Кабинет Lite: состав и профили для тренера, кабинет для игрока, видимость
 * показателей и выдача входа. Разбор текстом живёт в модуле `feedback`.
 *
 * ГЛАВНОЕ. Всё считается ЗДЕСЬ, на сервере, и тренер с игроком получают одни и
 * те же готовые слайсы — просто игроку из них отдаётся только разрешённое. Иначе
 * появляются два расходящихся счёта одного и того же, а скрытые числа всё равно
 * видно в ответе.
 *
 * Права: считать состав и настраивать видимость — тренер (правило берём из
 * `callupWriteScope`); `/lite/me` — только сам игрок и только про себя.
 */

type AnyRow = Record<string, unknown>;

/**
 * Личная ссылка игрока постоянна — срока жизни у неё нет. Ребёнок сохраняет её
 * и открывает когда захочет; пароль он не придумывает вовсе (решение владельца).
 * Отозвать = выдать новую: прежний хэш затирается и старая ссылка умирает.
 */

const AXIS_KEYS = Object.keys(AXES);

export interface LitePlayer {
  id: string;
  fullName: string;
  number: number | null;
  photoUrl: string | null;
  position: string | null;
  positionDetail: string | null;
  line: PosGroup | null;
  matches: number;
  minutes: number;
  minutesPerMatch: number;
  avgOverall: number;
  /** Суммы по осям за сезон. В ответ наружу не идут — только средние за матч. */
  totals: Record<string, number>;
}

/**
 * Состав команды за сезон: суммы по осям + линия по сумме минут.
 *
 * Позиция считается по СУММЕ МИНУТ за сезон, а не по последнему матчу: сырой
 * `matches.match_date` в БД пуст/неверен, и мультипозиционный игрок получал
 * случайное амплуа.
 */
async function seasonSquad(conn: PoolClient, slug: string, teamId: string): Promise<LitePlayer[]> {
  const { rows } = await conn.query<AnyRow>(
    `SELECT mp.player_id, p.full_name AS "fullName", p.number, p.photo_url AS "photoUrl",
            mp.position, mp.minutes, mp.ratings, mp.stats
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
       JOIN players  p ON p.id = mp.player_id
      WHERE mp.tenant_id = $1 AND m.team_id = $2`,
    [slug, teamId],
  );

  type Acc = {
    p: LitePlayer;
    sumOverall: number;
    ratedMatches: number;
    posMin: Map<string, number>;
  };
  const byId = new Map<string, Acc>();

  for (const r of rows) {
    const id = String(r.player_id);
    let a = byId.get(id);
    if (!a) {
      a = {
        p: {
          id,
          fullName: String(r.fullName ?? ''),
          number: (r.number as number | null) ?? null,
          photoUrl: (r.photoUrl as string | null) ?? null,
          position: null,
          positionDetail: null,
          line: null,
          matches: 0,
          minutes: 0,
          minutesPerMatch: 0,
          avgOverall: 0,
          totals: Object.fromEntries(AXIS_KEYS.map((k) => [k, 0])),
        },
        sumOverall: 0,
        ratedMatches: 0,
        posMin: new Map(),
      };
      byId.set(id, a);
    }
    a.p.matches += 1;
    a.p.minutes += Number(r.minutes ?? 0);

    if (r.position != null && String(r.position).trim()) {
      const code = String(r.position).trim().toUpperCase();
      const w = Number(r.minutes) > 0 ? Number(r.minutes) : 1; // 0/нет минут → вес 1
      a.posMin.set(code, (a.posMin.get(code) ?? 0) + w);
    }

    const rt = (r.ratings as Record<string, unknown>) ?? {};
    const ov = Number(rt.overall ?? 0);
    if (ov > 0) { a.ratedMatches += 1; a.sumOverall += ov; }

    for (const key of AXIS_KEYS) {
      a.p.totals[key] = (a.p.totals[key] ?? 0) + statAt(r.stats, key, AXES[key]?.mode);
    }
  }

  return [...byId.values()].map(({ p, sumOverall, ratedMatches, posMin }) => {
    const dominant = [...posMin.entries()]
      .map(([code, mins]) => ({ code, group: posGroupFromCode(code), minutes: mins }))
      .filter((x) => x.group)
      .sort((x, y) => y.minutes - x.minutes)[0] ?? null;
    return {
      ...p,
      position: dominant ? posFullFromCode(dominant.code) : null,
      positionDetail: dominant ? posDetailFromCode(dominant.code) : null,
      line: (dominant?.group as PosGroup | undefined) ?? null,
      minutesPerMatch: p.matches ? Math.round(p.minutes / p.matches) : 0,
      avgOverall: ratedMatches ? Number((sumOverall / ratedMatches).toFixed(2)) : 0,
    };
  });
}

export interface LiteSlice {
  key: string;
  label: string;
  hint: string;
  group: 'attack' | 'defence';
  /** Среднее за матч — то, что подписано на слайсе. */
  value: number;
  /** Место среди своей линии в команде, 0–100 — длина слайса. */
  percentile: number;
  focus: boolean;
}

/**
 * Слайсы игрока: значение — среднее за матч, длина — место среди своей линии.
 * Пул считаем по той же линии: сравнивать вратаря с нападающим бессмысленно.
 */
function slicesOf(player: LitePlayer, peers: LitePlayer[], keys: string[]): LiteSlice[] {
  const line = player.line;
  return keys.map((key) => {
    const def = AXES[key];
    const value = perMatch(player.totals[key] ?? 0, player.matches);
    const pool = peers.map((p) => perMatch(p.totals[key] ?? 0, p.matches));
    return {
      key,
      label: def?.label ?? key,
      hint: def?.hint ?? '',
      group: def?.group ?? 'attack',
      value,
      percentile: percentileOf(value, pool),
      focus: line ? LINE_SETS[line].focus.includes(key) : false,
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
    return { metrics: defaultSharedMetrics(line), showOverall: false, isDefault: true };
  }
  const stored = Array.isArray(row.metrics) ? row.metrics : [];
  const metrics = sanitizeMetrics(stored, line);
  // Набор был непустым, а после проверки не осталось ничего — значит все ключи
  // устарели (так вышло при переезде осей с радара на события). Это не выбор
  // тренера «не показывать ничего», а потерянная настройка: возвращаем умолчание,
  // иначе игрок молча остался бы с пустым кабинетом.
  if (stored.length > 0 && metrics.length === 0) {
    return { metrics: defaultSharedMetrics(line), showOverall: Boolean(row.showOverall), isDefault: true };
  }
  return { metrics, showOverall: Boolean(row.showOverall), isDefault: false };
}

/** Состояние доступа игрока: ссылка выдана и заходил ли он по ней. */
async function accessOf(conn: PoolClient, slug: string, playerId: string) {
  const { rows } = await conn.query<AnyRow>(
    `SELECT link_token_hash AS "hasLink", link_issued_at AS "issuedAt", last_login AS "lastLogin"
       FROM users
      WHERE tenant_id = $1 AND role = 'player' AND player_id = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [slug, playerId],
  );
  const u = rows[0];
  if (!u || !u.hasLink) return { status: 'none' as const, issuedAt: null, lastLogin: null };
  return {
    status: (u.lastLogin ? 'active' : 'issued') as 'active' | 'issued',
    issuedAt: (u.issuedAt as string | null) ?? null,
    lastLogin: (u.lastLogin as string | null) ?? null,
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

  // ── GET /lite/squad/:age — состав с готовыми профилями (экран тренера) ──
  // Всё считается здесь: тренер и игрок обязаны видеть одни и те же числа.
  app.get<{ Params: { age: string } }>('/lite/squad/:age', async (req) => {
    const slug = tenantOf(req);
    const { age } = req.params;
    assertCoach(req, slug, age);
    return withTenant(slug, async (_tx, conn) => {
      const squad = await seasonSquad(conn, slug, `${slug}-${age}`);
      const players = squad.map((p) => {
        const peers = p.line ? squad.filter((x) => x.line === p.line) : [];
        return {
          id: p.id,
          fullName: p.fullName,
          number: p.number,
          photoUrl: p.photoUrl,
          position: p.position,
          positionDetail: p.positionDetail,
          line: p.line,
          lineLabel: p.line ? LINE_SETS[p.line].label : null,
          matches: p.matches,
          minutes: p.minutes,
          minutesPerMatch: p.minutesPerMatch,
          avgOverall: p.avgOverall,
          peersCount: peers.length,
          slices: p.line ? slicesOf(p, peers, axesOfLine(p.line)) : [],
        };
      });
      return { age, players };
    });
  });

  // ── GET /lite/player/:age/:playerId/matches — динамика по матчам ──
  // Тренер хочет видеть не только сезонный профиль, но и как игрок шёл от матча
  // к матчу. Сезонную пиццу этим НЕ подменяем: на одном матче выборка — шум,
  // профиль должен оставаться устойчивым. Здесь только ряд чисел по матчам.
  app.get<{ Params: { age: string; playerId: string } }>(
    '/lite/player/:age/:playerId/matches',
    async (req) => {
      const slug = tenantOf(req);
      const { age, playerId } = req.params;
      assertCoach(req, slug, age);

      return withTenant(slug, async (_tx, conn) => {
        const teamId = `${slug}-${age}`;
        const { rows } = await conn.query<AnyRow>(
          `SELECT m.id AS match_id, m.match_date, m.team_id,
                  m.home_team_id, m.away_team_id, m.home_team_name, m.away_team_name,
                  m.score_home, m.score_away,
                  mp.minutes, mp.ratings, mp.stats
             FROM match_players mp
             JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
            WHERE mp.tenant_id = $1 AND mp.player_id = $2 AND m.team_id = $3
            ORDER BY m.match_date ASC NULLS LAST`,
          [slug, playerId, teamId],
        );

        // Дата — ИСТИНА из календаря ФФСПб: сырой `matches.match_date` пуст или
        // неверен (RU-парсер SportVisor дату не отдаёт), и без этой правки
        // «динамика по матчам» шла бы в произвольном порядке.
        const dated: DatedMatchRow[] = rows.map((m) => ({
          teamId: (m.team_id as string) ?? null,
          homeTeamId: (m.home_team_id as string) ?? null,
          awayTeamId: (m.away_team_id as string) ?? null,
          home: (m.home_team_name as string) ?? null,
          away: (m.away_team_name as string) ?? null,
          scoreHome: m.score_home as number | null,
          scoreAway: m.score_away as number | null,
          date: m.match_date as string | null,
        }));
        await applyFixtureDates(conn, slug, dated);

        const squad = await seasonSquad(conn, slug, teamId);
        const me = squad.find((p) => p.id === playerId) ?? null;
        const line = me?.line ?? null;
        const keys = line ? axesOfLine(line) : [];

        const matches = rows.map((m, i) => {
          const res = ourResult(m);
          const rt = (m.ratings as Record<string, unknown>) ?? {};
          return {
            matchId: String(m.match_id),
            date: dated[i]?.date ?? (m.match_date as string | null),
            opponent: res.opponent,
            result: res.result,
            score: res.us != null ? `${res.us}:${res.them}` : null,
            minutes: Number(m.minutes ?? 0),
            overall: Number(rt.overall ?? 0) || null,
            values: Object.fromEntries(
              keys.map((k) => [k, statAt(m.stats, k, AXES[k]?.mode)]),
            ) as Record<string, number>,
          };
        });

        // Сортируем по ВРЕМЕНИ, а не по строке: applyFixtureDates кладёт в `date`
        // объект Date, и String(...) даёт «Mon May 11 2026…» — сортировка шла по
        // названию дня недели, лента прыгала апрель→июнь→май. Поймано на проде.
        const ts = (d: unknown): number => {
          const n = d ? new Date(d as string).getTime() : Number.NaN;
          return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; // без даты — в конец
        };
        matches.sort((a, b) => ts(a.date) - ts(b.date));

        return {
          playerId,
          line,
          // Сезонное среднее за матч — база сравнения: «выше/ниже своего обычного».
          axes: keys.map((key) => ({
            key,
            label: AXES[key]?.label ?? key,
            hint: AXES[key]?.hint ?? '',
            group: AXES[key]?.group ?? 'attack',
            focus: line ? LINE_SETS[line].focus.includes(key) : false,
            average: me ? perMatch(me.totals[key] ?? 0, me.matches) : 0,
          })),
          matches,
        };
      });
    },
  );

  // ── GET /lite/share/:age/:playerId — что открыто игроку + состояние доступа ──
  app.get<{ Params: { age: string; playerId: string } }>(
    '/lite/share/:age/:playerId',
    async (req) => {
      const slug = tenantOf(req);
      const { age, playerId } = req.params;
      assertCoach(req, slug, age);
      return withTenant(slug, async (_tx, conn) => {
        const squad = await seasonSquad(conn, slug, `${slug}-${age}`);
        const line = squad.find((p) => p.id === playerId)?.line ?? null;
        const share = await shareOf(conn, slug, playerId, line);
        return {
          playerId,
          line,
          lineLabel: line ? LINE_SETS[line].label : null,
          axes: line
            ? axesOfLine(line).map((key) => ({
              key,
              label: AXES[key]?.label ?? key,
              hint: AXES[key]?.hint ?? '',
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

        const squad = await seasonSquad(conn, slug, `${slug}-${age}`);
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

  // ── POST /lite/invite/:age/:playerId — личная ссылка игрока ──
  // Пароля нет вовсе: ссылка и есть ключ. Повторный вызов выдаёт новую и гасит
  // прежнюю — так тренер отзывает доступ, если ссылка ушла не туда.
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

        // 32 байта случайности: ссылка — единственный ключ, подобрать её нельзя.
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');

        const { rows: urow } = await conn.query<AnyRow>(
          `SELECT id FROM users
            WHERE tenant_id = $1 AND role = 'player' AND player_id = $2
            ORDER BY created_at ASC LIMIT 1`,
          [slug, playerId],
        );
        const existing = urow[0];

        if (existing) {
          await conn.query(
            'UPDATE users SET link_token_hash = $1, link_issued_at = now() WHERE id = $2',
            [tokenHash, existing.id],
          );
        } else {
          const userId = `u-${slug}-pl-${randomBytes(4).toString('hex')}`;
          // username оставляем: он не нужен для входа, но по нему человека видно
          // в списке пользователей клуба. password_hash так и остаётся пустым.
          const username = `${loginFromName(String(player.fullName))}-${randomBytes(2).toString('hex')}`;
          await conn.query(
            `INSERT INTO users (id, tenant_id, username, full_name, role, player_id,
                                team_id, password_hash, link_token_hash, link_issued_at, invited_by)
             VALUES ($1, $2, $3, $4, 'player', $5, $6, NULL, $7, now(), $8)`,
            [userId, slug, username, String(player.fullName), playerId,
              `${slug}-${age}`, tokenHash, req.user?.sub ?? null],
          );
        }

        const origin = String(req.headers.origin || '').replace(/\/+$/, '');
        const base = /^https?:\/\//.test(origin) ? origin : 'https://clubs.avandata.ru';
        return {
          ok: true,
          link: `${base}/p/${token}`,
          renewed: Boolean(existing),
        };
      });
    },
  );

  // ── GET /lite/me — кабинет игрока ──
  // Только сам игрок и только про себя. Закрытые оси не попадают в ответ вообще.
  app.get('/lite/me', async (req) => {
    const slug = tenantOf(req);
    if (req.user?.role !== 'player' || !req.user?.playerId) {
      throw new UnauthorizedError('этот раздел — для игрока');
    }
    const playerId = req.user.playerId;

    return withTenant(slug, async (_tx, conn) => {
      const { rows: prow } = await conn.query<AnyRow>(
        'SELECT id, full_name AS "fullName", number, photo_url AS "photoUrl" FROM players WHERE tenant_id = $1 AND id = $2',
        [slug, playerId],
      );
      const base = prow[0];
      if (!base) throw new NotFoundError('игрок не найден');

      const teamId = await teamOfPlayer(conn, slug, playerId);
      const squad = teamId ? await seasonSquad(conn, slug, teamId) : [];
      const me = squad.find((p) => p.id === playerId) ?? null;
      const line = me?.line ?? null;
      const share = await shareOf(conn, slug, playerId, line);
      const peers = line ? squad.filter((p) => p.line === line) : [];

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
        line,
        lineLabel: line ? LINE_SETS[line].label : null,
        peersCount: peers.length,
        // Только открытое тренером — фильтр здесь, до ответа.
        metrics: me && line ? slicesOf(me, peers, share.metrics) : [],
        overall: share.showOverall ? (me?.avgOverall ?? null) : null,
        feedback,
      };
    });
  });

  // ── PATCH /lite/me/response/:id — игрок отвечает на разбор ──
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
