import { regionStandings, regionClubRatings, availableYears } from './avandataSource.js';
import { latestSnapshotsForCohort, snapshotMeta, type SnapPayload } from './snapshots.js';

/**
 * «За неделю» — передняя дверь недельного радара (Фаза C).
 *
 * Две части:
 *  - attention: что требует внимания ПРЯМО СЕЙЧАС (история не нужна, работает с 1-го дня):
 *    клубы, что сильно недовыполняют рейтинг (Δ ≤ −2), и когорты на зеркале (degraded).
 *  - movers: что изменилось ЗА НЕДЕЛЮ — diff последних двух снимков (место/рейтинг/появления).
 *    Пусто, пока не накопится 2 снимка; baseline=true означает «база снята, ждём след. срез».
 */

const isTopDiv = (d: string): boolean => /Высшая|Боброва/i.test(d);
const RATING_MOVE = 0.05; // порог значимого изменения рейтинга за неделю (5%)

export interface AttentionItem {
  year: number; kind: 'under' | 'degraded'; team: string | null; teamId: number | null;
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

interface TopRow { id: number; name: string; pos: number; rating: number | null; ratingRank: number | null; delta: number | null; }

/** Текущая Высшая когорты с рейтинг-рангом и Δ (то же, что в единой таблице, но на бэке). */
async function cohortTop(seasonId: number, year: number): Promise<{ degraded: boolean; division: string | null; rows: TopRow[] }> {
  const st = await regionStandings(seasonId, year);
  const cr = await regionClubRatings(seasonId, year).catch(() => []);
  const sg = st.groups.find((g) => isTopDiv(g.division)) ?? null;
  const cg = cr.find((g) => isTopDiv(g.division)) ?? null;
  const ratingById = new Map<number, number>();
  for (const r of cg?.rows ?? []) ratingById.set(r.id, r.rating);
  const standRows = sg?.rows ?? [];
  const ratingRank = new Map<number, number>();
  [...standRows].sort((a, b) => (ratingById.get(b.id) ?? -Infinity) - (ratingById.get(a.id) ?? -Infinity))
    .forEach((r, i) => { if (ratingById.has(r.id)) ratingRank.set(r.id, i + 1); });
  const rows: TopRow[] = standRows.map((r, i) => {
    const rr = ratingRank.get(r.id) ?? null;
    return { id: r.id, name: r.name, pos: i + 1, rating: ratingById.get(r.id) ?? null, ratingRank: rr, delta: rr != null ? rr - (i + 1) : null };
  });
  return { degraded: st.degraded, division: sg?.division ?? null, rows };
}

export async function federationWeekly(seasonId: number): Promise<WeeklyDigest> {
  const years = await availableYears(seasonId);
  const attention: AttentionItem[] = [];
  const movers: MoverItem[] = [];
  let cohortsWithHistory = 0;
  for (const year of years) {
    // --- attention: текущее состояние ---
    const top = await cohortTop(seasonId, year);
    if (top.degraded) {
      attention.push({ year, kind: 'degraded', team: null, teamId: null, division: top.division, pos: null, ratingRank: null, delta: null, note: 'данные когорты — зеркало, могут быть неполными' });
    }
    for (const r of top.rows) {
      if (r.delta != null && r.delta <= -2) {
        attention.push({ year, kind: 'under', team: r.name, teamId: r.id, division: top.division, pos: r.pos, ratingRank: r.ratingRank, delta: r.delta,
          note: `${r.pos}-е место при ${r.ratingRank}-м по рейтингу — недовыполняет на ${Math.abs(r.delta)}` });
      }
    }
    // --- movers: diff последних двух снимков ---
    const snaps = await latestSnapshotsForCohort(seasonId, year, 2);
    if (snaps.length >= 2) {
      cohortsWithHistory++;
      const cur = snaps[0]!.payload as SnapPayload;
      const prev = snaps[1]!.payload as SnapPayload;
      const prevById = new Map(prev.teams.filter((t) => isTopDiv(t.division)).map((t) => [t.id, t]));
      const curTop = cur.teams.filter((t) => isTopDiv(t.division));
      const curIds = new Set(curTop.map((t) => t.id));
      for (const t of curTop) {
        const p = prevById.get(t.id);
        if (!p) { movers.push({ year, kind: 'new', team: t.name, from: null, to: t.pos, note: `появилась в таблице (${t.pos}-е место)` }); continue; }
        if (p.pos !== t.pos) movers.push({ year, kind: 'pos', team: t.name, from: p.pos, to: t.pos, note: `${p.pos}→${t.pos} место` });
        if (t.rating != null && p.rating != null && p.rating > 0 && Math.abs(t.rating - p.rating) / p.rating >= RATING_MOVE) {
          movers.push({ year, kind: 'rating', team: t.name, from: p.rating, to: t.rating, note: `рейтинг ${p.rating}→${t.rating}` });
        }
      }
      for (const p of prevById.values()) {
        if (!curIds.has(p.id)) movers.push({ year, kind: 'gone', team: p.name, from: p.pos, to: null, note: 'выбыла из таблицы' });
      }
    }
  }
  attention.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  const meta = await snapshotMeta(seasonId);
  return { baseline: cohortsWithHistory === 0, cohortsWithHistory, snapshots: meta.total, since: meta.latest, attention, movers };
}
