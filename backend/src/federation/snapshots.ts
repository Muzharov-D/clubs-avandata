import { and, eq, desc, sql } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { federationSnapshots, type FederationSnapshot } from '../db/schema/federationSnapshots.js';
import { logger } from '../shared/logger.js';
import { regionStandings, regionClubRatings, availableYears } from './avandataSource.js';

/**
 * Недельные снимки состояния когорт — Фаза B «недельного радара».
 * Снимок = компактный срез когорты (таблица всех дивизионов + рейтинг по клубу). Diff
 * последних двух снимков даёт «За неделю» (Фаза C). Запись/чтение — через withBypassRLS
 * (таблица RLS bypass-only). Когорты обходим ПОСЛЕДОВАТЕЛЬНО — параллель бёрстит прокси.
 */

export interface SnapTeam { id: number; name: string; division: string; pos: number; points: number | null; goalDiff: number | null; rating: number | null; }
export interface SnapPayload { source: string | null; degraded: boolean; teams: SnapTeam[]; }

async function buildCohortPayload(seasonId: number, year: number): Promise<SnapPayload> {
  const st = await regionStandings(seasonId, year);
  const cr = await regionClubRatings(seasonId, year).catch(() => []);
  const ratingById = new Map<number, number>();
  for (const g of cr) for (const r of g.rows) ratingById.set(r.id, r.rating);
  const teams: SnapTeam[] = [];
  for (const g of st.groups) {
    g.rows.forEach((r, i) => teams.push({
      id: r.id, name: r.name, division: g.division, pos: i + 1,
      points: r.points, goalDiff: r.goalDiff, rating: ratingById.get(r.id) ?? null,
    }));
  }
  return { source: st.source, degraded: st.degraded, teams };
}

/** Снять и записать снимок по всем когортам. Возвращает число записанных когорт. */
export async function captureFederationSnapshot(seasonId: number): Promise<number> {
  const years = await availableYears(seasonId);
  let written = 0;
  for (const year of years) {
    try {
      const payload = await buildCohortPayload(seasonId, year);
      if (!payload.teams.length) continue;                 // нечего снимать
      await withBypassRLS((tx) => tx.insert(federationSnapshots).values({ season: seasonId, birthYear: year, payload }));
      written++;
    } catch (e) { logger.warn({ err: e instanceof Error ? e.message : String(e), year }, 'snapshot когорты не записан'); }
  }
  logger.info({ seasonId, written }, 'federation snapshot записан');
  return written;
}

export interface SnapshotMeta { cohorts: { year: number; count: number; latest: string | null }[]; total: number; latest: string | null; }

/** Метаданные снимков: по каждой когорте — сколько снимков и когда последний. */
export async function snapshotMeta(seasonId: number): Promise<SnapshotMeta> {
  return withBypassRLS(async (tx) => {
    const rows = await tx.select({
      year: federationSnapshots.birthYear,
      count: sql<number>`count(*)::int`,
      latest: sql<string | null>`max(${federationSnapshots.capturedAt})`,
    }).from(federationSnapshots).where(eq(federationSnapshots.season, seasonId)).groupBy(federationSnapshots.birthYear);
    const cohorts = rows.map((r) => ({ year: Number(r.year), count: Number(r.count), latest: r.latest }))
      .sort((a, b) => b.year - a.year);
    const latest = cohorts.reduce<string | null>((m, c) => (c.latest && (!m || c.latest > m) ? c.latest : m), null);
    return { cohorts, total: cohorts.reduce((s, c) => s + c.count, 0), latest };
  });
}

/** Последние N снимков когорты (по убыванию времени) — для диффа в Фазе C. */
export async function latestSnapshotsForCohort(seasonId: number, year: number, n: number): Promise<FederationSnapshot[]> {
  return withBypassRLS((tx) => tx.select().from(federationSnapshots)
    .where(and(eq(federationSnapshots.season, seasonId), eq(federationSnapshots.birthYear, year)))
    .orderBy(desc(federationSnapshots.capturedAt)).limit(n));
}

let snapshotInFlight = false; // защита от параллельного двойного снятия (крон × старт × просмотр)
/** Снять снимок, только если свежего нет (старше maxAgeDays или вовсе пусто). Так и крон, и
 *  базовый сид на старте, и триггер-на-просмотр делают ~недельный срез без дублей и при рестартах. */
export async function captureSnapshotIfDue(seasonId: number, maxAgeDays = 6.5): Promise<{ captured: boolean; written: number }> {
  if (snapshotInFlight) return { captured: false, written: 0 };
  const meta = await snapshotMeta(seasonId);
  if (meta.latest && Date.now() - new Date(meta.latest).getTime() < maxAgeDays * 86_400_000) {
    return { captured: false, written: 0 };                // свежий снимок уже есть
  }
  snapshotInFlight = true;
  try { return { captured: true, written: await captureFederationSnapshot(seasonId) }; }
  finally { snapshotInFlight = false; }
}
