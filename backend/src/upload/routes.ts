import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { spawn } from 'node:child_process';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../auth/middleware.js';
import { withTenantTx, withTenant } from '../db/tenantContext.js';
import { BadRequestError, UnauthorizedError, AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';
import { enrichTenantPhotos } from '../services/playerPhotoService.js';
import { resolveOurSide } from '../shared/teamName.js';
import { validateRich, assertSportVisor } from './validation.js';
import { dedupePhantomsByNumber } from './dedupePhantoms.js';
import { computeDataQuality } from '../data/dataQuality.js';
import {
  buildRosterIndex,
  indexAdd,
  resolvePlayerId,
  type RosterEntry,
  type RosterIndex,
} from './playerResolve.js';

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

/**
 * Не сохраняем в full_name служебный мусор (метку возраста «U16», голый номер,
 * пусто) — когда имя не распозналось (например, пустой Excel). Кладём «№NN»,
 * чтобы UI показывал аккуратный номер, а не «U16».
 */
function isPlaceholderName(s: string | null | undefined): boolean {
  const t = String(s ?? '').trim();
  return !t || /^u[-\s]?\d{1,3}$/i.test(t) || /^№?\s*\d+$/.test(t) || /^игрок/i.test(t);
}

function cleanPlayerName(raw: string | null | undefined, num: number): string {
  const t = String(raw ?? '').trim();
  if (isPlaceholderName(t)) return `№${String(num).padStart(2, '0')}`;
  return t;
}

/** Разбивает «Фамилия И.» → {firstName, lastName} для записи в БД. */
function splitName(full: string): { firstName: string | null; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: null, lastName: full.trim() };
  return { lastName: parts[0]!, firstName: parts.slice(1).join(' ') };
}

/**
 * Имя для записи в БД из meta парсера. Парсер даёт firstName/lastName (полное имя
 * «Имя Фамилия»), либо только короткое «Фамилия И.» в name — обрабатываем оба.
 */
function nameParts(
  meta: { name?: string; firstName?: string; lastName?: string },
  num: number,
): { full: string; firstName: string | null; lastName: string } {
  const full = cleanPlayerName(meta.name, num);
  if (isPlaceholderName(full)) return { full, firstName: null, lastName: full };
  if (meta.firstName || meta.lastName) {
    return { full, firstName: meta.firstName ?? null, lastName: meta.lastName ?? full };
  }
  const sp = splitName(full); // legacy «Фамилия И.»
  return { full, firstName: sp.firstName, lastName: sp.lastName };
}

