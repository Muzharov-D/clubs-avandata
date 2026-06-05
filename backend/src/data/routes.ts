import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../shared/errors.js';
import { adaptPlayerForLegirus } from './legirusAdapter.js';
import { computeDataQuality } from './dataQuality.js';
import { statField, statFieldTotal } from '../shared/statValue.js';
import { applyFixtureDates, type DatedMatchRow } from './matchDate.js';
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
      return {
        ...match,
        homeTeam: { id: match.homeTeamId, name: match.home, isOurTeam: match.homeTeamId === match.teamId },
        awayTeam: { id: match.awayTeamId, name: match.away, isOurTeam: match.awayTeamId === match.teamId },
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
      if (role !== 'head_coach' && role !== 'team_coach') {
        throw new UnauthorizedError('only coaches can edit notes');
      }
      const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 5000) : null;
      return withTenant(slug, async (_tx, conn) => {
        const { rowCount } = await conn.query(
          `UPDATE matches SET coach_note = $1 WHERE tenant_id = $2 AND id = $3`,
          [note, slug, req.params.matchId],
        );
        if (!rowCount) throw new NotFoundError('match not found');
        return { ok: true, coachNote: note };
      });
    },
  );

  app.delete<{ Params: { matchId: string } }>('/match/:matchId', async (req) => {
    const slug = tenantId(req);
    const role = req.user?.role;
    if (role !== 'head_coach' && role !== 'team_coach') {
      throw new UnauthorizedError('only coaches can delete matches');
    }
    return withTenant(slug, async (_tx, conn) => {
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
  // Результат матча с НАШЕЙ стороны (ориентация по team_id, не по имени).
  function ourResult(m: AnyRow): { result: 'W' | 'D' | 'L' | null; us: number | null; them: number | null; opponent: string } {
    const sh = m.score_home as number | null;
    const sa = m.score_away as number | null;
    const ourHome = m.home_team_id === m.team_id;
    const ourAway = m.away_team_id === m.team_id;
    const opponent = String((ourHome ? m.away_team_name : ourAway ? m.home_team_name : m.away_team_name) ?? 'Соперник');
    if (sh == null || sa == null || (!ourHome && !ourAway)) return { result: null, us: null, them: null, opponent };
    const us = ourHome ? sh : sa;
    const them = ourHome ? sa : sh;
    return { result: us > them ? 'W' : us < them ? 'L' : 'D', us, them, opponent };
  }

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
           JOIN matches m ON m.id = mp.match_id
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
  // Код позиции SportVisor → читаемое слово-группа. Латинские (CB/CM/ST) и
  // кириллические (ЦЗ/ПЦП/ЛН/ВР) — у кириллических значима последняя буква
  // (Р→вратарь, З→защита, П→полузащита, Н→нападение). null — если не распознали.
  function posFullFromCode(raw: string): string | null {
    const c = String(raw || '').toUpperCase().replace(/[^A-ZА-ЯЁ]/g, '');
    if (!c) return null;
    if (c === 'GK' || c === 'ВР' || c.startsWith('ВРТ')) return 'Вратарь';
    if (/^(ST|CF|SS|LW|RW)$/.test(c)) return 'Нападающий';
    if (/^(CB|LB|RB|LWB|RWB|SW)$/.test(c)) return 'Защитник';
    if (/^(CM|CDM|CAM|DM|AM|LM|RM)$/.test(c)) return 'Полузащитник';
    const cyr = c.replace(/[^А-ЯЁ]/g, '');
    // FFSPB 3-буквенные коды (значима ПЕРВАЯ буква): НАП/ЗАЩ/ПОЛ/ВРТ. Ставим ДО
    // эвристики «по последней букве» — иначе НАП (last П) → полузащита, ЗАЩ
    // (last Щ) → null. Должно совпадать с posGroup на /club (ClubDashboard).
    if (cyr.startsWith('НАП')) return 'Нападающий';
    if (cyr.startsWith('ЗАЩ')) return 'Защитник';
    if (cyr.startsWith('ПОЛ')) return 'Полузащитник';
    if (cyr) {
      const last = cyr[cyr.length - 1];
      if (last === 'Р') return 'Вратарь';
      if (last === 'З') return 'Защитник';
      if (last === 'П') return 'Полузащитник';
      if (last === 'Н') return 'Нападающий';
    }
    return null;
  }

  app.get<{ Querystring: { teamId?: string } }>('/players/season', async (req) => {
    const slug = tenantId(req);
    const teamId = req.query.teamId;
    if (!teamId) throw new BadRequestError('teamId is required', 'NO_TEAM');
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query<AnyRow>(
        `SELECT mp.player_id, p.full_name AS "fullName", p.number, mp.position, p.photo_url AS "photoUrl",
                mp.minutes, mp.ratings, mp.stats, mp.radar, m.match_date
           FROM match_players mp
           JOIN matches m ON m.id = mp.match_id
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
          };
          byId.set(id, a);
        }
        a.matches += 1;
        // Позиция = роль из ПОСЛЕДНЕГО матча (источник истины — отчёт SportVisor,
        // НЕ FFSPB). rows идут ASC по дате → последняя непустая перезаписывает.
        // Короткий код (ПЦП/ЛН/ЦЗ/ВР…) разворачиваем в читаемое слово-группу, чтобы
        // подпись была понятной, а оба классификатора (posGroup/positionGroup) совпадали.
        if (r.position != null && String(r.position).trim()) {
          const full = posFullFromCode(String(r.position)) ?? String(r.position);
          a.position = full;
          a.positionFull = full;
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
      const players = [...byId.values()].map((a) => ({
        id: a.id, fullName: a.fullName, number: a.number, position: a.position, positionFull: a.positionFull, photoUrl: a.photoUrl,
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
      }));
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
      return { ...r, title: `${r.leagueName} · ${r.ageGroup} г.р.` };
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
        standings[r.ageGroup] = { ...r, title: `${r.leagueName} · ${r.ageGroup} г.р.` };
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
      const reshaped = matches.map((m) => ({
        ...m,
        score: m.scoreH != null && m.scoreA != null ? { home: m.scoreH, away: m.scoreA } : null,
        isPast: m.scoreH != null && m.scoreA != null,
        isUpcoming: m.scoreH == null && (!m.date || new Date(m.date).getTime() >= now),
      }));
      return { ageGroup: req.params.ageGroup, ...meta[0], matches: reshaped };
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
