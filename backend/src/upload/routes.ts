import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { BadRequestError, UnauthorizedError } from '../shared/errors.js';

/**
 * SportVisor PDF upload (W7 demo-light).
 *
 * Demo: принимает PDF, генерирует mock-разбор для выбранной команды
 * (ratings/stats для всех её игроков), сохраняет в matches + match_players.
 *
 * Production-режим (после демо): через Python parser в worker process,
 * см. backend/parsers/ Легируса как референс.
 */
export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  });

  app.addHook('onRequest', authenticate);

  app.post('/upload-pdf', async (req) => {
    const tenantSlug = req.user?.tenantId;
    if (!tenantSlug) throw new UnauthorizedError('tenant context required');

    let teamId: string | null = null;
    let tournament: 'league' | 'cup' = 'league';
    let fileBuffer: Buffer | null = null;
    let filename = 'match.pdf';

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'file') {
          fileBuffer = await part.toBuffer();
          filename = part.filename ?? filename;
        }
      } else {
        if (part.fieldname === 'teamId')     teamId = String(part.value);
        if (part.fieldname === 'tournament') tournament = String(part.value) === 'cup' ? 'cup' : 'league';
      }
    }

    if (!teamId)    throw new BadRequestError('teamId is required', 'NO_TEAM');
    if (!fileBuffer) throw new BadRequestError('file is required',  'NO_FILE');

    // Generate match ID + ext_match_id
    const matchId = `upload-${tenantSlug}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
    const extMatchId = `upload-${matchId}`;

    return withTenant(tenantSlug, async (_tx, conn) => {
      // Get team players
      const { rows: players } = await conn.query<{ id: string; number: number | null; position: string | null }>(
        `SELECT id, number, position FROM players
          WHERE tenant_id = $1 AND team_id = $2
          ORDER BY number NULLS LAST LIMIT 14`,
        [tenantSlug, teamId],
      );
      const { rows: teamRows } = await conn.query<{ name: string; age_group: string }>(
        `SELECT name, age_group FROM teams WHERE tenant_id = $1 AND id = $2`,
        [tenantSlug, teamId],
      );
      const team = teamRows[0];
      if (!team) throw new BadRequestError('team not found', 'TEAM_NOT_FOUND');

      // Mock team-level stats (plausible random values)
      const teamSummary = {
        possession:     { value: 45 + Math.round(Math.random() * 20) },
        shotsTotal:     { value: 8  + Math.round(Math.random() * 14) },
        shotsOnTarget:  { value: 3  + Math.round(Math.random() * 8) },
        xG:             { value: +(0.8 + Math.random() * 2.4).toFixed(2) },
        passes:         { value: 280 + Math.round(Math.random() * 230) },
        passAccuracy:   { pct: 72 + Math.round(Math.random() * 18) },
        duelsWon:       { pct: 42 + Math.round(Math.random() * 20) },
        tackles:        { value: 10 + Math.round(Math.random() * 14) },
        interceptions:  { value: 6  + Math.round(Math.random() * 10) },
        fouls:          { value: 4  + Math.round(Math.random() * 12) },
        totalDistance:  { value: 95000 + Math.round(Math.random() * 25000) },
      };
      const avgRating = +(6.8 + Math.random() * 1.4).toFixed(2);
      const teamAvgRatings = {
        overall:    avgRating,
        attacking:  +(avgRating + (Math.random() * 0.5 - 0.25)).toFixed(2),
        defending:  +(avgRating + (Math.random() * 0.5 - 0.25)).toFixed(2),
        passing:    +(avgRating + (Math.random() * 0.5 - 0.25)).toFixed(2),
        creativity: +(avgRating + (Math.random() * 0.5 - 0.25)).toFixed(2),
        fitness:    +(avgRating + (Math.random() * 0.5 - 0.25)).toFixed(2),
      };

      const scoreUs   = Math.round(Math.random() * 5);
      const scoreOpp  = Math.round(Math.random() * 4);

      await conn.query(
        `INSERT INTO matches (
           id, tenant_id, team_id, ext_match_id,
           home_team_name, away_team_name, match_date, season, tournament,
           score_home, score_away, pdf_source,
           team_summary_stats, team_avg_ratings, meta
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb)`,
        [
          matchId, tenantSlug, teamId, extMatchId,
          team.name.replace(/ U-?\d+$/, '').trim(),
          'Соперник (по PDF)',
          '2025-2026', tournament,
          scoreUs, scoreOpp,
          `upload://${filename}`,
          JSON.stringify(teamSummary),
          JSON.stringify(teamAvgRatings),
          JSON.stringify({ uploadedFilename: filename, mock: true }),
        ],
      );

      // Per-player stats
      for (const p of players) {
        const base = 6.5 + Math.random() * 1.8;
        const r = (b: number, jitter = 0.4) => +(b + Math.random() * jitter - jitter / 2).toFixed(2);
        const ratings = {
          overall:    +base.toFixed(2),
          attacking:  r(base),
          defending:  r(base),
          passing:    r(base),
          creativity: r(base),
          fitness:    r(base + 0.3),
        };
        const goals  = p.position === 'ST' || p.position === 'LW' || p.position === 'RW' || p.position === 'CAM'
          ? Math.random() < 0.3 ? 1 : 0
          : 0;
        const stats = {
          attack1: { xG: +(goals * 0.7 + Math.random() * 0.4).toFixed(2),
                     xA: +(Math.random() * 0.5).toFixed(2),
                     assist: Math.random() < 0.2 ? 1 : 0 },
          attack4: { goal: goals },
          fitness: { totalDistance: 9000 + Math.round(Math.random() * 3500),
                     sprints: 12 + Math.round(Math.random() * 14) },
          passing: { passes: 20 + Math.round(Math.random() * 35),
                     accuracy: +(78 + Math.random() * 16).toFixed(1) },
          defence1: { tackle: Math.round(Math.random() * 5),
                      interception: Math.round(Math.random() * 5) },
        };
        const splits = {
          rating: { first: r(base, 0.6), second: r(base, 0.6), match: +base.toFixed(2) },
        };
        await conn.query(
          `INSERT INTO match_players (
             match_id, player_id, tenant_id, number, position, minutes,
             ratings, stats, splits
           ) VALUES ($1, $2, $3, $4, $5, 90, $6::jsonb, $7::jsonb, $8::jsonb)`,
          [matchId, p.id, tenantSlug, p.number ?? null, p.position ?? null,
           JSON.stringify(ratings), JSON.stringify(stats), JSON.stringify(splits)],
        );
      }

      return {
        ok: true,
        matchId,
        filename,
        score: { home: scoreUs, away: scoreOpp },
        playersProcessed: players.length,
        note: 'Mock-разбор (demo): ratings/stats сгенерированы. Реальный SportVisor parser — после демо.',
      };
    });
  });
}