interface SecondaryOutput {
  match: {
    homeTeam: string | null;
    awayTeam: string | null;
    date: string | null;
    score: { home: number; away: number } | null;
    sourceSheet?: string;
    source?: string;
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
    let secondaryKind: 'xlsx' | 'csv' = 'csv';

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'file' || part.fieldname === 'pdf') {
          pdfBuffer = await part.toBuffer();
          pdfFilename = part.filename ?? pdfFilename;
        } else if (['excel', 'xlsx', 'csv', 'stats'].includes(part.fieldname)) {
          // Вторичный файл с детальной per-player статистикой: Excel (legacy) или
          // CSV (SportVisor/Наградион). Тип — по расширению, фоллбэк на имя поля.
          xlsxBuffer = await part.toBuffer();
          xlsxFilename = part.filename ?? null;
          const fn = (part.filename ?? '').toLowerCase();
          secondaryKind = fn.endsWith('.csv') || part.fieldname === 'csv'
            ? 'csv'
            : fn.endsWith('.xlsx') || part.fieldname === 'excel' || part.fieldname === 'xlsx'
              ? 'xlsx'
              : 'csv';
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
      // ─── 1. Вторичный парсер (если есть) — детальные per-player stats + имена.
      // CSV (новый SportVisor/Наградион) → тот же неймспейс attack/defence/fitness,
      // что и PDF → источник истины в мердже. Excel (legacy) → группы
      // passing/attacking/... → доливает недостающее.
      let excelData: SecondaryOutput | null = null;
      // Командные агрегаты СУММОЙ из per-player CSV/xlsx — спасают команд-слой,
      // когда PDF урезанный (25 стр. без детальных команд-страниц → teamAggregates
      // из PDF пустые). Двуязычные заголовки (рус/англ). Best-effort.
      let csvDerivedAgg: Record<string, Record<string, { value: number }>> | null = null;
      if (xlsxBuffer) {
        const script = secondaryKind === 'csv' ? 'parse_csv.py' : 'parse_excel.py';
        await runPython(PYTHON_BIN, [join(PARSERS_DIR, script), xlsxPath, xlsxOutPath], work);
        excelData = JSON.parse(await readFile(xlsxOutPath, 'utf-8')) as SecondaryOutput;
        logger.info({ matchId, kind: secondaryKind, players: excelData.players.length, cols: excelData.match.columnsCount }, '[upload] secondary stats parsed');
        try {
          const aggPath = join(work, 'csv_agg.json');
          await runPython(PYTHON_BIN, [join(PARSERS_DIR, 'xlsx_aggregates.py'), xlsxPath, aggPath], work);
          const parsed = JSON.parse(await readFile(aggPath, 'utf-8')) as { players: number; aggregates: Record<string, Record<string, { value: number }>> };
          if (parsed.players > 0) csvDerivedAgg = parsed.aggregates;
          logger.info({ matchId, csvAggPlayers: parsed.players }, '[upload] team aggregates derived from CSV/xlsx');
        } catch (e) {
          logger.warn({ matchId, err: (e as Error).message }, '[upload] CSV team-aggregates derive failed');
        }
      }

      // ─── 2+3. Upsert players из Excel + дамп ростера для PDF parser ───
      // Одна транзакция, одно соединение из пула: upsert атомарен (обрыв на
      // середине цикла → ROLLBACK, без частично залитых игроков), а SELECT ростера
      // читает только что вставленные строки (read-your-writes в той же tx).
      const roster = await withTenantTx(tenantSlug, async (_tx, conn) => {
        // Существующая база команды (на первой загрузке — пустая). Матчим
        // игроков отчёта к ней по номер+фамилия → один человек = одна строка,
        // перезаливы цепляются к той же записи, дублей нет.
        const existing = await conn.query<RosterEntry & { teamId: string }>(
          `SELECT id, team_id AS "teamId", number,
                  full_name AS "fullName", first_name AS "firstName",
                  last_name AS "lastName", position
             FROM players WHERE tenant_id = $1 AND team_id = $2`,
          [tenantSlug, teamId!],
        );
        const index = buildRosterIndex(existing.rows);

        if (excelData?.players?.length) {
          let added = 0;
          for (const ep of excelData.players) {
            const num = parseInt(ep.number, 10);
            if (!num || !ep.name) continue;
            const cleaned = cleanPlayerName(ep.name, num);
            const lastName = cleaned.split(' ').pop() || '';
            const firstName = cleaned.split(' ').slice(0, -1).join(' ') || '';
            // Резолв к существующей записи; иначе детерминир. id по фамилии+номеру
            // (заглушки «№NN» без фамилии → id по номеру).
            const resolved = resolvePlayerId(teamId!, index, { number: num, fullName: cleaned, firstName, lastName });
            const pid = resolved.id ?? `sv-${teamId}-n${String(num).padStart(2, '0')}`;
            await conn.query(
              `INSERT INTO players (id, tenant_id, team_id, full_name, first_name, last_name, number)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id) DO UPDATE SET
                 full_name  = EXCLUDED.full_name,
                 first_name = EXCLUDED.first_name,
                 last_name  = EXCLUDED.last_name,
                 number     = EXCLUDED.number`,
              [pid, tenantSlug, teamId, cleaned, firstName, lastName, num],
            );
            // Держим индекс свежим: новый игрок виден следующим строкам отчёта
            // (исключаем повторное создание при дубле номера/имени внутри файла).
            if (!resolved.matched) {
              indexAdd(index, { id: pid, number: num, fullName: cleaned, firstName, lastName });
              added++;
            }
          }
          logger.info({ matchId, fromExcel: excelData.players.length, added }, '[upload] players resolved from excel');
        }
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

      // ─── 4. NEW rich PDF parser (extract_tables — все 13+ страниц) ──────
      const richPath = join(work, 'rich.json');
      await runPython(PYTHON_BIN,
        [join(PARSERS_DIR, 'parse_zenit_full.py'), pdfPath, richPath], work);
      // Валидация структуры вывода парсера (Phase 1) — ловим регрессии формата
      // до записи в БД, а не пишем мусор.
      validateRich(JSON.parse(await readFile(richPath, 'utf-8')));
      const rich = JSON.parse(await readFile(richPath, 'utf-8')) as {
        overall_meta: Record<string, { name: string; position: string; minutes: number | null; firstName?: string; lastName?: string; positionFull?: string }>;
        radar:   Record<string, Record<string, number>>;
        fitness: Record<string, Record<string, unknown>>;
        attack:  Record<string, Record<string, unknown>>;
        defence: Record<string, Record<string, unknown>>;
        splits?: Record<string, Record<string, { match: number; first: number | null; second: number | null }>>;
      };
      logger.info({ matchId, richPlayers: Object.keys(rich.radar).length, richSplits: Object.keys(rich.splits ?? {}).length }, '[upload] rich PDF parsed');

      // Старый build_match — для page1 / teamSummary / teamAggregates / formation
      const pdfArgs = [join(PARSERS_DIR, 'build_match.py'), pdfPath, pdfOutPath, teamId!, matchId];
      const pyStdout = await runPython(PYTHON_BIN, pdfArgs, work, { ROSTER_JSON: playersPath });
      logger.info({ matchId, py: pyStdout.slice(-200) }, '[upload] pdf parsed');
      const pdfData = existsSync(pdfOutPath)
        ? JSON.parse(await readFile(pdfOutPath, 'utf-8')) as PdfOutput
        : ({} as PdfOutput);

      // Семантика: это вообще отчёт SportVisor? Если ни rich, ни legacy не нашли
      // игроков — отклоняем (Phase 1), чтобы не создавать пустой матч.
      assertSportVisor(Object.keys(rich.radar).length, (pdfData.players ?? []).length);

      // ─── 4.5 Maps (best-effort) — cropпим ВСЕ heatmap/pass-карты из PDF в base64.
      // 9 командных карт + formation + per-player attack/heatmap. Storage в DB
      // как data URL (нет ephemeral disk зависимости на Render).
      const mapsOutPath = join(work, 'maps.json');
      let maps: { teamMaps: Record<string, string>; formationImage: string | null;
                  playerMaps: Record<string, { attackMap?: string; heatmap?: string }>; } = {
        teamMaps: {}, formationImage: null, playerMaps: {},
      };
      try {
        const mapsStdout = await runPython(PYTHON_BIN,
          [join(PARSERS_DIR, 'crop_all_b64.py'), pdfPath, matchId, teamId!, mapsOutPath],
          work, { ROSTER_JSON: playersPath });
        if (existsSync(mapsOutPath)) {
          maps = JSON.parse(await readFile(mapsOutPath, 'utf-8'));
          logger.info({ matchId,
            teamMaps: Object.keys(maps.teamMaps).length,
            formation: maps.formationImage ? 1 : 0,
            playerMaps: Object.keys(maps.playerMaps).length,
            stdout: mapsStdout.slice(-200),
          }, '[upload] maps cropped');
        }
      } catch (e) {
        logger.warn({ matchId, err: (e as Error).message }, '[upload] maps crop failed — пустые карты');
      }

      // ─── 4.55 Events timeline (хроника матча: голы / ЖК / замены) ──
      // Best-effort: parse_events.py читает p1-p4, ищет минуты + тип события.
      const eventsOutPath = join(work, 'events.json');
      let events: Array<Record<string, unknown>> = [];
      try {
        await runPython(PYTHON_BIN,
          [join(PARSERS_DIR, 'parse_events.py'), pdfPath, eventsOutPath], work);
        if (existsSync(eventsOutPath)) {
          const ev = JSON.parse(await readFile(eventsOutPath, 'utf-8'));
          events = ev.events ?? [];
          logger.info({ matchId, events: events.length }, '[upload] events parsed');
        }
      } catch (e) {
        logger.warn({ matchId, err: (e as Error).message }, '[upload] events parse failed — пустой timeline');
      }

      // ─── 4.6 Auto-derive teamAggregates из rich (если build_match вернул пустой)
      // Современный SportVisor U-15 PDF — parse_team_aggregates даёт {}.
      // Складываем per-player rich stats в командные секции, чтобы блок
      // «Детальная аналитика» на ClubDashboard / MatchDetail имел контент.
      type CompoundOrNum = number | { total?: number; successful?: number; accuracy?: number; value?: number };
      const sumScalar = (key: string, grp: 'attack' | 'defence' | 'fitness'): number => {
        let total = 0;
        for (const numStr of Object.keys(rich.overall_meta)) {
          const v = (rich as Record<string, Record<string, Record<string, CompoundOrNum>>>)[grp]?.[numStr]?.[key];
          if (typeof v === 'number') total += v;
          else if (v && typeof v === 'object') {
            total += Number(v.successful ?? v.value ?? v.total ?? 0);
          }
        }
        return total;
      };
      const sumTotal = (key: string, grp: 'attack' | 'defence' | 'fitness'): number => {
        let total = 0;
        for (const numStr of Object.keys(rich.overall_meta)) {
          const v = (rich as Record<string, Record<string, Record<string, CompoundOrNum>>>)[grp]?.[numStr]?.[key];
          if (typeof v === 'number') total += v;
          else if (v && typeof v === 'object') {
            total += Number(v.total ?? v.value ?? 0);
          }
        }
        return total;
      };
      const derivedAggregates = {
        shooting: {
          shots:    { value: sumTotal('shot', 'attack') },
          onTarget: { value: sumScalar('shot', 'attack') },
          goals:    { value: sumScalar('goal', 'attack') },
          byHead:   { value: sumScalar('byHead', 'attack') },
        },
        passes: {
          total:           { value: sumTotal('pass', 'attack') },
          successful:      { value: sumScalar('pass', 'attack') },
          progressive:     { value: sumScalar('progressivePass', 'attack') },
          toFinalThird:    { value: sumScalar('passToFinalThird', 'attack') },
          intoPenArea:     { value: sumScalar('intoPenArea', 'attack') },
          crosses:         { value: sumScalar('cross', 'attack') },
          keyPass:         { value: sumScalar('keyPass', 'attack') },
        },
        attacks: {
          assists:       { value: sumScalar('assist', 'attack') },
          goalActions:   { value: sumScalar('goalActions', 'attack') },
          dribble:       { value: sumScalar('dribble', 'attack') },
          touchesInBox:  { value: sumScalar('touchesInPenArea', 'attack') },
          entriesInBox:  { value: sumScalar('entriesInBox', 'attack') },
        },
        possession: {
          lostBall:        { value: sumScalar('lostBall', 'attack') },
          technicalMistake:{ value: sumScalar('technicalMistake', 'attack') },
          loseOnOwnHalf:   { value: sumScalar('loseOnOwnHalf', 'attack') },
        },
        recoveriesAndTackling: {
          tackle:       { value: sumScalar('tackle', 'defence') },
          interception: { value: sumScalar('interception', 'defence') },
          recovery:     { value: sumScalar('recovery', 'defence') },
        },
        duels: {
          duel:       { value: sumScalar('duel', 'defence') },
          aerialDuel: { value: sumScalar('aerialDuel', 'defence') },
        },
        pressing: {
          pressing:        { value: sumScalar('pressing', 'defence') },
          counterpressing: { value: sumScalar('counterpressing', 'defence') },
        },
        positioning: {
          clearance:    { value: sumScalar('clearance', 'defence') },
          rebounds:     { value: sumScalar('rebounds', 'defence') },
          blockedShot:  { value: sumScalar('blockedShot', 'defence') },
        },
        setPieces: {
          corner:        { value: sumScalar('corner', 'attack') },
          freeKickShot:  { value: sumScalar('freeKickShot', 'attack') },
          freeKick:      { value: sumScalar('freeKick', 'attack') },
          penalty:       { value: sumScalar('penalty', 'attack') },
          throwing:      { value: sumScalar('throwing', 'attack') },
        },
      };
      // Приоритет источников teamAggregates (от низшего к высшему):
      //   rich-derived (из PDF-рейтингов; пусто на урезанном PDF)
      //   < CSV-derived (сумма per-player; полная и чистая, спасает урезанный PDF)
      //   < build_match (детальные команд-страницы PDF; есть только в полном отчёте).
      // CSV перекрывает rich на уровне метрики ТОЛЬКО при value>0 (csv-нуль от
      // отсутствующей колонки не должен затирать rich-значение). build_match
      // (полный PDF) выигрывает всегда → у рабочих матчей поведение не меняется.
      const richAgg = derivedAggregates as Record<string, Record<string, { value: number }>>;
      const baseAgg: Record<string, Record<string, { value: number }>> = {};
      for (const sec of new Set([...Object.keys(richAgg), ...Object.keys(csvDerivedAgg ?? {})])) {
        const merged: Record<string, { value: number }> = { ...(richAgg[sec] ?? {}) };
        for (const [metric, v] of Object.entries(csvDerivedAgg?.[sec] ?? {})) {
          if (v.value > 0 || !(metric in merged)) merged[metric] = { value: v.value };
        }
        baseAgg[sec] = merged;
      }
      const teamAggregatesMerged: Record<string, unknown> = {};
      for (const [k, base] of Object.entries(baseAgg)) {
        const existing = (pdfData.teamAggregates as Record<string, unknown>)?.[k];
        teamAggregatesMerged[k] = (existing && typeof existing === 'object' && Object.keys(existing).length > 0)
          ? { ...base, ...existing }
          : base;
      }

      // ─── 4.7 Auto-derive teamAvgRatings из rich.radar
      // Считаем средние Performance Index (overall/fitness/attack/defence) только
      // среди реально игравших (minutes > 0 и overall > 0). Это закрывает кейс
      // когда parse_team_tables возвращает teamAvgRatings = {overall: null, ...}
      // и фронт показывает «0.00» во всех плитках.
      const playedNums = Object.entries(rich.overall_meta)
        .filter(([num, meta]) => Number(meta.minutes ?? 0) > 0 && Number(rich.radar[num]?.overall ?? 0) > 0)
        .map(([num]) => num);
      const avg = (key: string): number | null => {
        if (!playedNums.length) return null;
        const total = playedNums.reduce(
          (s, n) => s + Number(rich.radar[n]?.[key] ?? 0), 0,
        );
        const result = total / playedNums.length;
        return result > 0 ? Number(result.toFixed(2)) : null;
      };
      const derivedTeamAvg = {
        overall: avg('overall'),
        fitness: avg('fitnessTotal') ?? avg('fitnessRating'),
        attack:  avg('attackTotal')  ?? avg('attackRating'),
        defence: avg('defenceTotal') ?? avg('defenceRating'),
      };
      // Если build_match вернул содержательный teamAvgRatings — оставляем (приоритет
      // legacy парсера), иначе используем derived.
      const pdfTar = (pdfData.teamAvgRatings as Record<string, unknown> | null) ?? null;
      const pdfHasReal = pdfTar && ['overall','fitness','attack','defence'].some((k) => {
        const v = pdfTar[k]; return v != null && Number(v) > 0;
      });
      const finalTeamAvgRatings = pdfHasReal ? pdfTar : derivedTeamAvg;

      // ─── 5. Merge + insert ───────────────────────────────────────
      let matchDate = pdfData.date || excelData?.match.date || null;
      let homeName  = pdfData.homeTeam?.name || excelData?.match.homeTeam || '';
      let awayName  = pdfData.awayTeam?.name || excelData?.match.awayTeam || '';
      const score   = pdfData.score || excelData?.match.score || null;

      // Вся запись матча атомарна: match + match_players + data_quality +
      // авто-открытие команды. Падение на любом шаге → ROLLBACK, без матча-огрызка
      // (вставленный match без игроков / без data_quality).
      await withTenantTx(tenantSlug, async (_tx, conn) => {
        // Fallback 1: если парсер не вытянул home/away — берём из ближайшей
        // фикстуры календаря текущего tenant'а (наш матч). Это закрывает кейс,
        // когда PDF без явной шапки или формат титула не распознан.
        if (!homeName || !awayName) {
          const calRes = await conn.query<{ home_team: string; away_team: string; match_date: string }>(
            `SELECT home_team, away_team, match_date
               FROM calendar
              WHERE tenant_id = $1 AND is_our_match = TRUE
              ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(match_date, NOW()) - COALESCE($2::timestamptz, NOW())))) ASC
              LIMIT 1`,
            [tenantSlug, matchDate],
          );
          if (calRes.rows[0]) {
            if (!homeName) homeName = calRes.rows[0].home_team || '';
            if (!awayName) awayName = calRes.rows[0].away_team || '';
            if (!matchDate) matchDate = calRes.rows[0].match_date;
            logger.info({ matchId, src: 'calendar', homeName, awayName }, '[upload] team names from calendar fallback');
          }
        }
        // Fallback 2: подставляем имя нашей команды + «Соперник», чтобы не было пустоты.
        if (!homeName || !awayName) {
          const t = await conn.query<{ name: string }>(`SELECT name FROM teams WHERE id = $1`, [teamId]);
          const ourName = t.rows[0]?.name || 'Наша команда';
          if (!homeName) homeName = ourName;
          if (!awayName) awayName = 'Соперник';
          logger.warn({ matchId, homeName, awayName }, '[upload] team names — last-resort fallback');
        }
        // Ориентация дом/гость: пишем наш team_id в соответствующую колонку, чтобы
        // фронт определял сторону по ID, а не по подстроке имени (порт §13.4 / задача #4).
        const ourTeamRes = await conn.query<{ name: string }>(`SELECT name FROM teams WHERE id = $1`, [teamId]);
        const ourSide = resolveOurSide(ourTeamRes.rows[0]?.name, homeName, awayName);
        const homeTeamId = ourSide === 'home' ? teamId : null;
        const awayTeamId = ourSide === 'away' ? teamId : null;
        if (!ourSide) {
          logger.warn(
            { matchId, ourName: ourTeamRes.rows[0]?.name, homeName, awayName },
            '[upload] orientation undetermined — home/away ids left null',
          );
        }
        await conn.query(
          `INSERT INTO matches (
             id, tenant_id, team_id, ext_match_id,
             home_team_id, away_team_id,
             home_team_name, away_team_name, match_date, season, tournament,
             score_home, score_away, pdf_source,
             team_summary_stats, team_aggregates, team_avg_ratings, meta
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb)`,
          [
            matchId, tenantSlug, teamId, matchId,
            homeTeamId, awayTeamId,
            homeName, awayName, matchDate, '2025-2026', tournament,
            score?.home ?? null, score?.away ?? null,
            `upload://${pdfFilename}`,
            JSON.stringify(pdfData.teamSummaryStats ?? {}),
            JSON.stringify(teamAggregatesMerged),
            JSON.stringify(finalTeamAvgRatings ?? {}),
            JSON.stringify({
              pdfFile: pdfFilename,
              xlsxFile: xlsxFilename,
              formation: pdfData.formation ?? null,
              formationImage: maps.formationImage ?? null,
              teamMaps: maps.teamMaps ?? {},
              events,
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
          maps:    { attackMap?: string; heatmap?: string };
        };
        const combined = new Map<string, CombinedEntry>();
        const rosterByNum = new Map<string, typeof roster[number]>();
        for (const r of roster) {
          if (r.number != null) rosterByNum.set(String(r.number).padStart(2, '0'), r);
        }
        // Единый индекс для резолва игрока к существующей записи (номер+фамилия →
        // уникальная фамилия → полное имя). Один человек = одна строка.
        const rosterIndex: RosterIndex = buildRosterIndex(roster);

        // PRIMARY: rich PDF data — все 17 игроков с radar + attack/defence/fitness stats
        for (const [numStr, meta] of Object.entries(rich.overall_meta)) {
          const radar = rich.radar[numStr] ?? {};
          const np = nameParts(meta, parseInt(numStr, 10));
          const num = parseInt(numStr, 10);
          // Резолв к существующей записи (даже под другим №); иначе детерминир.
          // id по фамилии+номеру; заглушка без фамилии → по номеру.
          const resolved = resolvePlayerId(teamId!, rosterIndex, { number: num, fullName: np.full, firstName: np.firstName, lastName: np.lastName });
          let playerId = resolved.id;
          let rosterRow = resolved.matched ? rosterIndex.entries.find((e) => e.id === playerId) : undefined;
          // Имя из PDF могло гарблиться (русская локаль SportVisor: кириллица →
          // нечитаемо), и резолв по фамилии не сматчил существующего игрока.
          // Фоллбэк по НОМЕРУ к ростеру (он только что синхронизирован из чистого
          // Excel этого матча) — иначе плодим дубль вроде «А.» #15 рядом с «Дютиль».
          if (!rosterRow) {
            const byNum = rosterByNum.get(numStr);
            if (byNum) {
              playerId = byNum.id;
              rosterRow = rosterIndex.entries.find((e) => e.id === byNum.id);
            }
          }
          if (!playerId) playerId = `pdf-${teamId}-n${numStr}`;
          if (!rosterRow) {
            await conn.query(
              `INSERT INTO players (id, tenant_id, team_id, full_name, first_name, last_name, number, position)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO NOTHING`,
              [playerId, tenantSlug, teamId, np.full, np.firstName, np.lastName, num, meta.position],
            );
            indexAdd(rosterIndex, { id: playerId, number: num, fullName: np.full, firstName: np.firstName, lastName: np.lastName, position: meta.position });
          } else if (!isPlaceholderName(np.full) && isPlaceholderName(rosterRow.fullName)) {
            // Существующий игрок с именем-заглушкой («U16»/«№8») — подставляем
            // реальное имя из PDF (Excel может быть пустым, а в PDF имена есть).
            await conn.query(
              `UPDATE players SET full_name = $1, first_name = $2, last_name = $3
                 WHERE id = $4 AND tenant_id = $5`,
              [np.full, np.firstName, np.lastName, playerId, tenantSlug],
            );
            logger.info({ matchId, playerId, name: np.full }, '[upload] backfilled real name from PDF');
          }
          combined.set(numStr, {
            number: numStr,
            playerId,
            minutes: meta.minutes,
            position: meta.position,
            ratings: {
              overall: Number(radar.overall ?? 0),
              fitness: Number(radar.fitnessTotal ?? radar.fitnessRating ?? 0),
              attack:  Number(radar.attackTotal  ?? radar.attackRating  ?? 0),
              defence: Number(radar.defenceTotal ?? radar.defenceRating ?? 0),
            },
            radar,
            stats: {
              attack:  rich.attack[numStr]  ?? {},
              defence: rich.defence[numStr] ?? {},
              fitness: rich.fitness[numStr] ?? {},
            },
            // Сплиты 1/2 тайм со страниц per-player (Phase: by-half stats).
            splits: rich.splits?.[numStr] ?? {},
            maps: maps.playerMaps[playerId] ?? {},
          });
        }
        // ── Стратегия источников per-player: PDF — основной, Excel — fallback. ──
        // PDF (rich) даёт ratings/radar + attack/defence/fitness. Excel несёт
        // ДРУГИЕ группы (passing/duels/pressing/dribbling/setpieces/fouls) — их в
        // PDF нет. Поэтому Excel ДОБАВЛЯЕТ недостающие группы, не перетирая PDF.
        // `excelData?.players ?? []` → если Excel не загружен, цикл просто пустой
        // (Excel есть не всегда — деградируем gracefully, PDF самодостаточен).
        // Доверие к значению = «есть группа». Группа из PDF приоритетна; пустую
        // (которой PDF не дал) закрываем из Excel.
        // CSV — тот же неймспейс (attack/defence/fitness), структурированный эталон
        // → перетирает PDF по-ключу (источник истины, устойчив к сдвигам колонок PDF).
        // Excel (legacy) — другие группы (passing/attacking/...) → доливаем
        // недостающее, не трогая PDF-группы.
        for (const ep of excelData?.players ?? []) {
          if (!ep.number) continue;
          const numStr = String(parseInt(ep.number, 10)).padStart(2, '0');
          const ex = combined.get(numStr);
          if (!ex) continue;
          const stats = ex.stats as Record<string, Record<string, unknown>>;
          for (const [grp, vals] of Object.entries(ep.stats)) {
            const groupVals = vals as Record<string, unknown>;
            if (secondaryKind === 'csv') {
              stats[grp] = { ...(stats[grp] ?? {}), ...groupVals }; // CSV wins per-key
            } else {
              const cur = stats[grp];
              const pdfHasGroup = cur && typeof cur === 'object' && Object.keys(cur).length > 0;
              if (!pdfHasGroup) stats[grp] = groupVals; // PDF группу не дал → из Excel
            }
          }
        }
        // FROM old build_match — для splits только (1st/2nd half)
        for (const pp of pdfData.players ?? []) {
          if (pp.number == null) continue;
          const numStr = String(pp.number).padStart(2, '0');
          const existing = combined.get(numStr);
          const rosterRow = rosterByNum.get(numStr);
          if (existing) {
            // rich PDF дал ratings/radar/stats + сплиты (per-player страницы).
            // build_match-сплиты берём ТОЛЬКО если rich их не дал.
            const hasRich = existing.splits && typeof existing.splits === 'object' && Object.keys(existing.splits as object).length > 0;
            if (pp.splits && !hasRich) existing.splits = pp.splits;
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
              maps: maps.playerMaps[rosterRow.id] ?? {},
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
              maps: maps.playerMaps[pid] ?? {},
            });
          }
        }

        // Insert match_players
        for (const e of combined.values()) {
          await conn.query(
            `INSERT INTO match_players (
               match_id, player_id, tenant_id, number, position, minutes,
               ratings, stats, splits, radar, maps
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb)
             ON CONFLICT (match_id, player_id) DO UPDATE SET
               number = EXCLUDED.number, position = EXCLUDED.position, minutes = EXCLUDED.minutes,
               ratings = EXCLUDED.ratings, stats = EXCLUDED.stats,
               splits = EXCLUDED.splits, radar = EXCLUDED.radar,
               maps = EXCLUDED.maps`,
            [
              matchId, e.playerId, tenantSlug,
              parseInt(e.number, 10), e.position, e.minutes,
              JSON.stringify(e.ratings),
              JSON.stringify(e.stats),
              JSON.stringify(e.splits),
              JSON.stringify(e.radar),
              JSON.stringify(e.maps),
            ],
          );
        }

        // ─── Индикатор достоверности данных (Phase 1) — кешируем снапшот в matches.
        const mpLike = [...combined.values()].map((e) => ({
          ratings: e.ratings, minutes: e.minutes, stats: e.stats, splits: e.splits,
        }));
        const dq = computeDataQuality(
          {
            teamSummaryStats: pdfData.teamSummaryStats ?? {},
            teamAggregates: teamAggregatesMerged,
            teamAvgRatings: finalTeamAvgRatings ?? {},
            meta: {
              formation: pdfData.formation ?? null,
              formationImage: maps.formationImage ?? null,
              teamMaps: maps.teamMaps ?? {},
              events,
              xlsxFile: xlsxFilename,
            },
          },
          mpLike,
        );
        await conn.query(
          `UPDATE matches SET data_quality = $1::jsonb WHERE tenant_id = $2 AND id = $3`,
          [JSON.stringify(dq), tenantSlug, matchId],
        );
        logger.info({ matchId, dataQuality: dq.score }, '[upload] data quality computed');

        // Авто-открытие команды: команда с загруженным разбором никогда не остаётся
        // скрытой от клуба. Идемпотентно — если уже active=TRUE, no-op.
        const opened = await conn.query(
          `UPDATE teams SET active = TRUE
             WHERE id = $1 AND tenant_id = $2 AND active = FALSE`,
          [teamId, tenantSlug],
        );
        if (opened.rowCount) logger.info({ matchId, teamId }, '[upload] team auto-opened on first match');

        // Авто-дедуп фантомов: парсер на отчёте с нечитаемой кириллицей мог
        // создать запись с мусорным именем («А.» #15) рядом с настоящим игроком
        // того же номера. Сливаем в той же tenant-транзакции — дубли не копятся.
        const removedDups = await dedupePhantomsByNumber(conn, tenantSlug, teamId!);
        if (removedDups) logger.info({ matchId, teamId, removed: removedDups }, '[upload] phantom dups merged by number');
      });

      // ─── Фото: повторная загрузка отчёта могла создать/пересоздать строки
      // игроков (новый sv-хэш по имени, воскрешённый дубль и т.п.) с photo_url
      // = NULL → на дашборде у них пропадает фото. enrichTenantPhotos заполняет
      // ТОЛЬКО NULL по ростеру FFSPB — идемпотентно, существующие фото не трогает.
      // Ext-id нашей команды берём из календаря: это id, который встречается во
      // ВСЕХ наших матчах данного возраста (соперники меняются — мы постоянны).
      // Запускаем ПОСЛЕ коммита матча, отдельной транзакцией (сетевой вызов к
      // FFSPB не держит основную tx). Best-effort: ошибка не валит загрузку.
      try {
        await withTenant(tenantSlug, async (_tx, conn) => {
          const { rows } = await conn.query<{ extId: string }>(
            `SELECT ext_id AS "extId" FROM (
               SELECT ext_home_team_id AS ext_id FROM calendar
                 WHERE tenant_id = $1 AND is_our_match = TRUE
                   AND age_group = (SELECT age_group FROM teams WHERE id = $2 AND tenant_id = $1)
               UNION ALL
               SELECT ext_away_team_id AS ext_id FROM calendar
                 WHERE tenant_id = $1 AND is_our_match = TRUE
                   AND age_group = (SELECT age_group FROM teams WHERE id = $2 AND tenant_id = $1)
             ) t
             WHERE ext_id IS NOT NULL
             GROUP BY ext_id ORDER BY COUNT(*) DESC LIMIT 1`,
            [tenantSlug, teamId],
          );
          const ourExtId = rows[0]?.extId;
          if (!ourExtId) return;
          const res = await enrichTenantPhotos(conn, tenantSlug, [ourExtId]);
          if (res.filled) logger.info({ matchId, teamId, ...res }, '[upload] photos re-enriched after report upload');
        });
      } catch (e) {
        logger.warn({ matchId, err: e instanceof Error ? e.message : String(e) }, '[upload] photo re-enrich skipped');
      }

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

function runPython(bin: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { cwd, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...extraEnv } });
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
