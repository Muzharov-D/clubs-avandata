import { withTenant } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';
import { listMatches, getMatch, isFfspbConfigured } from './ffspbApi.js';

/**
 * Заливка ПОМИНУТНОГО участия игроков из FFSPB в matches + match_players —
 * топливо клубной «карты потерь»/RAE (минуты игрока ÷ доступные минуты команды).
 *
 * FFSPB даёт участие (participatedPlayers), НЕ рейтинги — поэтому пишем minutes +
 * выход на поле, а ratings/stats/radar (SportVisor) НЕ трогаем: ON CONFLICT
 * обновляет только FFSPB-производные поля. Формула минут — как в syncLossMap
 * (bench = 0/1 ЧИСЛО, не boolean; replaceMin/replacedBy для замен).
 */

interface FfspbParticipation {
  request?: unknown;          // IRI игрока «/api/players/<id>»
  replacedBy?: unknown;       // кто вышел вместо него
  replaceMin?: number;        // минута замены
  bench?: number | boolean;   // 0/1 — был ли в запасе
  number?: number | null;
  team?: { '@id'?: string };
}
interface FfspbMatchListItem {
  '@id'?: string;
  id?: number | string;
  host?: { '@id'?: string; name?: string; shortName?: string };
  guest?: { '@id'?: string; name?: string; shortName?: string };
  resultHost?: number | null;
  resultGuest?: number | null;
  done?: number;
  publicDate?: string;
}
interface FfspbMatchFull {
  '@id'?: string;
  id?: number | string;
  host?: unknown;
  guest?: unknown;
  length?: number;            // длительность матча, СЕКУНДЫ
  participatedPlayers?: FfspbParticipation[];
}

const idTail = (x: unknown): number | null => {
  const s = typeof x === 'string' ? x : (x as { '@id'?: string } | null)?.['@id'];
  const m = s && String(s).match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
};

async function pmap<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); }
    }),
  );
  return out;
}

/** Минуты каждого игрока матча по participatedPlayers (формула syncLossMap). */
function computeMinutes(pp: FfspbParticipation[], lengthSec: number | undefined): Map<number, number> {
  const L = (Number(lengthSec) || 4200) / 60; // мин; дефолт 70'
  // Запасной, вышедший на замену, играл (L − минута выхода). Минуту выхода берём
  // из replaceMin того, кого он заменил (replacedBy указывает на вышедшего).
  const offMin = new Map<number, number>();
  for (const p of pp) {
    if (Number(p.replaceMin) > 0) {
      const rep = idTail(p.replacedBy);
      if (rep != null) offMin.set(rep, Number(p.replaceMin));
    }
  }
  const out = new Map<number, number>();
  for (const p of pp) {
    const pid = idTail(p.request);
    if (pid == null) continue;
    const bench = Number(p.bench) === 1;
    const mins = !bench
      ? (Number(p.replaceMin) > 0 ? Math.min(L, Number(p.replaceMin)) : L)        // в старте (возм. заменён)
      : (offMin.has(pid) ? Math.max(0, L - offMin.get(pid)!) : 0);                 // запас: вышел / не вышел
    out.set(pid, Math.round(mins));
  }
  return out;
}

export interface SyncParticipationResult {
  ok: boolean;
  matches?: number;
  playerRows?: number;
  error?: string;
}

/**
 * Синк участия (matches + match_players.minutes) для одной нашей команды по турниру.
 * Идемпотентно. Рейтинги SportVisor сохраняются (ON CONFLICT не перезаписывает их).
 */
