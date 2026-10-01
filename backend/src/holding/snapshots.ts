/**
 * Динамика холдинга по неделям: снимок решений раз в неделю и «что изменилось».
 *
 * Снимок — компактный срез аналитики: кто в каких списках решений, рейтинг и место в
 * регионе каждого игрока, средний класс и линии команд. Снимки пишутся раз в неделю
 * (крон + при заходе, без дублей) и хранятся в holding_snapshots.
 *
 * С первого дня сравнивать есть с чем: рейтинг игрока — среднее по его матчам, поэтому
 * состояние «N туров назад» восстанавливается точно (holdingAnalytics(..., toursBack)).
 * Базой сравнения служит недельный снимок, а пока его нет — реконструкция на тур назад.
 */
import { and, desc, eq, lte } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { holdingSnapshots } from '../db/schema/holding.js';
import { logger } from '../shared/logger.js';
import { cached, TTL, listTournaments } from '../federation/avandataSource.js';
import { getMatches } from '../services/avandataApi.js';
import { holdingAnalytics, type HoldingAnalytics, type LeaguePlayer } from '../federation/holdingAnalytics.js';
import { holdingProfile, type HoldingConfig, type HoldingProfile } from '../federation/holdings.js';

export type ListKey = 'youthReady' | 'youthWatch' | 'promote' | 'olderAge' | 'losing' | 'risk';
export const LIST_TITLE: Record<ListKey, string> = {
  youthReady: 'Готовы в молодёжную команду', youthWatch: 'Молодёжка — присмотреться',
  promote: 'Из Царского Села в ФК Динамо', olderAge: 'На возраст старше',
  losing: 'Кого теряем', risk: 'Зона риска в ФК Динамо',
};
const LIST_ORDER: ListKey[] = ['youthReady', 'youthWatch', 'promote', 'olderAge', 'losing', 'risk'];

export interface SnapPlayer {
  id: number; name: string; teamKey: string; clubLabel: string; birthYear: number; line: LeaguePlayer['line'];
  rating: number | null; mp: number; rankRegion: number | null; sizeRegion: number; pctRegion: number | null;
}
export interface SnapLine { line: string; title: string; teamAvg: number | null; divAvg: number | null; gapRel: number | null; verdict: 'weak' | 'ok' | 'strong' | null }
export interface SnapTeam {
  key: string; clubLabel: string; year: number; division: string;
  avgRating: number | null; divRankByAvg: number | null; divTeams: number;
  place: number | null; placeSize: number | null; lines: SnapLine[];
}
export interface HoldingSnapPayload {
  v: 1; asOf: string; toursBack: number;
  players: SnapPlayer[];
  lists: Record<ListKey, number[]>;
  teams: SnapTeam[];
  /** Сколько кандидатов селекции по «команда:линия». */
  selection: Record<string, number>;
}

export function payloadOf(a: HoldingAnalytics): HoldingSnapPayload {
  const seen = new Set<number>();
  const players: SnapPlayer[] = [];
  for (const t of a.teams) for (const p of t.squad) {
    if (seen.has(p.id)) continue; seen.add(p.id);
    players.push({ id: p.id, name: p.name, teamKey: p.teamKey, clubLabel: p.clubLabel, birthYear: p.birthYear, line: p.line, rating: p.rating, mp: p.mp, rankRegion: p.rankRegion, sizeRegion: p.sizeRegion, pctRegion: p.pctRegion });
  }
  const ids = (xs: Array<{ id: number }>) => [...new Set(xs.map((x) => x.id))];
  const selection: Record<string, number> = {};
  for (const g of a.selection) selection[`${g.teamKey}|${g.line}`] = g.candidates.length;
  return {
    v: 1, asOf: a.asOf, toursBack: a.toursBack, players,
    lists: { youthReady: ids(a.youth.ready), youthWatch: ids(a.youth.watch), promote: ids(a.promote), olderAge: ids(a.olderAge), losing: ids(a.losing), risk: ids(a.risk) },
    teams: a.teams.map((t) => ({
      key: t.key, clubLabel: t.clubLabel, year: t.year, division: t.division,
      avgRating: t.avgRating, divRankByAvg: t.divRankByAvg, divTeams: t.divTeams,
      // Таблица в реконструкции — текущая (истории таблиц нет), поэтому место пишем только в живой снимок.
      place: a.toursBack ? null : t.place, placeSize: a.toursBack ? null : t.placeSize,
      lines: t.lines.map((l) => ({ line: l.line, title: l.title, teamAvg: l.teamAvg, divAvg: l.divAvg, gapRel: l.gapRel, verdict: l.verdict })),
    })),
    selection,
  };
}

