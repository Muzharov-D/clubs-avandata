import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { UnauthorizedError, NotFoundError } from '../shared/errors.js';
import { adaptPlayerForLegirus } from './legirusAdapter.js';

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
                  score_home AS "scoreHome", score_away AS "scoreAway", meta
             FROM matches WHERE tenant_id = $1 AND team_id = $2
             ORDER BY match_date DESC NULLS LAST`
        : `SELECT id, team_id AS "teamId", ext_match_id AS "extMatchId",
                  home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
                  home_team_name AS "home", away_team_name AS "away",
                  match_date AS "date", season, tournament,
                  score_home AS "scoreHome", score_away AS "scoreAway", meta
             FROM matches WHERE tenant_id = $1
             ORDER BY match_date DESC NULLS LAST`;
      const params: unknown[] = teamId ? [slug, teamId] : [slug];
      const { rows } = await conn.query(sql, params);
      // Legacy ClubOverview expects { matches: [...] }
      return { matches: rows };
    });
  });

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
                team_avg_ratings AS "teamAvgRatings", meta
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
        players:  mp.map(adaptPlayerForLegirus),
      };
    });
  });

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
