import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { spawn } from 'node:child_process';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { BadRequestError, UnauthorizedError, AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

/**
 * SportVisor upload — PDF (rating + radar + formation) + опциональный Excel
 * (детальные per-player stats: пасы 8 категорий, удары, дриблинг, дистанции).
 *
 * Pipeline:
 *  1. Save PDF (+ Excel) в temp
 *  2. Dump roster (players.json) для команды → нужен parser'у PDF
 *  3. Spawn parse_excel.py → JSON с 17 игроками (real names + numbers + 10 stat groups)
 *  4. Spawn build_match.py → JSON с ratings/radar/formation/teamSummary
 *  5. UPSERT players (по номеру) — реальные имена из Excel заменят
 *     сгенерированные seed'ом, новые номера добавятся
 *  6. INSERT matches + match_players (Excel stats + PDF ratings)
 *  7. Cleanup
 */

const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';
const PARSERS_DIR = join(process.cwd(), 'parsers');

interface ExcelOutput {
  match: {
    homeTeam: string | null;
    awayTeam: string | null;
    date: string | null;
    score: { home: number; away: number } | null;
    sourceSheet: string;
    columnsCount: number;
  };
  players: Array<{
    number: string;
    name: string;
    minutes: number | null;
    stats: Record<string, Record<string, unknown>>;
    raw: Record<string, unknown>;
  }>;
}

interface PdfOutput {
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
}

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
    let pdfBuffer: Buffer | null = null;
    let xlsxBuffer: Buffer | null = null;
    let pdfFilename = 'match.pdf';
    let xlsxFilename: string | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'file' || part.fieldname === 'pdf') {
          pdfBuffer = await part.toBuffer();
          pdfFilename = part.filename ?? pdfFilename;
        } else if (part.fieldname === 'excel' || part.fieldname === 'xlsx') {
          xlsxBuffer = await part.toBuffer();
          xlsxFilename = part.filename ?? null;
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'teamId')     teamId = String(part.value);
        if (part.fieldname === 'tournament') tournament = String(part.value) === 'cup' ? 'cup' : 'league';
      }
    }

    if (!teamId)    throw new BadRequestError('teamId is required', 'NO_TEAM');
    if (!pdfBuffer) throw new BadRequestError('PDF file is required', 'NO_FILE');

    const matchId = `sv-${tenantSlug}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

    const work = join(tmpdir(), `sv-upload-${matchId}`);
    const pdfPath  = join(work, 'input.pdf');
    const xlsxPath = join(work, 'input.xlsx');
    const pdfOutPath  = join(work, 'pdf.json');
    const xlsxOutPath = join(work, 'excel.json');
    const dataDir = join(work, 'data');
    const playersPath = join(dataDir, 'players.json');
    await mkdir(dataDir, { recursive: true });
    await writeFile(pdfPath, pdfBuffer);
    if (xlsxBuffer) await writeFile(xlsxPath, xlsxBuffer);

    try {
      // ─── 1. Excel parser (если есть) — даёт настоящие имена + детальные stats ───
      let excelData: ExcelOutput | null = null;
      if (xlsxBuffer) {
        await runPython(PYTHON_BIN,
          [join(PARSERS_DIR, 'parse_excel.py'), xlsxPath, xlsxOutPath], work);
        excelData = JSON.parse(await readFile(xlsxOutPath, 'utf-8')) as ExcelOutput;
        logger.info({ matchId, players: excelData.players.length, cols: excelData.match.columnsCount }, '[upload] excel parsed');
      }

      // ─── 2. Upsert players из Excel (если был) ─ обновим существующие, добавим новые ───
      await withTenant(tenantSlug, async (_tx, conn) => {
        if (excelData?.players?.length) {
          for (const ep of excelData.players) {
            const num = parseInt(ep.number, 10);
            if (!num || !ep.name) continue;
            const lastName = ep.name.split(' ').pop() || '';
            const firstName = ep.name.split(' ').slice(0, -1).join(' ') || '';
            const pid = `sv-${teamId}-n${String(num).padStart(2, '0')}`;
            // Insert or update by id; also handle duplicate-number conflict.
            await conn.query(
              `INSERT INTO players (id, tenant_id, team_id, full_name, first_name, last_name, number)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id) DO UPDATE SET
                 full_name  = EXCLUDED.full_name,
                 first_name = EXCLUDED.first_name,
                 last_name  = EXCLUDED.last_name,
                 number     = EXCLUDED.number`,
              [pid, tenantSlug, teamId, ep.name, firstName, lastName, num],
            );
          }
          logger.info({ matchId, upserted: excelData.players.length }, '[upload] players upserted from excel');
        }
      });

      // ─── 3. Dump roster (включая только что upsert-нутых) для PDF parser ───
      const roster = await withTenant(tenantSlug, async (_tx, conn) => {
        const { rows } = await conn.query<{
          id: string; teamId: string; number: number | null;
          fullName: string; firstName: string | null; lastName: string | null;
          position: string | null;
        }>(
          `SELECT id, team_id AS "teamId", number,
                  full_name AS "fullName", first_name AS "firstName",
                  last_name AS "lastName", position
             FROM players WHERE tenant_id = $1 AND team_id = $2`,
          [tenantSlug, teamId!],
        );
        return rows;
      });
      if (!roster.length) throw new BadRequestError('Roster is empty', 'EMPTY_ROSTER');
      await writeFile(playersPath, JSON.stringify({ players: roster }, null, 2), 'utf-8');

      // ─── 4. PDF parser ────────────────────────────────────────
      const pdfArgs = [join(PARSERS_DIR, 'build_match.py'), pdfPath, pdfOutPath, teamId!, matchId];
      const pyStdout = await runPython(PYTHON_BIN, pdfArgs, work);
      logger.info({ matchId, py: pyStdout.slice(-200) }, '[upload] pdf parsed');
      const pdfData = existsSync(pdfOutPath)
        ? JSON.parse(await readFile(pdfOutPath, 'utf-8')) as PdfOutput
        : ({} as PdfOutput);

      // ─── 5. Merge + insert ───────────────────────────────────────
      const matchDate = pdfData.date || excelData?.match.date || null;
      const homeName  = pdfData.homeTeam?.name || excelData?.match.homeTeam || '';
      const awayName  = pdfData.awayTeam?.name || excelData?.match.awayTeam || '';
      const score     = pdfData.score || excelData?.match.score || null;

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
            homeName, awayName, matchDate, '2025-2026', tournament,
            score?.home ?? null, score?.away ?? null,
            `upload://${pdfFilename}`,
            JSON.stringify(pdfData.teamSummaryStats ?? {}),
            JSON.stringify(pdfData.teamAggregates ?? {}),
            JSON.stringify(pdfData.teamAvgRatings ?? {}),
            JSON.stringify({
              pdfFile: pdfFilename,
              xlsxFile: xlsxFilename,
              formation: pdfData.formation ?? null,
              excelMeta: excelData?.match ?? null,
              excelColumnsCount: excelData?.match.columnsCount ?? null,
            }),
          ],
        );

        // ── Index PDF players by number for fast lookup
        const pdfByNum = new Map<string, NonNullable<PdfOutput['players']>[number]>();
        for (const pp of pdfData.players ?? []) {
          if (pp.number != null) pdfByNum.set(String(pp.number).padStart(2, '0'), pp);
        }

        // ── Determine the union of player numbers from both sources
        type CombinedEntry = {
          number: string;
          playerId: string;
          minutes: number | null;
          position: string | null;
          ratings: unknown;
          radar:   unknown;
          stats:   unknown;
          splits:  unknown;
        };
        const combined = new Map<string, CombinedEntry>();
        const rosterByNum = new Map<string, typeof roster[number]>();
        for (const r of roster) {
          if (r.number != null) rosterByNum.set(String(r.number).padStart(2, '0'), r);
        }

        // From Excel
        for (const ep of excelData?.players ?? []) {
          if (!ep.number || !ep.name) continue;
          const num = parseInt(ep.number, 10);
          if (!num) continue;
          const numStr = String(num).padStart(2, '0');
          const rosterRow = rosterByNum.get(numStr);
          if (!rosterRow) continue;
          combined.set(numStr, {
            number: numStr,
            playerId: rosterRow.id,
            minutes: ep.minutes,
            position: rosterRow.position,
            ratings: {},
            radar: {},
            stats: ep.stats,
            splits: {},
          });
        }
        // From PDF (merge ratings/radar/splits)
        for (const pp of pdfData.players ?? []) {
          if (pp.number == null) continue;
          const numStr = String(pp.number).padStart(2, '0');
          const existing = combined.get(numStr);
          const rosterRow = rosterByNum.get(numStr);
          if (existing) {
            existing.ratings = pp.ratings ?? {};
            existing.radar   = pp.radar   ?? {};
            existing.splits  = pp.splits  ?? {};
            existing.position = pp.position ?? existing.position ?? null;
          } else if (rosterRow) {
            combined.set(numStr, {
              number: numStr,
              playerId: rosterRow.id,
              minutes: pp.minutes ?? null,
              position: pp.position ?? rosterRow.position,
              ratings: pp.ratings ?? {},
              radar: pp.radar ?? {},
              stats: pp.stats ?? {},
              splits: pp.splits ?? {},
            });
          } else {
            // No roster row, no Excel — create placeholder
            const pid = `pdf-${teamId}-n${numStr}`;
            await conn.query(
              `INSERT INTO players (id, tenant_id, team_id, full_name, number, position)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO NOTHING`,
              [pid, tenantSlug, teamId, `№${numStr}`, pp.number, pp.position ?? null],
            );
            combined.set(numStr, {
              number: numStr,
              playerId: pid,
              minutes: pp.minutes ?? null,
              position: pp.position ?? null,
              ratings: pp.ratings ?? {},
              radar: pp.radar ?? {},
              stats: pp.stats ?? {},
              splits: pp.splits ?? {},
            });
          }
        }

        // Insert match_players
        for (const e of combined.values()) {
          await conn.query(
            `INSERT INTO match_players (
               match_id, player_id, tenant_id, number, position, minutes,
               ratings, stats, splits, radar
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb)
             ON CONFLICT (match_id, player_id) DO UPDATE SET
               number = EXCLUDED.number, position = EXCLUDED.position, minutes = EXCLUDED.minutes,
               ratings = EXCLUDED.ratings, stats = EXCLUDED.stats,
               splits = EXCLUDED.splits, radar = EXCLUDED.radar`,
            [
              matchId, e.playerId, tenantSlug,
              parseInt(e.number, 10), e.position, e.minutes,
              JSON.stringify(e.ratings),
              JSON.stringify(e.stats),
              JSON.stringify(e.splits),
              JSON.stringify(e.radar),
            ],
          );
        }
      });

      return {
        ok: true,
        matchId,
        pdfFile: pdfFilename,
        xlsxFile: xlsxFilename,
        score,
        playersProcessed:
          new Set([
            ...(pdfData.players ?? []).map((p) => String(p.number).padStart(2, '0')),
            ...(excelData?.players ?? []).map((p) => p.number),
          ]).size,
        excelColumns: excelData?.match.columnsCount ?? 0,
      };
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.stack : String(err), matchId }, '[upload] failed');
      if (err instanceof AppError) throw err;
      throw new AppError(500, err instanceof Error ? err.message : 'Parser failed', 'PARSER_ERROR');
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => { /* ignore */ });
    }
  });
}

function runPython(bin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { cwd, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Python parser exited ${code}: ${stderr.slice(-800) || stdout.slice(-800)}`));
    });
  });
}