// ─── Хранилище ────────────────────────────────────────────────────────────────
const SNAPSHOT_EVERY_DAYS = 6.5;
const inFlight = new Set<string>();

/** Записать недельный снимок, если последнему больше 6,5 дней (или снимков нет). */
export async function captureHoldingSnapshotIfDue(seasonId: number, cfg: HoldingConfig, a?: HoldingAnalytics): Promise<boolean> {
  const key = `${cfg.slug}:${seasonId}`;
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  try {
    const last = await withBypassRLS((tx) => tx.select({ capturedAt: holdingSnapshots.capturedAt }).from(holdingSnapshots)
      .where(and(eq(holdingSnapshots.holdingSlug, cfg.slug), eq(holdingSnapshots.season, seasonId)))
      .orderBy(desc(holdingSnapshots.capturedAt)).limit(1));
    if (last[0] && Date.now() - last[0].capturedAt.getTime() < SNAPSHOT_EVERY_DAYS * 86_400_000) return false;
    const analytics = a ?? await holdingAnalytics(seasonId, cfg, await holdingProfile(seasonId, cfg));
    await withBypassRLS((tx) => tx.insert(holdingSnapshots).values({ holdingSlug: cfg.slug, season: seasonId, payload: payloadOf(analytics) }));
    logger.info({ slug: cfg.slug, seasonId }, '[holding] недельный снимок решений записан');
    return true;
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e), slug: cfg.slug }, '[holding] снимок не записан');
    return false;
  } finally { inFlight.delete(key); }
}

export interface SnapshotRef { id: number; capturedAt: string }
export async function listSnapshots(seasonId: number, slug: string): Promise<SnapshotRef[]> {
  const rows = await withBypassRLS((tx) => tx.select({ id: holdingSnapshots.id, capturedAt: holdingSnapshots.capturedAt }).from(holdingSnapshots)
    .where(and(eq(holdingSnapshots.holdingSlug, slug), eq(holdingSnapshots.season, seasonId)))
    .orderBy(desc(holdingSnapshots.capturedAt)).limit(60));
  return rows.map((r) => ({ id: r.id, capturedAt: r.capturedAt.toISOString() }));
}
async function snapshotById(seasonId: number, slug: string, id: number): Promise<{ payload: HoldingSnapPayload; capturedAt: string } | null> {
  const rows = await withBypassRLS((tx) => tx.select().from(holdingSnapshots)
    .where(and(eq(holdingSnapshots.id, id), eq(holdingSnapshots.holdingSlug, slug), eq(holdingSnapshots.season, seasonId))).limit(1));
  return rows[0] ? { payload: rows[0].payload as HoldingSnapPayload, capturedAt: rows[0].capturedAt.toISOString() } : null;
}
/** Самый свежий снимок не моложе minAgeDays — «неделю назад». */
async function snapshotOlderThan(seasonId: number, slug: string, minAgeDays: number) {
  const before = new Date(Date.now() - minAgeDays * 86_400_000);
  const rows = await withBypassRLS((tx) => tx.select().from(holdingSnapshots)
    .where(and(eq(holdingSnapshots.holdingSlug, slug), eq(holdingSnapshots.season, seasonId), lte(holdingSnapshots.capturedAt, before)))
    .orderBy(desc(holdingSnapshots.capturedAt)).limit(1));
  return rows[0] ? { id: rows[0].id, payload: rows[0].payload as HoldingSnapPayload, capturedAt: rows[0].capturedAt.toISOString() } : null;
}