export async function syncTenantMatchParticipation(args: {
  tenantSlug: string;
  ageGroup: string;
  teamId: string;                 // наша команда {slug}-{age}
  ffspbTeamId: string | number;   // id команды в FFSPB
  tournamentId: string | number;
  tournament: 'league' | 'cup';
  season: string;
}): Promise<SyncParticipationResult> {
  const { tenantSlug, ageGroup, teamId, ffspbTeamId, tournamentId, tournament, season } = args;
  if (!isFfspbConfigured()) return { ok: false, error: 'FFSPB_API_KEY not configured' };
  const ourTid = Number(ffspbTeamId);
  try {
    const list = (await listMatches(tournamentId)) as FfspbMatchListItem[];
    const ours = list.filter((m) => idTail(m.host) === ourTid || idTail(m.guest) === ourTid);
    if (!ours.length) return { ok: true, matches: 0, playerRows: 0 };

    // Наши игроки — для FK и фильтра участий (чужих в match_players не пишем).
    const ourPlayerIds = await withTenant(tenantSlug, async (_tx, conn) => {
      const r = await conn.query<{ id: string }>(
        `SELECT id FROM players WHERE tenant_id = $1 AND team_id = $2`,
        [tenantSlug, teamId],
      );
      return new Set(r.rows.map((x) => x.id));
    });

    // Детали матчей (participatedPlayers + length) — щадящая конкуренция 6.
    const pairs = (await pmap(ours, 6, async (m) => {
      const mid = idTail(m) ?? m.id;
      if (mid == null) return null;
      const det = await getMatch(mid).catch(() => null) as FfspbMatchFull | null;
      return det ? { m, det } : null;
    })).filter(Boolean) as Array<{ m: FfspbMatchListItem; det: FfspbMatchFull }>;

    let matchCount = 0;
    let playerRows = 0;
    await withTenant(tenantSlug, async (_tx, conn) => {
      for (const { m, det } of pairs) {
        const extId = idTail(det) ?? det.id ?? idTail(m) ?? m.id;
        if (extId == null) continue;
        const pp = det.participatedPlayers ?? [];
        if (!pp.length) continue;

        const hasScore = m.resultHost != null && m.resultGuest != null && (m.done ?? 0) >= 4;
        // Длина матча (мин) → meta.lengthMin: нужна для «доступных минут команды»
        // в клубной карте потерь (game-time% = минуты игрока ÷ сумма длин матчей).
        const lengthMin = Math.round((Number(det.length) || 4200) / 60);
        // Матч: обновляем только FFSPB-поля; team_summary_stats/ratings (SportVisor)
        // не трогаем. RETURNING id — берём канонический id (вдруг матч уже заведён
        // из SportVisor с другим id, но тем же ext_match_id).
        const ins = await conn.query<{ id: string }>(
          `INSERT INTO matches (
             id, tenant_id, team_id, ext_match_id, home_team_name, away_team_name,
             match_date, season, tournament, score_home, score_away, meta
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
           ON CONFLICT (tenant_id, ext_match_id) DO UPDATE SET
             match_date  = EXCLUDED.match_date,
             score_home  = EXCLUDED.score_home,
             score_away  = EXCLUDED.score_away,
             home_team_name = COALESCE(matches.home_team_name, EXCLUDED.home_team_name),
             away_team_name = COALESCE(matches.away_team_name, EXCLUDED.away_team_name),
             meta = matches.meta || EXCLUDED.meta
           RETURNING id`,
          [
            `ffspb-${tenantSlug}-${extId}`, tenantSlug, teamId, String(extId),
            m.host?.name ?? m.host?.shortName ?? null,
            m.guest?.name ?? m.guest?.shortName ?? null,
            m.publicDate ?? null, season, tournament,
            hasScore ? Number(m.resultHost) : null,
            hasScore ? Number(m.resultGuest) : null,
            JSON.stringify({ lengthMin }),
          ],
        );
        const matchId = ins.rows[0]?.id;
        if (!matchId) continue;
        matchCount++;

        const minutes = computeMinutes(pp, det.length);
        // Только участия НАШЕЙ команды (по team IRI) и только наши игроки (FK).
        for (const p of pp) {
          if (idTail(p.team) !== ourTid) continue;
          const pid = idTail(p.request);
          if (pid == null) continue;
          const playerDbId = `ext-ffspb-${pid}`;
          if (!ourPlayerIds.has(playerDbId)) continue; // нет в ростере — пропуск (FK)
          const mins = minutes.get(pid) ?? 0;
          const num = p.number != null ? Number(p.number) : null;
          await conn.query(
            `INSERT INTO match_players (match_id, player_id, tenant_id, number, minutes)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (match_id, player_id) DO UPDATE SET
               minutes = EXCLUDED.minutes,
               number  = COALESCE(EXCLUDED.number, match_players.number)`,
            [matchId, playerDbId, tenantSlug, Number.isFinite(num) ? num : null, mins],
          );
          playerRows++;
        }
      }
    });

    logger.info({ tenantSlug, ageGroup, tournament, matchCount, playerRows }, '[participation] synced');
    return { ok: true, matches: matchCount, playerRows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ tenantSlug, ageGroup, tournament, err: msg }, '[participation] sync failed');
    return { ok: false, error: msg };
  }
}
