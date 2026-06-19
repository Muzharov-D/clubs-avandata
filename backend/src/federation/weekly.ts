import { latestSnapshotsForCohort, snapshotMeta, type SnapPayload, type SnapTeam } from './snapshots.js';

/**
 * «За неделю» — передняя дверь недельного радара (Фаза C).
 *
 * Считается ЦЕЛИКОМ из снимков (быстро, без живых вызовов ФФСПб/АванДаты) — снимок уже
 * хранит место+рейтинг по клубу. Две части:
 *  - attention: что требует внимания (Δ из последнего снимка): клубы, сильно недовыполняющие
 *    рейтинг (Δ ≤ −2), и когорты на зеркале. Работает с первого же снимка.
 *  - movers: что изменилось ЗА НЕДЕЛЮ — diff последних двух снимков (место/рейтинг/появления).
 *    Пусто, пока не накопится 2 снимка; baseline=true = «база снята, ждём следующий срез».
 */

const isTopDiv = (d: string): boolean => /Высшая|Боброва/i.test(d);
const RATING_MOVE = 0.05;   // порог значимого изменения рейтинга за неделю (5%)
const MONOPOLY_PCT = 50;    // топ-3 клуба держат ≥ N% таланта когорты → сигнал «монополия»
const RAE_SKEW = 1.8;       // перекос Q1/Q4 ≥ N → сигнал «возрастная утечка»

export interface AttentionItem {
  year: number; kind: 'under' | 'degraded' | 'monopoly' | 'rae'; team: string | null; teamId: number | null;
  division: string | null; pos: number | null; ratingRank: number | null; delta: number | null; note: string;
}
export interface MoverItem {
  year: number; kind: 'pos' | 'rating' | 'new' | 'gone'; team: string;
  from: number | null; to: number | null; note: string;
}
export interface WeeklyDigest {
  baseline: boolean; cohortsWithHistory: number; snapshots: number; since: string | null;
  attention: AttentionItem[]; movers: MoverItem[];
}

/** Рейтинг-ранг среди команд верхнего дивизиона (тот же знаменатель, что место). */
function ratingRankMap(top: SnapTeam[]): Map<number, number> {
  const rr = new Map<number, number>();
  [...top].filter((t) => t.rating != null).sort((a, b) => (b.rating as number) - (a.rating as number))
    .forEach((t, i) => rr.set(t.id, i + 1));
  return rr;
}

const flag = (year: number, kind: AttentionItem['kind'], note: string): AttentionItem =>
  ({ year, kind, team: null, teamId: null, division: null, pos: null, ratingRank: null, delta: null, note });

function attentionFromSnapshot(year: number, payload: SnapPayload): AttentionItem[] {
  const out: AttentionItem[] = [];
  if (payload.degraded) out.push(flag(year, 'degraded', 'данные когорты — зеркало, могут быть неполными'));
  // watchlist-сигналы из метрик снимка (пороги): монополия таланта + возрастная утечка (RAE)
  const m = payload.metrics;
  if (m?.monopolyTop3 != null && m.monopolyTop3 >= MONOPOLY_PCT) out.push(flag(year, 'monopoly', `монополия таланта: топ-3 клуба держат ${m.monopolyTop3}% сильнейших`));
  if (m?.rae != null && m.rae >= RAE_SKEW) out.push(flag(year, 'rae', `возрастная утечка: перекос ×${m.rae} (начало/конец года рождения)`));
  const top = payload.teams.filter((t) => isTopDiv(t.division));
  const division = top[0]?.division ?? null;
  const rr = ratingRankMap(top);
  for (const t of top) {
    const rank = rr.get(t.id);
    if (rank == null) continue;
    const delta = rank - t.pos;
    if (delta <= -2) {
      out.push({ year, kind: 'under', team: t.name, teamId: t.id, division, pos: t.pos, ratingRank: rank, delta,
        note: `${t.pos}-е место при ${rank}-м по рейтингу — недовыполняет на ${Math.abs(delta)}` });
    }
  }
  return out;
}

function moversFromSnapshots(year: number, cur: SnapPayload, prev: SnapPayload): MoverItem[] {
  const out: MoverItem[] = [];
  const prevTop = prev.teams.filter((t) => isTopDiv(t.division));
  const curTop = cur.teams.filter((t) => isTopDiv(t.division));
  const prevById = new Map(prevTop.map((t) => [t.id, t]));
  const curIds = new Set(curTop.map((t) => t.id));
  for (const t of curTop) {
    const p = prevById.get(t.id);
    if (!p) { out.push({ year, kind: 'new', team: t.name, from: null, to: t.pos, note: `появилась в таблице (${t.pos}-е место)` }); continue; }
    if (p.pos !== t.pos) out.push({ year, kind: 'pos', team: t.name, from: p.pos, to: t.pos, note: `${p.pos}→${t.pos} место` });
    if (t.rating != null && p.rating != null && p.rating > 0 && Math.abs(t.rating - p.rating) / p.rating >= RATING_MOVE) {
      out.push({ year, kind: 'rating', team: t.name, from: p.rating, to: t.rating, note: `рейтинг ${p.rating}→${t.rating}` });
    }
  }
  for (const p of prevById.values()) {
    if (!curIds.has(p.id)) out.push({ year, kind: 'gone', team: p.name, from: p.pos, to: null, note: 'выбыла из таблицы' });
  }
  return out;
}

export async function federationWeekly(seasonId: number): Promise<WeeklyDigest> {
  const meta = await snapshotMeta(seasonId);
  const attention: AttentionItem[] = [];
  const movers: MoverItem[] = [];
  let cohortsWithHistory = 0;
  for (const c of meta.cohorts) {
    const snaps = await latestSnapshotsForCohort(seasonId, c.year, 2);
    if (!snaps.length) continue;
    attention.push(...attentionFromSnapshot(c.year, snaps[0]!.payload as SnapPayload));
    if (snaps.length >= 2) {
      cohortsWithHistory++;
      movers.push(...moversFromSnapshots(c.year, snaps[0]!.payload as SnapPayload, snaps[1]!.payload as SnapPayload));
    }
  }
  attention.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  return { baseline: cohortsWithHistory === 0, cohortsWithHistory, snapshots: meta.total, since: meta.latest, attention, movers };
}