// ─── Даты туров ───────────────────────────────────────────────────────────────
/**
 * Дата состояния «N туров назад» — по датам матчей AvanData (номера туров ФФСПб с ними
 * не совпадают, а перенесённые матчи путают «последний тур»). Для каждого турнира
 * холдинга берём тур lastPlayedTour − N и самую позднюю дату его матчей.
 */
async function tourDates(seasonId: number, years: number[]): Promise<Array<{ last: number; dates: Map<number, string> }>> {
  return cached(`holding-tour-dates:${seasonId}:${years.join(',')}`, TTL, async () => {
    const refs = (await listTournaments(seasonId)).filter((r) => years.includes(r.ageFrom));
    const out: Array<{ last: number; dates: Map<number, string> }> = [];
    for (const ref of refs) {
      const dates = new Map<number, string>();
      for (let tour = 1; tour <= ref.lastPlayedTour; tour++) {
        try {
          const ms = await cached(`avmatches:${ref.tournamentId}:${ref.divisionId}:${tour}`, TTL, () => getMatches(ref.tournamentId, ref.divisionId, tour));
          const d = ms.map((m) => m.dateTime).filter(Boolean).sort().pop();
          if (d) dates.set(tour, d);
        } catch { /* тур без матчей */ }
      }
      out.push({ last: ref.lastPlayedTour, dates });
    }
    return out;
  });
}
export async function dateToursBack(seasonId: number, profile: HoldingProfile, toursBack: number): Promise<string | null> {
  const per = await tourDates(seasonId, profile.years);
  let best: string | null = null;
  // Срез включает все туры до last − N, а перенесённые туры играются позже — берём самую
  // позднюю дату среди включённых туров (иначе подписи «N туров назад» идут не по порядку).
  for (const t of per) {
    for (const [tour, d] of t.dates) if (tour <= t.last - toursBack && (!best || d > best)) best = d;
  }
  return best;
}

// ─── Что изменилось ───────────────────────────────────────────────────────────
export interface DiffPlayer extends SnapPlayer { ratingBefore: number | null; rankBefore: number | null; pctBefore: number | null; lists: ListKey[] }
export interface ListChange { key: ListKey; title: string; before: number; now: number; entered: DiffPlayer[]; left: DiffPlayer[] }
export interface LineChange { teamKey: string; clubLabel: string; year: number; line: string; title: string; teamAvgBefore: number | null; teamAvgNow: number | null; divAvgNow: number | null; gapBefore: number | null; gapNow: number | null; verdictBefore: SnapLine['verdict']; verdictNow: SnapLine['verdict'] }
export interface TeamChange { key: string; clubLabel: string; year: number; division: string; avgBefore: number | null; avgNow: number | null; divRankBefore: number | null; divRankNow: number | null; divTeams: number; placeBefore: number | null; placeNow: number | null }
export interface HoldingChanges {
  base: { kind: 'snapshot' | 'tours'; id: number | null; toursBack: number | null; date: string | null; label: string };
  asOf: string;
  lists: ListChange[];
  risers: DiffPlayer[]; fallers: DiffPlayer[];
  /** Впервые получили рейтинг (набрали 2 разобранных матча). */
  newRated: DiffPlayer[];
  lines: { sagged: LineChange[]; improved: LineChange[] };
  teams: TeamChange[];
  selection: Array<{ teamKey: string; line: string; before: number; now: number }>;
  snapshots: SnapshotRef[];
  /** Сколько туров можно откатить реконструкцией. */
  maxToursBack: number;
}

const RANK_MOVE_PCT = 3;          // сдвиг на 3+ п.п. в «топ N%» региона — заметный
const LINE_MOVE = 0.05;           // линия сдвинулась к лиге на 5+ п.п.

