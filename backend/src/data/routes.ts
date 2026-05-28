import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { UnauthorizedError, NotFoundError } from '../shared/errors.js';

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
      return rows[0];
    });
  });

  app.get<{ Querystring: { teamId?: string } }>('/matches', async (req) => {
    const slug = tenantId(req);
    const teamId = req.query.teamId;
    return withTenant(slug, async (_tx, conn) => {
      const sql = teamId
        ? `SELECT id, team_id AS "teamId", ext_match_id AS "extMatchId",
                  home_team_name AS "home", away_team_name AS "away",
                  match_date AS "date", season, tournament,
                  score_home AS "scoreHome", score_away AS "scoreAway", meta
             FROM matches WHERE tenant_id = $1 AND team_id = $2
             ORDER BY match_date DESC NULLS LAST`
        : `SELECT id, team_id AS "teamId", ext_match_id AS "extMatchId",
                  home_team_name AS "home", away_team_name AS "away",
                  match_date AS "date", season, tournament,
                  score_home AS "scoreHome", score_away AS "scoreAway", meta
             FROM matches WHERE tenant_id = $1
             ORDER BY match_date DESC NULLS LAST`;
      const params: unknown[] = teamId ? [slug, teamId] : [slug];
      const { rows } = await conn.query(sql, params);
      return rows;
    });
  });

  app.get<{ Params: { matchId: string } }>('/match/:matchId', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT id, team_id AS "teamId", ext_match_id AS "extMatchId",
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
        `SELECT mp.player_id AS "playerId",
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
      return { ...match, players: mp };
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
    return {};
  });
}
