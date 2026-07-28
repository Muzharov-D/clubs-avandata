import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { authenticate } from '../auth/middleware.js';
import { withTenant, withBypassRLS } from '../db/tenantContext.js';
import { tenants } from '../db/schema/tenants.js';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../shared/errors.js';
import { adaptPlayerForLegirus } from './legirusAdapter.js';
import { computeDataQuality } from './dataQuality.js';
import { statField, statFieldTotal } from '../shared/statValue.js';
import { posFullFromCode, posDetailFromCode, posGroupFromCode } from '../shared/positions.js';
import { ourResult } from '../shared/matchResult.js';
import { resolveOurExtId, markOurStandingsRow } from './ourTeam.js';
import { applyFixtureDates, type DatedMatchRow } from './matchDate.js';
import { linkFfspbFixture } from '../upload/ffspbMatchLink.js';
import { lossQuarters } from './lossMapMath.js';
import { teamWriteScope, canReadClubAnalytics } from '../auth/scope.js';
import { isFfspbConfigured } from '../services/ffspbApi.js';
import { syncTenantCalendarTournament } from '../services/calendarService.js';
import { syncTenantStandings } from '../services/standingsService.js';
import {
  aggregateTeamStats,
  type AggregatePeriod,
  type MatchStatsRow,
  type CalendarRoundRow,
} from './teamStatsAggregate.js';

type AnyRow = Record<string, unknown>;

/**
 * PNG из base64 data-URL — портрет (настоящая карта поля ≈520×728), а не широкий
 * обрезок таблицы (≈1036×916). crop_all_b64 иногда кропает не ту область; отличить
 * по размеру в байтах нельзя (реальная карта бывает 15КБ, крошка 5.6КБ), а по
 * пропорции PNG — надёжно. Читаем width/height из IHDR.
 */
function isPortraitPng(dataUrl: unknown): boolean {
  if (typeof dataUrl !== 'string') return false;
  const i = dataUrl.indexOf('base64,');
  if (i < 0) return false;
  try {
    const buf = Buffer.from(dataUrl.slice(i + 7), 'base64');
    if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return false;
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    return h > 0 && w / h < 0.9;
  } catch {
    return false;
  }
}

/**
 * Tenant-scoped data API — для legacy frontend Легируса.
 *
 * Все endpoint'ы требуют валидный JWT и явно фильтруют запросы по tenant_id.
 * Owner-bypass на Render PG (нет BYPASSRLS) — поэтому полагаемся на app-layer.
 */