export function diffPayloads(before: HoldingSnapPayload, now: HoldingSnapPayload): Omit<HoldingChanges, 'base' | 'asOf' | 'snapshots' | 'maxToursBack'> {
  const prevById = new Map(before.players.map((p) => [p.id, p]));
  const nowById = new Map(now.players.map((p) => [p.id, p]));
  const listsOf = (id: number) => LIST_ORDER.filter((k) => now.lists[k]?.includes(id));
  const dp = (id: number): DiffPlayer | null => {
    const n = nowById.get(id), b = prevById.get(id);
    const base = n ?? b; if (!base) return null;
    return { ...base, ...(n ?? {}), ratingBefore: b?.rating ?? null, rankBefore: b?.rankRegion ?? null, pctBefore: b?.pctRegion ?? null, lists: listsOf(id) };
  };
  const lists: ListChange[] = LIST_ORDER.map((key) => {
    const b = new Set(before.lists[key] ?? []), n = new Set(now.lists[key] ?? []);
    const entered = [...n].filter((id) => !b.has(id)).map(dp).filter((x): x is DiffPlayer => !!x);
    const left = [...b].filter((id) => !n.has(id)).map(dp).filter((x): x is DiffPlayer => !!x);
    return { key, title: LIST_TITLE[key], before: b.size, now: n.size, entered, left };
  });
  const moved = now.players.filter((p) => p.pctRegion != null && prevById.get(p.id)?.pctRegion != null).map((p) => dp(p.id)!)
    .map((p) => ({ p, d: (p.pctBefore as number) - (p.pctRegion as number) }));
  const risers = moved.filter((x) => x.d >= RANK_MOVE_PCT).sort((a, b) => b.d - a.d).slice(0, 12).map((x) => x.p);
  const fallers = moved.filter((x) => x.d <= -RANK_MOVE_PCT).sort((a, b) => a.d - b.d).slice(0, 12).map((x) => x.p);
  const newRated = now.players.filter((p) => p.rating != null && prevById.get(p.id)?.rating == null).map((p) => dp(p.id)!)
    .sort((a, b) => (b.rating as number) - (a.rating as number)).slice(0, 12);

  const sagged: LineChange[] = [], improved: LineChange[] = [];
  const teams: TeamChange[] = [];
  const prevTeams = new Map(before.teams.map((t) => [t.key, t]));
  for (const t of now.teams) {
    const pt = prevTeams.get(t.key);
    teams.push({ key: t.key, clubLabel: t.clubLabel, year: t.year, division: t.division, avgBefore: pt?.avgRating ?? null, avgNow: t.avgRating, divRankBefore: pt?.divRankByAvg ?? null, divRankNow: t.divRankByAvg, divTeams: t.divTeams, placeBefore: pt?.place ?? null, placeNow: t.place });
    for (const l of t.lines) {
      const pl = pt?.lines.find((x) => x.line === l.line);
      if (!pl || l.gapRel == null || pl.gapRel == null) continue;
      const d = l.gapRel - pl.gapRel;
      const c: LineChange = { teamKey: t.key, clubLabel: t.clubLabel, year: t.year, line: l.line, title: l.title, teamAvgBefore: pl.teamAvg, teamAvgNow: l.teamAvg, divAvgNow: l.divAvg, gapBefore: pl.gapRel, gapNow: l.gapRel, verdictBefore: pl.verdict, verdictNow: l.verdict };
      if (d <= -LINE_MOVE || (l.verdict === 'weak' && pl.verdict !== 'weak')) sagged.push(c);
      else if (d >= LINE_MOVE || (l.verdict === 'strong' && pl.verdict !== 'strong')) improved.push(c);
    }
  }
  sagged.sort((a, b) => ((a.gapNow as number) - (a.gapBefore as number)) - ((b.gapNow as number) - (b.gapBefore as number)));
  improved.sort((a, b) => ((b.gapNow as number) - (b.gapBefore as number)) - ((a.gapNow as number) - (a.gapBefore as number)));
  const selKeys = new Set([...Object.keys(before.selection), ...Object.keys(now.selection)]);
  const selection = [...selKeys].map((k) => { const [teamKey, line] = k.split('|'); return { teamKey: teamKey!, line: line!, before: before.selection[k] ?? 0, now: now.selection[k] ?? 0 }; })
    .filter((s) => s.before !== s.now);
  return { lists, risers, fallers, newRated, lines: { sagged, improved }, teams, selection };
}

