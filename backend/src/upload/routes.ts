import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { spawn } from 'node:child_process';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { BadRequestError, UnauthorizedError, AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

/**
 * SportVisor PDF upload — реальный Python parser.
 *
 * Pipeline:
 *  1. Save PDF to temp
 *  2. Materialize players.json (filtered to selected team) — parser нужен roster
 *  3. Spawn `python3 backend/parsers/build_match.py <pdf> <out.json> <teamId> <matchId>`
 *  4. Read JSON, INSERT into matches + match_players
 *  5. Cleanup temp dir
 *
 * Парсер копия из Легируса: parse_page1 / parse_team_tables /
 * parse_team_aggregates / parse_player_splits + aggregates/* + lib/.
 */

const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';
// In Docker image, backend WORKDIR=/app; parsers/ копируются на одном уровне с src/.
// Локально (npm run dev) cwd = backend/.
const PARSERS_DIR = join(process.cwd(), 'parsers');

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.addHook('onRequest', authenticate);

  app.post('/upload-pdf', async (req) => {
    const tenantSlug = req.user?.tenantId;
    if (!tenantSlug) throw new UnauthorizedError('tenant context required');

    let teamId: string | null = null;
    let tournament: 'league' | 'cup' = 'league';
    let fileBuffer: Buffer | null = null;
    let filename = 'match.pdf';

    for await (const part of req.parts()) {
      if (part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer();
        filename = part.filename ?? filename;
      } else if (part.type === 'field') {
        if (part.fieldname === 'teamId')     teamId = String(part.value);
        if (part.fieldname === 'tournament') tournament = String(part.value) === 'cup' ? 'cup' : 'league';
      }
    }

    if (!teamId)     throw new BadRequestError('teamId is required', 'NO_TEAM');
    if (!fileBuffer) throw new BadRequestError('PDF file is required', 'NO_FILE');

    const matchId = `sv-${tenantSlug}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

    // ─── tmp workspace ──────────────────────────────────────────────
    const work = join(tmpdir(), `sv-upload-${matchId}`);
    const pdfPath = join(work, 'input.pdf');
    const outPath = join(work, 'output.json');
    const dataDir = join(work, 'data');
    const playersPath = join(dataDir, 'players.json');
    await mkdir(dataDir, { recursive: true });
    await writeFile(pdfPath, fileBuffer);

    try {
      // ─── Materialize players.json (parser ожидает в DATA_DIR=../data) ─────
      const players = await withTenant(tenantSlug, async (_tx, conn) => {
        const { rows } = await conn.query<{
          id: string; teamId: string; number: number | null;
          fullName: string; firstName: string | null; lastName: string | null;
          position: string | null; positionFull: string | null;
        }>(
          `SELECT id, team_id AS "teamId", number,
                  full_name AS "fullName", first_name AS "firstName",
                  last_name AS "lastName", position, position_full AS "positionFull"
             FROM players WHERE tenant_id = $1 AND team_id = $2`,
          [tenantSlug, teamId!],
        );
        return rows;
      });

      if (players.length === 0) {
        throw new BadRequestError(
          'Команда не имеет игроков. Сначала создай состав, потом загружай PDF.',
          'EMPTY_ROSTER',
        );
      }

      await writeFile(playersPath, JSON.stringify({ players }, null, 2), 'utf-8');

      // ─── Spawn Python parser ────────────────────────────────────────
      const args = [
        join(PARSERS_DIR, 'build_match.py'),
        pdfPath,
        outPath,
        teamId!,
        matchId,
      ];
      logger.info({ python: PYTHON_BIN, args, work }, '[upload] spawning parser');

      const pyOutput = await runPython(PYTHON_BIN, args, work);
      logger.info({ matchId, pyOutput }, '[upload] parser done');

      // ─── Read output ────────────────────────────────────────────────
      const raw = await readFile(outPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        id: string;
        date?: string;
        homeTeam?: { name?: string; isOurTeam?: boolean };
        awayTeam?: { name?: string };
        score?: { home: number; away: number };
        teamSummaryStats?: unknown;
        teamAggregates?: unknown;
        teamAvgRatings?: unknown;
        formation?: unknown;
        players?: Array<{
          id: string;
          number?: number;
          position?: string;
          positionFull?: string;
          minutes?: number;
          ratings?: unknown;
          radar?: unknown;
          stats?: unknown;
          splits?: unknown;
        }>;
      };

      // ─── Persist to PG ──────────────────────────────────────────────
      await withTenant(tenantSlug, async (_tx, conn) => {
        await conn.query(
          `INSERT INTO matches (
             id, tenant_id, team_id, ext_match_id,
             home_team_name, away_team_name, match_date, season, tournament,
             score_home, score_away, pdf_source,
             team_summary_stats, team_aggregates, team_avg_ratings, meta
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb)`,
          [
            matchId, tenantSlug, teamId, `sv-${matchId}`,
            parsed.homeTeam?.name ?? '', parsed.awayTeam?.name ?? '',
            parsed.date || null, '2025-2026', tournament,
            parsed.score?.home ?? null, parsed.score?.away ?? null,
            `upload://${filename}`,
            JSON.stringify(parsed.teamSummaryStats ?? {}),
            JSON.stringify(parsed.teamAggregates ?? {}),
            JSON.stringify(parsed.teamAvgRatings ?? {}),
            JSON.stringify({ uploadedFilename: filename, formation: parsed.formation ?? null }),
          ],
        );

        // Upsert placeholder players для PDF-only ID (pdf-{teamId}-nXX).
        // FK match_players → players требует чтоб запись существовала.
        for (const p of parsed.players ?? []) {
          if (p.id.startsWith('pdf-')) {
            await conn.query(
              `INSERT INTO players (id, tenant_id, team_id, full_name, number, position)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO NOTHING`,
              [p.id, tenantSlug, teamId, `№${p.number ?? '?'} (по PDF)`, p.number ?? null, p.position ?? null],
            );
          }
        }
        for (const p of parsed.players ?? []) {
          await conn.query(
            `INSERT INTO match_players (
               match_id, player_id, tenant_id, number, position, position_full, minutes,
               ratings, stats, splits, radar
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb)
             ON CONFLICT (match_id, player_id) DO UPDATE SET
               number = EXCLUDED.number, position = EXCLUDED.position,
               minutes = EXCLUDED.minutes,
               ratings = EXCLUDED.ratings, stats = EXCLUDED.stats,
               splits = EXCLUDED.splits, radar = EXCLUDED.radar`,
            [
              matchId, p.id, tenantSlug,
              p.number ?? null, p.position ?? null, p.positionFull ?? null,
              p.minutes ?? null,
              JSON.stringify(p.ratings ?? {}),
              JSON.stringify(p.stats ?? {}),
              JSON.stringify(p.splits ?? {}),
              JSON.stringify(p.radar ?? {}),
            ],
          );
        }
      });

      return {
        ok: true,
        matchId,
        filename,
        score: parsed.score ?? null,
        playersProcessed: parsed.players?.length ?? 0,
        parserStdout: pyOutput.slice(-500),
      };
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), matchId }, '[upload] failed');
      if (err instanceof AppError) throw err;
      throw new AppError(500, err instanceof Error ? err.message : 'Parser failed', 'PARSER_ERROR');
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => { /* ignore */ });
    }
  });
}

function runPython(bin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { cwd });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Python parser exited ${code}: ${stderr.slice(-800) || stdout.slice(-800)}`));
    });
  });
}