export async function dataRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  function tenantId(req: { user?: { tenantId: string | null } }): string {
    const id = req.user?.tenantId;
    if (!id) throw new UnauthorizedError('tenant context required');
    return id;
  }

  app.get('/teams', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT id, name, age_group AS "ageGroup", age_label AS "ageLabel",
                year, head_coach AS "headCoach", is_our_team AS "isOurTeam",
                active, meta
           FROM teams WHERE tenant_id = $1 AND active = TRUE
           ORDER BY age_group`,
        [slug],
      );
      return { teams: rows };
    });
  });

  // Клубный обзор для старшего тренера: сводка по ВСЕМ командам клуба.
  // Агрегат поверх существующих данных (teams + matches.team_avg_ratings),
  // без новых таблиц. Рейтинг команды = среднее overall по разобранным матчам;
  // тренд = последний матч против сезонного среднего; флаги — «где горит».
  app.get('/club/summary', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const teamsRes = await conn.query(
        `SELECT id, name, age_group AS "ageGroup", age_label AS "ageLabel",
                year, head_coach AS "headCoach"
           FROM teams WHERE tenant_id = $1 AND active = TRUE
           ORDER BY year DESC NULLS LAST, age_group`,
        [slug],
      );
      const matchesRes = await conn.query(
        `SELECT team_id AS "teamId", match_date AS "date",
                home_team_id AS "homeTeamId", home_team_name AS "home",
                away_team_name AS "away", score_home AS "scoreHome",
                score_away AS "scoreAway", team_avg_ratings AS "teamAvg"
           FROM matches WHERE tenant_id = $1
           ORDER BY match_date DESC NULLS LAST`,
        [slug],
      );

      interface MRow {
        teamId: string; date: string | null; homeTeamId: string | null;
        home: string | null; away: string | null;
        scoreHome: number | null; scoreAway: number | null;
        teamAvg: { overall?: number; attack?: number; defence?: number; fitness?: number } | null;
      }
      const byTeam = new Map<string, MRow[]>();
      for (const m of matchesRes.rows as MRow[]) {
        const arr = byTeam.get(m.teamId) ?? [];
        arr.push(m);
        byTeam.set(m.teamId, arr);
      }
      const r2 = (n: number): number => Math.round(n * 100) / 100;
      const r1 = (n: number): number => Math.round(n * 10) / 10;

      const teams = (teamsRes.rows as Array<Record<string, unknown>>).map((t) => {
        const id = String(t.id);
        const ms = byTeam.get(id) ?? []; // отсортированы по дате DESC
        const rated = ms
          .map((m) => Number(m.teamAvg?.overall))
          .filter((v) => Number.isFinite(v) && v > 0);
        const avgOverall = rated.length ? r2(rated.reduce((a, b) => a + b, 0) / rated.length) : null;
        // Средние по линиям — для «Вертикали развития» (Общий/Атака/Оборона/Физ).
        const avgField = (key: 'attack' | 'defence' | 'fitness'): number | null => {
          const v = ms.map((m) => Number(m.teamAvg?.[key])).filter((x) => Number.isFinite(x) && x > 0);
          return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null;
        };
        const avgAttack = avgField('attack');
        const avgDefence = avgField('defence');
        const avgFitness = avgField('fitness');
        const lastOverall = rated.length ? rated[0] : null;
        // Тренд: последний матч против среднего по ОСТАЛЬНЫМ (иначе последний
        // входит в своё же среднее → смещение к нулю на малом числе матчей).
        const priorRated = rated.slice(1);
        const priorAvg = priorRated.length ? priorRated.reduce((a, b) => a + b, 0) / priorRated.length : null;
        const trend = lastOverall != null && priorAvg != null ? r1(lastOverall - priorAvg) : null;

        const last = ms[0] ?? null;
        let lastMatch: Record<string, unknown> | null = null;
        if (last) {
          const weHome = last.homeTeamId === id; // FK на нашу команду в home/away
          const us = Number(weHome ? last.scoreHome : last.scoreAway) || 0;
          const them = Number(weHome ? last.scoreAway : last.scoreHome) || 0;
          lastMatch = {
            date: last.date, us, them,
            opp: weHome ? last.away : last.home,
            outcome: us > them ? 'W' : us < them ? 'L' : 'D',
          };
        }

        const flags: string[] = [];
        if (ms.length === 0) flags.push('нет матчей');
        else if (ms.length < 2) flags.push('мало данных');
        if (ms.length > 0 && rated.length === 0) flags.push('нет рейтингов');
        if (trend != null && trend <= -0.4) flags.push('спад формы');

        return {
          id, name: t.name, ageGroup: t.ageGroup, ageLabel: t.ageLabel,
          year: t.year, headCoach: t.headCoach,
          matchCount: ms.length, avgOverall, avgAttack, avgDefence, avgFitness,
          trend, lastMatch, flags,
        };
      });
      return { teams };
    });
  });

  // Клубная «карта потерь»: квартальная воронка game-time% по дате рождения —
  // тот же клин, что федерация видит над регионом, но на данных самого клуба.
  // game-time% = минуты игрока (Σ match_players.minutes) ÷ доступные минуты его
  // команды (Σ длин матчей, matches.meta.lengthMin от participationService; fallback 70').
  app.get('/club/loss-map', async (req) => {
    const slug = tenantId(req);
    // Клубная аналитика — для club-wide ролей (НЕ игрок/тренер одной команды).
    const role = req.user?.role;
    if (!canReadClubAnalytics(role)) {
      throw new UnauthorizedError('клубная карта потерь — для тренера клуба и спортдиректора');
    }
    return withTenant(slug, async (_tx, conn) => {
      // Считаем ТОЛЬКО по матчам с FFSPB-участием (meta.lengthMin есть): иначе
      // смешались бы единицы и удвоились бы матчи с SportVisor-загрузками (другой
      // ext_match_id + минуты из PDF). Так воронка консистентна.
      const { rows } = await conn.query(
        `WITH team_avail AS (
           SELECT team_id, SUM(COALESCE(NULLIF(meta->>'lengthMin','')::int, 70)) AS avail
             FROM matches WHERE tenant_id = $1 AND (meta->>'lengthMin') IS NOT NULL
             GROUP BY team_id
         ), player_min AS (
           SELECT mp.player_id, SUM(COALESCE(mp.minutes, 0)) AS mins
             FROM match_players mp
             JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
            WHERE mp.tenant_id = $1 AND (m.meta->>'lengthMin') IS NOT NULL
            GROUP BY mp.player_id
         )
         SELECT p.full_name AS "fullName",
                EXTRACT(MONTH FROM p.birth_date)::int AS "birthMonth",
                t.name AS "teamName",
                COALESCE(pm.mins, 0)::int AS mins,
                COALESCE(ta.avail, 0)::int AS avail
           FROM players p
           JOIN teams t ON t.id = p.team_id AND t.tenant_id = $1
           LEFT JOIN player_min pm ON pm.player_id = p.id
           LEFT JOIN team_avail ta ON ta.team_id = p.team_id
          WHERE p.tenant_id = $1 AND p.birth_date IS NOT NULL`,
        [slug],
      );
      interface LRow { fullName: string | null; birthMonth: number; teamName: string | null; mins: number; avail: number }
      const pts = (rows as LRow[])
        .filter((r) => Number(r.avail) > 0)
        .map((r) => ({
          q: Math.floor((Number(r.birthMonth) - 1) / 3), // 0..3
          pct: Math.min(1, Number(r.mins) / Number(r.avail)), // ≤100% (страховка от seed-артефактов)
          name: r.fullName ?? '?',
          team: r.teamName ?? '',
        }));
      return lossQuarters(pts);
    });
  });

  // Кадровый резерв клуба: топ-игроки по ВСЕМ командам (сезонный рейтинг),
  // для старшего тренера. Флаг aboveTeam — игрок заметно выше среднего своей
  // команды (кандидат «двигать выше»). Поверх существующих данных.
  app.get('/club/talent', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const teamsRes = await conn.query(
        `SELECT id, name, age_label AS "ageLabel" FROM teams
          WHERE tenant_id = $1 AND active = TRUE`,
        [slug],
      );
      const tLabel = new Map<string, string>();
      for (const t of teamsRes.rows as Array<Record<string, unknown>>) {
        tLabel.set(String(t.id), String(t.ageLabel ?? t.name ?? t.id));
      }

      const { rows } = await conn.query(
        `SELECT mp.player_id AS "playerId", p.full_name AS "fullName", p.photo_url AS "photoUrl",
                mp.position, mp.minutes, mp.ratings, mp.stats, m.team_id AS "teamId"
           FROM match_players mp
           JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
           JOIN players p ON p.id = mp.player_id
          WHERE mp.tenant_id = $1
          ORDER BY m.match_date DESC NULLS LAST`,
        [slug],
      );
      interface PRow {
        playerId: string; fullName: string | null; photoUrl: string | null;
        position: string | null; minutes: number | null;
        ratings: { overall?: number } | null; stats: unknown; teamId: string | null;
      }
      interface Agg {
        id: string; fullName: string; photoUrl: string | null;
        matches: number; minutes: number; ratedOveralls: number[];
        goals: number; assists: number;
        teamMin: Map<string, number>; posMin: Map<string, number>;
      }
      const byId = new Map<string, Agg>();
      for (const r of rows as PRow[]) {
        const id = String(r.playerId);
        let a = byId.get(id);
        if (!a) {
          a = { id, fullName: String(r.fullName ?? ''), photoUrl: r.photoUrl ?? null,
                matches: 0, minutes: 0, ratedOveralls: [], goals: 0, assists: 0,
                teamMin: new Map(), posMin: new Map() };
          byId.set(id, a);
        }
        a.matches += 1;
        const mins = Number(r.minutes ?? 0);
        a.minutes += mins;
        const w = mins > 0 ? mins : 1;
        const ov = Number(r.ratings?.overall ?? 0);
        if (ov > 0) a.ratedOveralls.push(ov); // строки date DESC → массив тоже DESC
        if (r.teamId) a.teamMin.set(String(r.teamId), (a.teamMin.get(String(r.teamId)) ?? 0) + w);
        if (r.position && String(r.position).trim()) {
          const c = String(r.position).trim().toUpperCase();
          a.posMin.set(c, (a.posMin.get(c) ?? 0) + w);
        }
        a.goals += statField(r.stats, 'attack', 'goal');
        a.assists += statField(r.stats, 'attack', 'assist');
      }
      const r2 = (n: number): number => Math.round(n * 100) / 100;
      const r1 = (n: number): number => Math.round(n * 10) / 10;
      const top = (m: Map<string, number>): string | null =>
        [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

      const players = [...byId.values()].map((a) => {
        const rated = a.ratedOveralls;
        const avgOverall = rated.length ? r2(rated.reduce((x, y) => x + y, 0) / rated.length) : null;
        const last = rated.length ? rated[0] : null;
        const prior = rated.slice(1);
        const priorAvg = prior.length ? prior.reduce((x, y) => x + y, 0) / prior.length : null;
        const trend = last != null && priorAvg != null ? r1(last - priorAvg) : null;
        const teamId = top(a.teamMin);
        const posCode = top(a.posMin);
        return {
          id: a.id, fullName: a.fullName, photoUrl: a.photoUrl,
          matches: a.matches, minutes: a.minutes, avgOverall, trend,
          goals: a.goals, assists: a.assists,
          teamId, teamLabel: teamId ? (tLabel.get(teamId) ?? null) : null,
          position: posCode ? (posFullFromCode(posCode) ?? posCode) : null,
          positionCode: posCode,
        };
      }).filter((p) => p.avgOverall != null);

      // Среднее по команде → флаг «заметно выше своей команды» (кандидат выше).
      const teamAcc = new Map<string, { sum: number; n: number }>();
      for (const p of players) {
        if (!p.teamId || p.avgOverall == null) continue;
        const t = teamAcc.get(p.teamId) ?? { sum: 0, n: 0 };
        t.sum += p.avgOverall; t.n += 1; teamAcc.set(p.teamId, t);
      }
      const withFlag = players.map((p) => {
        const ta = p.teamId ? teamAcc.get(p.teamId) : null;
        const teamMean = ta && ta.n ? ta.sum / ta.n : null;
        const aboveTeam = teamMean != null && p.avgOverall != null && (p.avgOverall - teamMean) >= 0.5;
        return { ...p, aboveTeam };
      }).sort((x, y) => (y.avgOverall ?? 0) - (x.avgOverall ?? 0));

      return { players: withFlag };
    });
  });

  app.get<{ Querystring: { teamId?: string } }>('/players', async (req) => {
    const slug = tenantId(req);
    const teamId = req.query.teamId;
    return withTenant(slug, async (_tx, conn) => {
      const sql = teamId
        ? `SELECT id, team_id AS "teamId", full_name AS "fullName",
                  first_name AS "firstName", last_name AS "lastName",
                  number, position, position_full AS "positionFull",
                  birth_date AS "birthDate", photo_url AS "photoUrl",
                  extra_teams AS "extraTeams"
             FROM players WHERE tenant_id = $1 AND team_id = $2
             ORDER BY number NULLS LAST, last_name`
        : `SELECT id, team_id AS "teamId", full_name AS "fullName",
                  first_name AS "firstName", last_name AS "lastName",
                  number, position, position_full AS "positionFull",
                  birth_date AS "birthDate", photo_url AS "photoUrl",
                  extra_teams AS "extraTeams"
             FROM players WHERE tenant_id = $1
             ORDER BY team_id, number NULLS LAST, last_name`;
      const params: unknown[] = teamId ? [slug, teamId] : [slug];
      const { rows } = await conn.query(sql, params);
      return rows;
    });
  });

  app.get<{ Params: { playerId: string } }>('/player/:playerId', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT id, team_id AS "teamId", full_name AS "fullName",
                first_name AS "firstName", last_name AS "lastName",
                number, position, position_full AS "positionFull",
                birth_date AS "birthDate", photo_url AS "photoUrl",
                extra_teams AS "extraTeams", meta
           FROM players WHERE tenant_id = $1 AND id = $2`,
        [slug, req.params.playerId],
      );
      if (rows.length === 0) throw new NotFoundError('player not found');
      // Legacy PlayerDetail expects { player: {...} }
      return { player: rows[0] };
    });
  });

  app.get<{ Querystring: { teamId?: string } }>('/matches', async (req) => {
    const slug = tenantId(req);
    const teamId = req.query.teamId;
    return withTenant(slug, async (_tx, conn) => {
      const sql = teamId
        ? `SELECT id, team_id AS "teamId", ext_match_id AS "extMatchId",
                  home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
                  home_team_name AS "home", away_team_name AS "away",
                  match_date AS "date", season, tournament,
                  score_home AS "scoreHome", score_away AS "scoreAway",
                  data_quality AS "dataQuality", coach_note AS "coachNote", meta
             FROM matches WHERE tenant_id = $1 AND team_id = $2
             ORDER BY match_date DESC NULLS LAST`
        : `SELECT id, team_id AS "teamId", ext_match_id AS "extMatchId",
                  home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
                  home_team_name AS "home", away_team_name AS "away",
                  match_date AS "date", season, tournament,
                  score_home AS "scoreHome", score_away AS "scoreAway",
                  data_quality AS "dataQuality", coach_note AS "coachNote", meta
             FROM matches WHERE tenant_id = $1
             ORDER BY match_date DESC NULLS LAST`;
      const params: unknown[] = teamId ? [slug, teamId] : [slug];
      const { rows } = await conn.query(sql, params);
      // Реальная дата матча из календаря Наградиона (по сопернику + возрасту):
      // парсер нового RU-формата дату не отдаёт, match_date был неверным.
      await applyFixtureDates(conn, slug, rows as DatedMatchRow[]);
      rows.sort((a, b) => {
        const ad = a.date ? new Date(a.date as string).getTime() : -Infinity;
        const bd = b.date ? new Date(b.date as string).getTime() : -Infinity;
        return bd - ad;
      });
      // Legacy ClubOverview expects { matches: [...] }
      return { matches: rows };
    });
  });

  // Агрегат командных показателей за период: 1 круг / 2 круг / сезон. Усредняет
  // нашу сторону teamSummaryStats + рейтинги + командные агрегаты по матчам периода.
  // Границы кругов — по дате матча (1 круг = до 25 июля, см. teamStatsAggregate.ts).
  app.get<{ Querystring: { teamId?: string; period?: string } }>(
    '/matches/aggregate',
    async (req) => {
      const slug = tenantId(req);
      const teamId = req.query.teamId;
      const period = (req.query.period ?? 'season') as AggregatePeriod;
      if (!teamId) throw new BadRequestError('teamId required');
      if (!['round1', 'round2', 'season'].includes(period)) {
        throw new BadRequestError('period must be round1 | round2 | season');
      }
      return withTenant(slug, async (_tx, conn) => {
        const { rows: teamRows } = await conn.query(
          `SELECT id, name, age_group AS "ageGroup"
             FROM teams WHERE tenant_id = $1 AND id = $2`,
          [slug, teamId],
        );
        if (teamRows.length === 0) throw new NotFoundError('team not found');
        const team = teamRows[0] as { id: string; name: string | null; ageGroup: string };

        const { rows: matchRows } = await conn.query(
          `SELECT id, team_id AS "teamId",
                  home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
                  home_team_name AS "home", away_team_name AS "away",
                  match_date AS "date",
                  team_summary_stats AS "teamSummaryStats",
                  team_avg_ratings AS "teamAvgRatings",
                  team_aggregates AS "teamAggregates"
             FROM matches
            WHERE tenant_id = $1 AND team_id = $2 AND team_summary_stats IS NOT NULL`,
          [slug, teamId],
        );

        const { rows: calRows } = await conn.query(
          `SELECT match_date AS "date", round
             FROM calendar
            WHERE tenant_id = $1 AND age_group = $2 AND is_our_match = TRUE`,
          [slug, team.ageGroup],
        );

        return aggregateTeamStats(
          matchRows as MatchStatsRow[],
          calRows as CalendarRoundRow[],
          { id: team.id, name: team.name },
          period,
        );
      });
    },
  );

  app.get<{ Params: { matchId: string } }>('/match/:matchId', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT id, team_id AS "teamId", ext_match_id AS "extMatchId",
                home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
                home_team_name AS "home", away_team_name AS "away",
                match_date AS "date", season, tournament,
                score_home AS "scoreHome", score_away AS "scoreAway",
                team_summary_stats AS "teamSummaryStats",
                team_aggregates AS "teamAggregates",
                team_avg_ratings AS "teamAvgRatings",
                data_quality AS "dataQuality", coach_note AS "coachNote", meta
           FROM matches WHERE tenant_id = $1 AND id = $2`,
        [slug, req.params.matchId],
      );
      if (rows.length === 0) throw new NotFoundError('match not found');
      const match = rows[0];
      const { rows: mp } = await conn.query(
        `SELECT mp.player_id AS "id",
                mp.player_id AS "playerId",
                p.team_id AS "teamId",
                p.full_name AS "fullName",
                p.first_name AS "firstName", p.last_name AS "lastName",
                p.photo_url AS "photoUrl",
                mp.number, mp.position, mp.position_full AS "positionFull",
                mp.minutes, mp.ratings, mp.stats, mp.splits, mp.radar, mp.maps
           FROM match_players mp
           JOIN players p ON p.id = mp.player_id
           WHERE mp.tenant_id = $1 AND mp.match_id = $2`,
        [slug, req.params.matchId],
      );
      // Адаптер: rich PDF flat stats → Легирус-shape (attack1/2/3/4/5, defence1/2/3, fitness)
      // + legacy-shape для ClubOverview/MatchDetail: homeTeam.name / awayTeam.name / score.{home,away}
      // + лифт meta.teamMaps в teamAggregates.<slug>.mapImage (для MatchDetail.SECTION_MAPS)
      // + лифт meta.formationImage в top-level (для FormationField imageSrc)
      const metaObj = (match.meta ?? {}) as Record<string, unknown>;
      const teamMaps = (metaObj.teamMaps as Record<string, string>) || {};
      const formationImg = (metaObj.formationImage as string | null) ?? null;
      const taSrc = (match.teamAggregates as Record<string, unknown>) || {};
      const teamAggregates: Record<string, unknown> = { ...taSrc };
      // Маппинг slug'ов crop_all_b64 → SECTION_MAPS-id frontend'а
      const SLUG_ALIAS: Record<string, string> = {
        'set-pieces': 'setPieces',
        'recoveries': 'recoveriesAndTackling',
      };
      // Лифтим в mapImage ТОЛЬКО портретные base64 (настоящие карты поля).
      // Широкие обрезки таблиц (crop-мусор) отсеиваются по пропорции — см. isPortraitPng.
      for (const [pyslug, dataUrl] of Object.entries(teamMaps)) {
        if (!isPortraitPng(dataUrl)) continue;
        const slug = SLUG_ALIAS[pyslug] ?? pyslug;
        const existing = (teamAggregates[slug] as Record<string, unknown>) || {};
        teamAggregates[slug] = { ...existing, mapImage: dataUrl };
      }
      // Убираем битые ссылки на файлы: teamAggregates.<section>.mapImage из парсера —
      // путь вида «/assets/maps/…png», но файлов на сервере нет → <img> 404 → белый
      // прямоугольник. Оставляем только валидные data-URL (реальные карты выше),
      // остальным ставим null — frontend (if (!map) return null) скроет карточку.
      for (const slug of Object.keys(teamAggregates)) {
        const sec = (teamAggregates[slug] as Record<string, unknown>) || {};
        const img = sec.mapImage;
        if (typeof img === 'string' && !img.startsWith('data:')) {
          teamAggregates[slug] = { ...sec, mapImage: null };
        }
      }
      // Ориентация «дом/гость» по ID: наша сторона та, чей team-id == match.teamId.
      // homeTeamId/awayTeamId заполняются при upload (наша сторона) + backfill'ом;
      // для незабэкфилленных legacy-строк оба null → фронт падает на fallback по имени.
      // Реальная дата из календаря Наградиона (по сопернику + возрасту команды).
      await applyFixtureDates(conn, slug, [match as DatedMatchRow]);
      // Кресты соперника из FFSPB-фикстуры (привязка на upload, см. ffspbMatchLink).
      // Детерминированный источник — фронт-resolveShield первым берёт teamObj.shield,
      // иначе падает на нечёткий поиск по имени в standings.
      let homeShield = (metaObj.homeShield as string | null) ?? null;
      let awayShield = (metaObj.awayShield as string | null) ?? null;
      let homeName = match.home as string | null;
      let awayName = match.away as string | null;
      // Backfill на лету для legacy-матчей (загружены до FFSPB-линка): тем же
      // консервативным правилом (счёт + имя, единственность) резолвим крест +
      // каноническое имя соперника. Зеркалит applyFixtureDates выше; best-effort.
      if (homeShield == null && awayShield == null) {
        try {
          const ourSide = match.homeTeamId === match.teamId ? 'home'
            : match.awayTeamId === match.teamId ? 'away' : null;
          if (ourSide) {
            const tRes = await conn.query<{ name: string; ageGroup: string }>(
              `SELECT name, age_group AS "ageGroup" FROM teams WHERE id = $1`, [match.teamId],
            );
            const ageGroup = tRes.rows[0]?.ageGroup ?? null;
            const ourName = tRes.rows[0]?.name ?? null;
            if (ageGroup) {
              const link = await linkFfspbFixture(
                conn, slug, ageGroup, ourName, ourSide,
                String(homeName ?? ''), String(awayName ?? ''),
                { home: match.scoreHome as number | null, away: match.scoreAway as number | null },
              );
              if (link) {
                if (ourSide === 'home') {
                  awayShield = link.opponentShield;
                  if (link.opponentName) awayName = link.opponentName;
                } else {
                  homeShield = link.opponentShield;
                  if (link.opponentName) homeName = link.opponentName;
                }
              }
            }
          }
        } catch (e) {
          app.log.warn({ matchId: match.id, err: (e as Error).message }, '[match] FFSPB shield backfill skipped');
        }
      }
      return {
        ...match,
        home: homeName,
        away: awayName,
        homeTeam: { id: match.homeTeamId, name: homeName, isOurTeam: match.homeTeamId === match.teamId, shield: homeShield },
        awayTeam: { id: match.awayTeamId, name: awayName, isOurTeam: match.awayTeamId === match.teamId, shield: awayShield },
        score:    { home: match.scoreHome ?? 0, away: match.scoreAway ?? 0 },
        date:     match.date,
        teamAggregates,
        formation: metaObj.formation ?? null,
        formationImage: formationImg,
        formationImageFull: formationImg,
        events: (metaObj.events as unknown[]) ?? [],
        // Индикатор достоверности (Phase 1): кешированный снапшот или расчёт на лету
        // (для старых матчей до миграции 0006).
        dataQuality: match.dataQuality ?? computeDataQuality(match, mp),
        coachNote: match.coachNote ?? null,
        players:  mp.map(adaptPlayerForLegirus),
      };
    });
  });

  // Заметка тренера к загруженному разбору (Phase 3). Только тренеры.
  app.patch<{ Params: { matchId: string }; Body: { note?: string } }>(
    '/match/:matchId/note',
    async (req) => {
      const slug = tenantId(req);
      const role = req.user?.role;
      if (teamWriteScope(role, req.user?.teamId) === 'deny') {
        throw new UnauthorizedError('нет прав на правку заметки матча');
      }
      const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 5000) : null;
      return withTenant(slug, async (_tx, conn) => {
        // team_coach редактирует только СВОЙ матч (по team_id); head_coach — любой.
        // (teamWriteScope в гейте выше уже отсёк team_coach без teamId.)
        const ts = role === 'team_coach' && req.user?.teamId;
        const { rowCount } = await conn.query(
          `UPDATE matches SET coach_note = $1 WHERE tenant_id = $2 AND id = $3${ts ? ' AND team_id = $4' : ''}`,
          ts ? [note, slug, req.params.matchId, req.user!.teamId] : [note, slug, req.params.matchId],
        );
        if (!rowCount) throw new NotFoundError('match not found');
        return { ok: true, coachNote: note };
      });
    },
  );

  // Комментарий тренера к матчу КАЛЕНДАРЯ (разбор для родителей).
  // Фронт (`updateMatchCoachComment`) звал этот путь с самого начала, а роута не
  // существовало: PATCH уходил в 404, форма показывала успех, текст молча терялся.
  // Адресация — (возраст, внешний id матча), как в callups/trainings.
  app.patch<{ Params: { age: string; extMatchId: string }; Body: { comment?: string } }>(
    '/match/:age/:extMatchId/comment',
    async (req) => {
      const slug = tenantId(req);
      const role = req.user?.role;
      if (teamWriteScope(role, req.user?.teamId) === 'deny') {
        throw new UnauthorizedError('нет прав на правку комментария к матчу');
      }
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.slice(0, 4000) : null;
      const { age, extMatchId } = req.params;
      return withTenant(slug, async (_tx, conn) => {
        const { rowCount } = await conn.query(
          `UPDATE calendar SET coach_comment = $1
            WHERE tenant_id = $2 AND age_group = $3 AND ext_match_id = $4`,
          [comment, slug, age, extMatchId],
        );
        if (!rowCount) throw new NotFoundError('матч календаря не найден');
        return { ok: true, coachComment: comment };
      });
    },
  );

  app.delete<{ Params: { matchId: string } }>('/match/:matchId', async (req) => {
    const slug = tenantId(req);
    const role = req.user?.role;
    if (teamWriteScope(role, req.user?.teamId) === 'deny') {
      throw new UnauthorizedError('нет прав на удаление матча');
    }
    return withTenant(slug, async (_tx, conn) => {
      // team_coach удаляет только СВОЙ матч (head_coach — любой); гейт teamWriteScope выше отсёк team_coach без teamId.
      if (role === 'team_coach' && req.user?.teamId) {
        const own = await conn.query(`SELECT 1 FROM matches WHERE tenant_id = $1 AND id = $2 AND team_id = $3`, [slug, req.params.matchId, req.user.teamId]);
        if (!own.rowCount) throw new NotFoundError('match not found');
      }
      // FK: сначала match_players, потом сам матч. Всё строго в рамках tenant.
      await conn.query(`DELETE FROM match_players WHERE tenant_id = $1 AND match_id = $2`, [slug, req.params.matchId]);
      const { rowCount } = await conn.query(
        `DELETE FROM matches WHERE tenant_id = $1 AND id = $2`,
        [slug, req.params.matchId],
      );
      if (!rowCount) throw new NotFoundError('match not found');
      return { ok: true, deleted: req.params.matchId };
    });
  });

  // ─── Phase 2: тренды и сезонные агрегаты ──────────────────────────────
  // Результат матча с НАШЕЙ стороны — общий модуль `shared/matchResult.ts`
  // (кабинету Lite он тоже нужен, копия дала бы второй расходящийся счёт).

  // Тренд одного игрока по матчам сезона (rating/минуты/голы по матчам).
  app.get<{ Params: { playerId: string } }>('/player/:playerId/trend', async (req) => {
    const slug = tenantId(req);
    const pid = req.params.playerId;
    // Игрок видит только себя; тренеры — всех.
    if (req.user?.role === 'player' && req.user.playerId !== pid) {
      throw new UnauthorizedError('players can only view their own trend');
    }
    return withTenant(slug, async (_tx, conn) => {
      const { rows: prow } = await conn.query(
        `SELECT id, full_name AS "fullName", number, position FROM players WHERE tenant_id = $1 AND id = $2`,
        [slug, pid],
      );
      if (!prow[0]) throw new NotFoundError('player not found');
      const { rows } = await conn.query<AnyRow>(
        `SELECT m.id AS match_id, m.match_date, m.home_team_id, m.away_team_id, m.team_id,
                m.home_team_name, m.away_team_name, m.score_home, m.score_away,
                mp.minutes, mp.ratings, mp.stats
           FROM match_players mp
           JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
          WHERE mp.tenant_id = $1 AND mp.player_id = $2
          ORDER BY m.match_date ASC NULLS LAST`,
        [slug, pid],
      );
      // Дата матча — ИСТИНА из календаря FFSPB (applyFixtureDates), а не сырой
      // match_date (RU-парсер дату не отдаёт → бывает неверной). Иначе текст
      // профиля «последний матч N мая» расходился со списком/разбором, где дата
      // уже фикстурная. Меняем ТОЛЬКО даты trend — остальные эндпоинты не трогаем.
      const datedRows: DatedMatchRow[] = rows.map((m) => ({
        teamId: (m.team_id as string) ?? null,
        homeTeamId: (m.home_team_id as string) ?? null,
        awayTeamId: (m.away_team_id as string) ?? null,
        home: (m.home_team_name as string) ?? null,
        away: (m.away_team_name as string) ?? null,
        scoreHome: m.score_home as number | null,
        scoreAway: m.score_away as number | null,
        date: m.match_date as string | null,
      }));
      await applyFixtureDates(conn, slug, datedRows);
      const series = rows.map((m, i) => {
        const r = (m.ratings as Record<string, unknown>) ?? {};
        const res = ourResult(m);
        return {
          matchId: m.match_id,
          date: datedRows[i]?.date ?? m.match_date,
          opponent: res.opponent,
          result: res.result,
          score: res.us != null ? `${res.us}:${res.them}` : null,
          minutes: Number(m.minutes ?? 0),
          overall: Number(r.overall ?? 0),
          attack: Number(r.attack ?? 0),
          defence: Number(r.defence ?? 0),
          fitness: Number(r.fitness ?? 0),
          goals: statField(m.stats, 'attack', 'goal'),
          assists: statField(m.stats, 'attack', 'assist'),
          distance: statField(m.stats, 'fitness', 'totalDistance'),
        };
      });
      return { player: prow[0], series };
    });
  });

  // Сезонные агрегаты по всем игрокам команды — основа рейтингов/перцентилей/
  // сравнения/контроля нагрузки (Phase 2), а также сезонного дашборда /club
  // (топ-5, профили, состав, средний рейтинг). Доступно всем участникам клуба —
  // те же рейтинги уже показываются на /club по последнему матчу.
  // Разбор кода позиции (слово / детальная роль / линия) — общий модуль
  // `shared/positions.ts`. Раньше жил здесь локально и был недоступен другим
  // модулям; кабинету Lite он нужен, а копия породила бы ещё один `lineOf`.

  app.get<{ Querystring: { teamId?: string } }>('/players/season', async (req) => {
    const slug = tenantId(req);
    const teamId = req.query.teamId;
    if (!teamId) throw new BadRequestError('teamId is required', 'NO_TEAM');
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query<AnyRow>(
        `SELECT mp.player_id, p.full_name AS "fullName", p.number, mp.position, p.photo_url AS "photoUrl",
                mp.minutes, mp.ratings, mp.stats, mp.radar, m.match_date
           FROM match_players mp
           JOIN matches m ON m.id = mp.match_id AND m.tenant_id = $1
           JOIN players p ON p.id = mp.player_id
          WHERE mp.tenant_id = $1 AND m.team_id = $2
          ORDER BY m.match_date ASC NULLS LAST`,
        [slug, teamId],
      );
      type Agg = {
        id: string; fullName: string; number: number | null; position: string | null; positionFull: string | null; photoUrl: string | null;
        matches: number; minutes: number;
        sumOverall: number; sumAttack: number; sumDefence: number; sumFitness: number; ratedMatches: number;
        goals: number; assists: number; shots: number; keyPass: number; dribble: number;
        tackle: number; interception: number; recovery: number; duel: number; pressing: number;
        distance: number; sprintDistance: number;
        radarAcc: Map<string, { sum: number; count: number }>;
        posMin: Map<string, number>;
      };
      const byId = new Map<string, Agg>();
      for (const r of rows) {
        const id = String(r.player_id);
        let a = byId.get(id);
        if (!a) {
          a = {
            id, fullName: String(r.fullName ?? ''), number: r.number as number | null,
            position: r.position as string | null, positionFull: r.position as string | null, photoUrl: (r.photoUrl as string | null) ?? null,
            matches: 0, minutes: 0, sumOverall: 0, sumAttack: 0, sumDefence: 0, sumFitness: 0, ratedMatches: 0,
            goals: 0, assists: 0, shots: 0, keyPass: 0, dribble: 0,
            tackle: 0, interception: 0, recovery: 0, duel: 0, pressing: 0,
            distance: 0, sprintDistance: 0,
            radarAcc: new Map(),
            posMin: new Map(),
          };
          byId.set(id, a);
        }
        a.matches += 1;
        // Позиция = роль из mp.position поматчево, агрегируем по СУММЕ МИНУТ за
        // сезон (источник истины — отчёт SportVisor). НЕ «последний матч»: сырой
        // matches.match_date в БД пуст/неверен (реальные даты — из календаря FFSPB
        // при отображении), поэтому «последний» врал — мультипозиционного игрока
        // мог пометить случайной ролью. Доминанта и распределение считаются ниже.
        if (r.position != null && String(r.position).trim()) {
          const code = String(r.position).trim().toUpperCase();
          const w = Number(r.minutes) > 0 ? Number(r.minutes) : 1; // 0/нет минут → вес 1
          a.posMin.set(code, (a.posMin.get(code) ?? 0) + w);
        }
        a.minutes += Number(r.minutes ?? 0);
        const rt = (r.ratings as Record<string, unknown>) ?? {};
        const ov = Number(rt.overall ?? 0);
        if (ov > 0) {
          a.ratedMatches += 1;
          a.sumOverall += ov;
          a.sumAttack += Number(rt.attack ?? 0);
          a.sumDefence += Number(rt.defence ?? 0);
          a.sumFitness += Number(rt.fitness ?? 0);
        }
        // Сезонный радар (8 осей) — среднее по матчам, где ось присутствует.
        const radar = (r.radar as Record<string, unknown>) ?? {};
        for (const [k, v] of Object.entries(radar)) {
          const n = Number(typeof v === 'object' && v ? (v as AnyRow).value : v);
          if (!Number.isFinite(n) || n <= 0) continue;
          const acc = a.radarAcc.get(k) ?? { sum: 0, count: 0 };
          acc.sum += n; acc.count += 1;
          a.radarAcc.set(k, acc);
        }
        a.goals += statField(r.stats, 'attack', 'goal');
        a.assists += statField(r.stats, 'attack', 'assist');
        a.shots += statFieldTotal(r.stats, 'attack', 'shot');  // total попыток — как в per-match разборе
        a.keyPass += statField(r.stats, 'attack', 'keyPass');
        a.dribble += statField(r.stats, 'attack', 'dribble');
        a.tackle += statField(r.stats, 'defence', 'tackle');
        a.interception += statField(r.stats, 'defence', 'interception');
        a.recovery += statField(r.stats, 'defence', 'recovery');
        a.duel += statField(r.stats, 'defence', 'duel');
        a.pressing += statField(r.stats, 'defence', 'pressing');
        a.distance += statField(r.stats, 'fitness', 'totalDistance');
        a.sprintDistance += statField(r.stats, 'fitness', 'sprintDistance');
      }
      const players = [...byId.values()].map((a) => {
        // Позиции по сумме минут за сезон (источник истины = mp.position поматчево).
        const positions = [...a.posMin.entries()]
          .map(([code, mins]) => ({ code, full: posDetailFromCode(code) ?? code, group: posGroupFromCode(code), minutes: Math.round(mins) }))
          .filter((p) => p.group)
          .sort((x, y) => y.minutes - x.minutes);
        const dominant = positions[0] ?? null;
        const domWord = dominant ? (posFullFromCode(dominant.code) ?? a.positionFull) : a.positionFull;
        return {
        id: a.id, fullName: a.fullName, number: a.number,
        position: domWord, positionFull: domWord,
        positionCode: dominant?.code ?? null, positionDetail: dominant?.full ?? domWord,
        positions,
        photoUrl: a.photoUrl,
        matches: a.matches, minutes: a.minutes,
        avgOverall: a.ratedMatches ? Number((a.sumOverall / a.ratedMatches).toFixed(2)) : 0,
        avgAttack: a.ratedMatches ? Number((a.sumAttack / a.ratedMatches).toFixed(2)) : 0,
        avgDefence: a.ratedMatches ? Number((a.sumDefence / a.ratedMatches).toFixed(2)) : 0,
        avgFitness: a.ratedMatches ? Number((a.sumFitness / a.ratedMatches).toFixed(2)) : 0,
        goals: a.goals, assists: a.assists, shots: a.shots, keyPass: a.keyPass, dribble: a.dribble,
        tackle: a.tackle, interception: a.interception, recovery: a.recovery, duel: a.duel, pressing: a.pressing,
        distance: Math.round(a.distance), sprintDistance: Math.round(a.sprintDistance),
        // нагрузка: средние минуты за матч (для контроля перегруза в академии)
        minutesPerMatch: a.matches ? Math.round(a.minutes / a.matches) : 0,
        // сезонный радар (8 осей) — среднее по сыгранным матчам, для профилей на /club
        radar: Object.fromEntries(
          [...a.radarAcc.entries()].map(([k, { sum, count }]) => [k, Number((sum / count).toFixed(2))]),
        ),
        };
      });
      return { teamId, players };
    });
  });

  app.get<{ Params: { ageGroup: string } }>('/standings/:ageGroup', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT age_group AS "ageGroup", season, league_name AS "leagueName",
                source_url AS "source", table_data AS "table", fetched_at AS "lastUpdated"
           FROM standings
           WHERE tenant_id = $1 AND age_group = $2
           ORDER BY fetched_at DESC LIMIT 1`,
        [slug, req.params.ageGroup],
      );
      if (rows.length === 0) throw new NotFoundError('standings not found');
      const r = rows[0];
      const table = await markOurStandingsRow(conn, slug, r.ageGroup as string, r.table);
      return { ...r, table, title: `${r.leagueName} · ${r.ageGroup} г.р.` };
    });
  });

  app.get('/standings', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT DISTINCT ON (age_group)
                age_group AS "ageGroup", season, league_name AS "leagueName",
                source_url AS "source", table_data AS "table", fetched_at AS "lastUpdated"
           FROM standings WHERE tenant_id = $1
           ORDER BY age_group, fetched_at DESC`,
        [slug],
      );
      // Legacy ClubPage ожидает { ageGroups: string[], standings: Record<age, ...> }
      const ageGroups: string[] = [];
      const standings: Record<string, unknown> = {};
      for (const r of rows) {
        ageGroups.push(r.ageGroup);
        const table = await markOurStandingsRow(conn, slug, r.ageGroup as string, r.table);
        standings[r.ageGroup] = { ...r, table, title: `${r.leagueName} · ${r.ageGroup} г.р.` };
      }
      return { ageGroups, standings };
    });
  });

  app.get<{ Params: { ageGroup: string } }>('/cup/:ageGroup', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT age_group AS "ageGroup", season, cup_name AS "cupName",
                source_url AS "source", rounds_data AS "rounds", fetched_at AS "lastUpdated"
           FROM cup_brackets WHERE tenant_id = $1 AND age_group = $2
           ORDER BY fetched_at DESC LIMIT 1`,
        [slug, req.params.ageGroup],
      );
      // Возвращаем null вместо 404 — у тенанта может ещё не быть кубка.
      // Frontend graceful — рендерит «нет кубка».
      return rows[0] ?? { ageGroup: req.params.ageGroup, rounds: [], cupName: null };
    });
  });

  app.get('/cup', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT DISTINCT ON (age_group)
                age_group AS "ageGroup", season, cup_name AS "cupName",
                source_url AS "source", rounds_data AS "rounds", fetched_at AS "lastUpdated"
           FROM cup_brackets WHERE tenant_id = $1
           ORDER BY age_group, fetched_at DESC`,
        [slug],
      );
      return rows;
    });
  });

  app.get<{ Params: { ageGroup: string } }>('/calendar/:ageGroup', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows: meta } = await conn.query(
        `SELECT season, title, parser_hint AS "parserHint", sources, fetched_at AS "lastUpdated"
           FROM calendar_meta WHERE tenant_id = $1 AND age_group = $2`,
        [slug, req.params.ageGroup],
      );
      const { rows: matches } = await conn.query(
        `SELECT ext_match_id AS "matchId", match_date AS "date",
                home_team AS "home", away_team AS "away",
                ext_home_team_id AS "homeTeamId", ext_away_team_id AS "awayTeamId",
                score_home AS "scoreH", score_away AS "scoreA",
                is_our_match AS "isOurMatch", venue, group_name AS "group",
                round, tournament, home_shield AS "homeShield",
                away_shield AS "awayShield", events_data AS "eventsData",
                lineups_data AS "lineupsData", coach_comment AS "coachComment"
           FROM calendar WHERE tenant_id = $1 AND age_group = $2
           ORDER BY match_date ASC NULLS LAST`,
        [slug, req.params.ageGroup],
      );
      const now = Date.now();
      // Единый матчинг «наша команда» по ext team id (см. ourTeam.ts). Каждому
      // матчу проставляем ourSide ('home'|'away'|null) — фронт читает его вместо
      // 5 разных подстрочных реализаций. isOurMatch пересчитываем по ext id,
      // если он известен (иначе оставляем сохранённое значение синка).
      const ourExtId = await resolveOurExtId(conn, slug, req.params.ageGroup);
      const reshaped = matches.map((m) => {
        const ourSide =
          ourExtId != null
            ? String(m.homeTeamId) === ourExtId ? 'home'
              : String(m.awayTeamId) === ourExtId ? 'away'
              : null
            : null;
        return {
          ...m,
          ourSide,
          isOurMatch: ourExtId != null ? ourSide != null : !!m.isOurMatch,
          score: m.scoreH != null && m.scoreA != null ? { home: m.scoreH, away: m.scoreA } : null,
          isPast: m.scoreH != null && m.scoreA != null,
          isUpcoming: m.scoreH == null && (!m.date || new Date(m.date).getTime() >= now),
        };
      });
      return { ageGroup: req.params.ageGroup, ourExtId, ...meta[0], matches: reshaped };
    });
  });

  app.get('/calendar', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT DISTINCT age_group AS "ageGroup" FROM calendar WHERE tenant_id = $1`,
        [slug],
      );
      return rows;
    });
  });

  // Ручное обновление данных турнира из FFSPB (календарь лиги/кубка + таблица).
  // Замена авто-cron'а (на проде он выключен, START_CRONS=false) — тренер сам
  // тянет свежий тур и таблицу кнопкой в дашборде. Tenant из JWT (обновляем
  // ТОЛЬКО свой клуб, не из URL); age — из query (по умолчанию все возрасты).
  // Синхронно: календарь первым (быстрый /api/matches), таблица после (медленный
  // /api/standings — может не успеть, тогда standingsUpdated=false, но календарь
  // уже залит). Идёт напрямую к Render (фронт минует Vercel-proxy >30с).
  app.post<{ Querystring: { age?: string } }>('/refresh', async (req) => {
    const slug = tenantId(req);
    const role = req.user?.role;
    if (role !== 'head_coach' && role !== 'team_coach') {
      throw new UnauthorizedError('обновлять данные турнира могут только тренеры');
    }
    if (!isFfspbConfigured()) {
      throw new BadRequestError('FFSPB не настроен на сервере', 'FFSPB_NOT_CONFIGURED');
    }
    const trows = await withBypassRLS((tx) =>
      tx.select().from(tenants).where(eq(tenants.slug, slug)).limit(1),
    );
    const tenant = trows[0];
    if (!tenant) throw new NotFoundError('клуб не найден');
    if (tenant.dataProvider !== 'ffspb') {
      throw new BadRequestError('Обновление доступно только для клубов на данных FFSPB', 'WRONG_PROVIDER');
    }
    const cfg = (tenant.providerConfig ?? {}) as {
      ourMatcher?: string;
      season?: string;
      tournaments?: Record<string, { leagueId?: string | number | null; cupId?: string | number | null }>;
    };
    const ourMatcher = cfg.ourMatcher ?? tenant.displayName;
    const season = cfg.season ?? new Date().getFullYear().toString();
    let tournaments = Object.entries(cfg.tournaments ?? {});
    const age = req.query.age;
    if (age) tournaments = tournaments.filter(([a]) => a === age);
    if (tournaments.length === 0) {
      throw new BadRequestError('Для этого возраста не настроены турниры FFSPB', 'NO_TOURNAMENTS');
    }

    let calendarMatches = 0;
    let standingsUpdated = false;
    for (const [ageGroup, tids] of tournaments) {
      if (tids.leagueId) {
        const r = await syncTenantCalendarTournament({
          tenantSlug: slug, ageGroup, season, tournamentId: tids.leagueId, tournament: 'league', ourMatcher,
        });
        if (r.ok) calendarMatches += r.count ?? 0;
      }
      if (tids.cupId) {
        const r = await syncTenantCalendarTournament({
          tenantSlug: slug, ageGroup, season, tournamentId: tids.cupId, tournament: 'cup', ourMatcher,
        });
        if (r.ok) calendarMatches += r.count ?? 0;
      }
      if (tids.leagueId) {
        const r = await syncTenantStandings({
          tenantSlug: slug, ageGroup, tournamentId: tids.leagueId, season, ourMatcher,
        });
        if (r.ok) standingsUpdated = true;
      }
    }
    return { ok: true, ages: tournaments.map(([a]) => a), calendarMatches, standingsUpdated };
  });

  app.get('/metrics', async () => {
    // Русские названия метрик для splits-таблицы PlayerDetail.jsx + radar-осей.
    // radarAxes используется в ComparisonView (легаси) для пер-метрика
    // визуализации игрок vs средний.
    return {
      radarAxes: [
        { key: 'attack',   label: 'Атака'    },
        { key: 'defence',  label: 'Защита'   },
        { key: 'fitness',  label: 'Фитнес'   },
        { key: 'overall',  label: 'Общий'    },
        { key: 'passing',  label: 'Пасы'     },
        { key: 'shooting', label: 'Удары'    },
        { key: 'duels',    label: 'Дуэли'    },
        { key: 'pressing', label: 'Прессинг' },
      ],
      metricLabels: {
        Goal: 'Голы', Shot: 'Удары', 'Shot by head': 'Удары головой',
        'Free kick shot': 'Удары со штрафных', 'Free kick with shot': 'Штрафные с ударом',
        Assist: 'Ассисты', 'Second assist': 'Пред-ассисты', 'Third assist': 'Пре-пред-ассисты',
        'Shot on target assist': 'Передачи в створ', 'Key pass': 'Ключевые передачи',
        'Pass with packing': 'Прогрессивные пасы', 'Pass into pen. area': 'Передачи в штрафную',
        Cross: 'Кроссы', 'Entries in box': 'Входы в штрафную', 'Sprint forward': 'Спринт вперёд',
        'Progressive pass': 'Прогрессивные передачи', 'Pass to final third': 'Передачи в финальную треть',
        Pass: 'Передачи', 'Pass forward': 'Передачи вперёд', 'Pass back': 'Передачи назад',
        'Pass sideways': 'Передачи в сторону', 'Pass short': 'Короткие', 'Pass middle': 'Средние',
        'Pass long': 'Длинные', 'Touches in pen. area': 'Касания в штрафной',
        'Received pass': 'Принятые передачи', Dribble: 'Обводки', 'Dribble packing': 'Прогрессивный дриблинг',
        'Goal actions': 'Голевые действия', Penalty: 'Пенальти', Throwing: 'Ауты',
        'Direct free kick': 'Прямые штрафные', 'Lose on own half': 'Потери на своей',
        'Dangerous loses on own half': 'Опасные потери', 'Lost ball': 'Потери мяча',
        'Technical mistake': 'Технический брак', Autogoal: 'Автогол', Offside: 'Офсайды',
        'Fouls suffered': 'Заработанные фолы',
        Tackle: 'Отборы', 'Sliding tackles': 'Подкаты',
        'Tackle & recovery': 'Отбор+возврат', 'Tackle & recovery on opp. half': 'Отбор на ½ соп.',
        Interception: 'Перехваты', Recovery: 'Возвраты', 'Sprint back': 'Спринт назад',
        Return: 'Возвраты', 'Return on opp. half': 'Возвраты на ½ соп.',
        Clearance: 'Выносы', 'Blocked shot': 'Заблок. удары', Foul: 'Фолы',
        'Yellow card': 'Жёлтые', 'Red card': 'Красные', Duel: 'Единоборства',
        'Ariel duel': 'Воздух', Pressing: 'Прессинг', Contrpressing: 'Контр-прессинг',
        'Dribble against': 'Обводки против', Save: 'Сейвы',
        'Shots against': 'Удары по воротам', 'Goalkeeper exits': 'Выходы вратаря',
        'Goal kick': 'От ворот', 'Short goal kicks': 'Короткие от ворот',
        'Long goal kicks': 'Длинные от ворот',
      },
    };
  });
}