/** Сколько туров назад можно восстановить (минимум по турнирам холдинга минус 1). */
function maxToursBackOf(profile: HoldingProfile): number {
  const per = profile.teams.map((t) => Math.max(0, ...t.matches.filter((m) => m.played).map((m) => m.tour)));
  return Math.max(0, Math.min(...per.filter((x) => x > 0), 12) - 1);
}

/**
 * Что изменилось. base: 'week' (по умолчанию: снимок недельной давности, иначе тур назад),
 * 'snap:<id>' — конкретный снимок, 'tours:<N>' — реконструкция N туров назад.
 */
export async function holdingChanges(seasonId: number, cfg: HoldingConfig, profile: HoldingProfile, base = 'week'): Promise<HoldingChanges> {
  const cur = await holdingAnalytics(seasonId, cfg, profile);
  void captureHoldingSnapshotIfDue(seasonId, cfg, cur);
  const now = payloadOf(cur);
  const snapshots = await listSnapshots(seasonId, cfg.slug).catch(() => []);
  const maxToursBack = maxToursBackOf(profile);

  let before: HoldingSnapPayload | null = null;
  let meta: HoldingChanges['base'] | null = null;
  const snapM = /^snap:(\d+)$/.exec(base);
  const toursM = /^tours:(\d+)$/.exec(base);
  if (snapM) {
    const s = await snapshotById(seasonId, cfg.slug, Number(snapM[1]));
    if (s) { before = s.payload; meta = { kind: 'snapshot', id: Number(snapM[1]), toursBack: null, date: s.capturedAt, label: `снимок от ${ruDate(s.capturedAt)}` }; }
  } else if (base === 'week') {
    const s = await snapshotOlderThan(seasonId, cfg.slug, 6).catch(() => null);
    if (s) { before = s.payload; meta = { kind: 'snapshot', id: s.id, toursBack: null, date: s.capturedAt, label: `неделю назад (снимок от ${ruDate(s.capturedAt)})` }; }
  }
  if (!before) {
    const n = Math.min(Math.max(1, toursM ? Number(toursM[1]) : 1), Math.max(1, maxToursBack));
    before = await cached(`holding-snap-tours:${cfg.slug}:${seasonId}:${profile.asOf}:${n}`, TTL, async () => payloadOf(await holdingAnalytics(seasonId, cfg, profile, n)));
    const date = await dateToursBack(seasonId, profile, n);
    meta = { kind: 'tours', id: null, toursBack: n, date, label: `${n === 1 ? 'тур' : `${n} ${n < 5 ? 'тура' : 'туров'}`} назад${date ? ` (на ${ruDate(date)})` : ''}` };
  }
  return { base: meta!, asOf: cur.asOf, ...diffPayloads(before, now), snapshots, maxToursBack };
}

/** Лента по турам: численность списков и средний класс команд после каждого тура (реконструкция). */
export interface TimelinePoint { toursBack: number; date: string | null; counts: Record<ListKey, number>; weakLines: number; teams: Record<string, number | null> }
export async function holdingTimeline(seasonId: number, cfg: HoldingConfig, profile: HoldingProfile): Promise<TimelinePoint[]> {
  return cached(`holding-timeline:${cfg.slug}:${seasonId}:${profile.asOf}`, TTL, async () => {
    const out: TimelinePoint[] = [];
    const max = maxToursBackOf(profile);
    for (let n = max; n >= 0; n--) {
      const a = await holdingAnalytics(seasonId, cfg, profile, n);
      out.push({
        toursBack: n, date: n === 0 ? null : await dateToursBack(seasonId, profile, n),
        counts: { youthReady: a.youth.ready.length, youthWatch: a.youth.watch.length, promote: a.promote.length, olderAge: a.olderAge.length, losing: a.losing.length, risk: a.risk.length },
        weakLines: a.weakLines.length,
        teams: Object.fromEntries(a.teams.map((t) => [t.key, t.avgRating])),
      });
    }
    return out;
  });
}

const ruDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
