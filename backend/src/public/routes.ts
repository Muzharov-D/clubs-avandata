import type { FastifyInstance } from 'fastify';
import { withTenant, withBypassRLS } from '../db/tenantContext.js';
import { eq } from 'drizzle-orm';
import { tenants } from '../db/schema/tenants.js';
import { NotFoundError } from '../shared/errors.js';

/**
 * Public родительский экран — без auth, tenant из URL path.
 *
 * Маршруты:
 *   GET /api/v1/public/club-rank       — клубный зачёт (заглушка пока)
 *   GET /api/v1/public/:slug/team/:age — главная команды для родителя
 *   GET /api/v1/public/:slug/standings/:age
 *   GET /api/v1/public/:slug/calendar/:age
 *   GET /api/v1/public/:slug/top-scorers/:age
 *   GET /api/v1/public/tenant/:slug    — brand/name инфо клуба
 */
export async function publicRoutes(app: FastifyInstance) {
  // Stub для club-rank — legacy ClubPage его дёргает, чтобы не падал.
  app.get('/club-rank', async () => {
    return { ranks: [], updatedAt: null };
  });

  // Public tenant info (brand + name)
  app.get<{ Params: { slug: string } }>('/tenant/:slug', async (req) => {
    const rows = await withBypassRLS((tx) =>
      tx.select({
        slug: tenants.slug,
        name: tenants.name,
        displayName: tenants.displayName,
        brand: tenants.brand,
        status: tenants.status,
      }).from(tenants).where(eq(tenants.slug, req.params.slug)).limit(1),
    );
    const t = rows[0];
    if (!t || t.status !== 'active') throw new NotFoundError('tenant not found');
    return t;
  });

  app.get<{ Params: { slug: string; age: string } }>('/:slug/standings/:age', async (req) => {
    const { slug, age } = req.params;
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT age_group AS "ageGroup", season, league_name AS "leagueName",
                source_url AS "source", table_data AS "table", fetched_at AS "lastUpdated"
           FROM standings WHERE tenant_id = $1 AND age_group = $2
           ORDER BY fetched_at DESC LIMIT 1`,
        [slug, age],
      );
      if (rows.length === 0) throw new NotFoundError('standings not found');
      const r = rows[0];
      return { ...r, title: `${r.leagueName} · ${r.ageGroup} г.р.` };
    });
  });

  app.get<{ Params: { slug: string; age: string } }>('/:slug/calendar/:age', async (req) => {
    const { slug, age } = req.params;
    return withTenant(slug, async (_tx, conn) => {
      const { rows: matches } = await conn.query(
        `SELECT ext_match_id AS "matchId", match_date AS "date",
                home_team AS "home", away_team AS "away",
                score_home AS "scoreH", score_away AS "scoreA",
                is_our_match AS "isOurMatch", venue, round, tournament,
                home_shield AS "homeShield", away_shield AS "awayShield"
           FROM calendar WHERE tenant_id = $1 AND age_group = $2
           ORDER BY match_date ASC NULLS LAST`,
        [slug, age],
      );
      const now = Date.now();
      const reshaped = matches.map((m) => ({
        ...m,
        score: m.scoreH != null && m.scoreA != null ? { home: m.scoreH, away: m.scoreA } : null,
        isPast: m.scoreH != null && m.scoreA != null,
        isUpcoming: m.scoreH == null && (!m.date || new Date(m.date).getTime() >= now),
      }));
      return { ageGroup: age, matches: reshaped };
    });
  });

  app.get<{ Params: { slug: string; age: string } }>('/:slug/team/:age', async (req) => {
    const { slug, age } = req.params;
    return withTenant(slug, async (_tx, conn) => {
      const [{ rows: teamRows }, { rows: playersRows }, { rows: nextRows }, { rows: standingsRows }] = await Promise.all([
        conn.query(
          `SELECT id, name, age_group AS "ageGroup", age_label AS "ageLabel", head_coach AS "headCoach"
             FROM teams WHERE tenant_id = $1 AND age_group = $2 LIMIT 1`,
          [slug, age],
        ),
        conn.query(
          `SELECT p.id, p.full_name AS "fullName", p.number, p.position, p.photo_url AS "photoUrl"
             FROM players p JOIN teams t ON t.id = p.team_id
             WHERE p.tenant_id = $1 AND t.age_group = $2
             ORDER BY p.number NULLS LAST, p.last_name`,
          [slug, age],
        ),
        conn.query(
          `SELECT ext_match_id AS "matchId", match_date AS "date",
                  home_team AS "home", away_team AS "away",
                  score_home AS "scoreH", score_away AS "scoreA",
                  is_our_match AS "isOurMatch", venue, round
             FROM calendar
            WHERE tenant_id = $1 AND age_group = $2 AND is_our_match = TRUE
              AND (score_home IS NULL OR match_date > NOW())
            ORDER BY match_date ASC LIMIT 1`,
          [slug, age],
        ),
        conn.query(
          `SELECT age_group AS "ageGroup", league_name AS "leagueName", table_data AS "table"
             FROM standings WHERE tenant_id = $1 AND age_group = $2
             ORDER BY fetched_at DESC LIMIT 1`,
          [slug, age],
        ),
      ]);
      return {
        team: teamRows[0] ?? null,
        players: playersRows,
        nextMatch: nextRows[0] ?? null,
        standings: standingsRows[0] ?? null,
      };
    });
  });
}
