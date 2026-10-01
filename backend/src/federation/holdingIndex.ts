/**
 * Индекс игрока 2.0 — оценка вклада за полный матч своего возраста против своей специализации.
 *
 * Отличия от простой суммы очков AvanData (внутренняя кухня — в интерфейсе не раскрывается):
 *  1. Позиция. Очки действия умножаются на коэффициент специализации: типовые для позиции
 *     полезные действия весят больше, нетиповые — меньше (гол центрального защитника весит меньше,
 *     перехват — больше); типовые для позиции потери наказываются мягче.
 *  2. Команда. Полезные действия игрока нормируются на объём действий его команды в матче:
 *     игрок команды, которая владеет мячом, не получает преимущества только за счёт команды.
 *  3. Стабильность. Оценка матча ограничена коридором ±25% от среднего игрока за последние
 *     10 матчей (от 3 матчей) — один яркий матч не делает сезон.
 *  4. Малая выборка. Сезонная оценка подтягивается к середине своей специализации тем сильнее,
 *     чем меньше минут (у середины «вес» двух полных матчей); шкалу 5–10 задают игроки от двух
 *     полных матчей, у остальных индекс помечается «мало минут».
 * Шкала прежняя: лучший в пуле (возраст + специализация, весь регион, 45+ минут) = 10.0, слабейший = 5.0.
 */
import type { CohortMetrics } from './holdingMetrics.js';
import type { PositionGroup } from './positionGroups.js';

export interface EventTypeInfo { points: number; attack: boolean }

const COEF_MIN = 0.6, COEF_MAX = 1.5;          // коэффициент специализации
const RARE_RATE = 0.02;                         // событие реже 0.02 за матч у всех — без коэффициента
const TEAM_MIN = 0.75, TEAM_MAX = 1.33;         // поправка на объём действий команды
const CORRIDOR = 0.25, CORRIDOR_LAST = 10, CORRIDOR_MIN_MATCHES = 3;
const CORRIDOR_MATCH_SHARE = 0.25;              // матч в расчёт среднего — от четверти полного времени
export const POOL_MIN_MINUTES = 45;
/** Подтяжка малой выборки: у середины специализации «вес» двух полных матчей. */
const SHRINK_MATCHES = 2;
/** Шкалу 5–10 (кто 10.0, кто 5.0), перцентиль и место задают игроки с минутами от двух полных матчей;
 *  у остальных индекс считается по той же шкале, но помечается «мало минут». */
export const QUALIFY_MATCHES = 2;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (xs: number[]) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

/** Игрок в матче после поправок: оценка всего / атака / оборона (очки за матч, не за 90′). */
export interface MatchRow { mid: number; m: number; adj: number; att: number; def: number }
export interface SeasonValue { value: number | null; minutes: number; rows: MatchRow[]; clipped: Map<number, number>; lowSample: boolean }

export interface IndexModel {
  L: number;
  rowsOf(pid: number): MatchRow[];
  /** Сезон по строкам матчей (склейка регистраций): коридор, затем подтяжка к середине специализации. */
  season(rows: MatchRow[], group: PositionGroup | null): SeasonValue;
  /** Сезонные оценки пула (после подтяжки, игроки от двух полных матчей) — для шкалы 5–10, перцентиля и места. */
  pool: Map<PositionGroup, number[]>;
  /** Оборона за полный матч по пулу — кто сильнее в оборонительной фазе. */
  defencePool: Map<PositionGroup, number[]>;
  /** Оценки отдельных матчей (от половины времени) — шкала индекса матча. */
  matchPool: Map<PositionGroup, { overall: number[]; attack: number[]; defence: number[] }>;
}

export function buildIndexModel(c: CohortMetrics, types: Map<string, EventTypeInfo>): IndexModel {
  const L = c.matchLen;
  const groupOf = (pid: number) => c.groupOfPlayer.get(pid) ?? null;

  // 1. Частоты событий по специализациям (за полный матч) → коэффициенты.
  const cnt = new Map<PositionGroup, Map<string, number>>(), mins = new Map<PositionGroup, number>();
  const all = new Map<string, number>(); let allMins = 0;
  for (const [pid, mm] of c.byMatch) {
    const g = groupOf(pid); if (!g) continue;
    const pm = c.minutes.get(pid);
    let total = 0; for (const [, m] of pm ?? []) total += m;
    if (total < POOL_MIN_MINUTES) continue;
    const gc = cnt.get(g) ?? cnt.set(g, new Map()).get(g)!;
    for (const [mid, x] of mm) {
      const m = pm?.get(mid) ?? 0; if (m <= 0) continue;
      mins.set(g, (mins.get(g) ?? 0) + m); if (g !== 'GK') allMins += m;
      for (const [k, v] of x.counts) { gc.set(k, (gc.get(k) ?? 0) + v); if (g !== 'GK') all.set(k, (all.get(k) ?? 0) + v); }
    }
  }
  const coef = new Map<PositionGroup, Map<string, number>>();
  for (const [g, gc] of cnt) {
    const out = new Map<string, number>();
    if (g !== 'GK') for (const [k, info] of types) {
      if (!info.points || !allMins) continue;
      const rAll = ((all.get(k) ?? 0) / allMins) * L;
      if (rAll < RARE_RATE) continue;
      const rG = ((gc.get(k) ?? 0) / (mins.get(g) || 1)) * L;
      const ratio = rG / rAll;
      out.set(k, info.points > 0 ? clamp(Math.sqrt(ratio), COEF_MIN, COEF_MAX) : clamp(ratio > 0 ? Math.sqrt(1 / ratio) : COEF_MAX, COEF_MIN, COEF_MAX));
    }
    coef.set(g, out);
  }

  // 2. Очки по матчу с коэффициентами; объём полезных действий команды в матче.
  const raw = new Map<number, Array<{ mid: number; m: number; teamKey: string; pos: number; neg: number; attPos: number; attNeg: number; defPos: number; defNeg: number }>>();
  const teamVol = new Map<string, number>();
  for (const [pid, mm] of c.byMatch) {
    const k0 = coef.get(groupOf(pid) as PositionGroup);
    const list: Array<{ mid: number; m: number; teamKey: string; pos: number; neg: number; attPos: number; attNeg: number; defPos: number; defNeg: number }> = [];
    for (const [mid, x] of mm) {
      const m = c.minutes.get(pid)?.get(mid) ?? 0;
      let pos = 0, neg = 0, attPos = 0, attNeg = 0, defPos = 0, defNeg = 0;
      for (const [k, v] of x.counts) {
        const info = types.get(k); if (!info?.points) continue;
        const p = v * info.points * (k0?.get(k) ?? 1);
        if (p > 0) { pos += p; if (info.attack) attPos += p; else defPos += p; }
        else { neg += p; if (info.attack) attNeg += p; else defNeg += p; }
      }
      const teamKey = `${mid}:${x.teamId}`;
      teamVol.set(teamKey, (teamVol.get(teamKey) ?? 0) + pos);
      if (m > 0) list.push({ mid, m, teamKey, pos, neg, attPos, attNeg, defPos, defNeg });
    }
    raw.set(pid, list.sort((a, b) => a.mid - b.mid));
  }
  const volAvg = median([...teamVol.values()].filter((v) => v > 0));
  const teamF = (key: string) => { const v = teamVol.get(key) ?? 0; return v > 0 && volAvg > 0 ? clamp(Math.sqrt(volAvg / v), TEAM_MIN, TEAM_MAX) : 1; };
  const rowsCache = new Map<number, MatchRow[]>();
  const rowsOf = (pid: number): MatchRow[] => {
    const hit = rowsCache.get(pid); if (hit) return hit;
    const rows = (raw.get(pid) ?? []).map((r) => { const f = teamF(r.teamKey); return { mid: r.mid, m: r.m, adj: r.pos * f + r.neg, att: r.attPos * f + r.attNeg, def: r.defPos * f + r.defNeg }; });
    rowsCache.set(pid, rows);
    return rows;
  };

  // 3. Коридор стабильности: оценка матча (за полный матч) — не дальше ±25% от среднего за последние 10.
  const corridor = (rows: MatchRow[]) => {
    const clipped = new Map<number, number>();
    const rates = rows.map((r) => ({ mid: r.mid, m: r.m, rate: (r.adj / r.m) * L }));
    const base = rows.filter((r) => r.m >= L * CORRIDOR_MATCH_SHARE).slice(-CORRIDOR_LAST);
    const mm = base.reduce((s, r) => s + r.m, 0);
    const mu = mm > 0 ? (base.reduce((s, r) => s + r.adj, 0) / mm) * L : 0;
    const on = base.length >= CORRIDOR_MIN_MATCHES && mu > 0;
    for (const r of rates) clipped.set(r.mid, on ? clamp(r.rate, mu * (1 - CORRIDOR), mu * (1 + CORRIDOR)) : r.rate);
    const minutes = rows.reduce((s, r) => s + r.m, 0);
    const value = minutes > 0 ? rates.reduce((s, r) => s + (clipped.get(r.mid) as number) * r.m, 0) / minutes : null;
    return { value, minutes, clipped };
  };

  // 4. Подтяжка к середине специализации при малой выборке.
  const priorPool = new Map<PositionGroup, number[]>();
  const firstPass = new Map<number, ReturnType<typeof corridor>>();
  for (const pid of c.byMatch.keys()) {
    const s = corridor(rowsOf(pid)); firstPass.set(pid, s);
    const g = groupOf(pid);
    if (g && s.value != null && s.minutes >= POOL_MIN_MINUTES) (priorPool.get(g) ?? priorPool.set(g, []).get(g)!).push(s.value);
  }
  const prior = new Map([...priorPool].map(([g, xs]) => [g, median(xs)]));
  const shrink = (v: number | null, minutes: number, g: PositionGroup | null) => (v == null || !g || !prior.has(g) ? v : (v * minutes + (prior.get(g) as number) * L * SHRINK_MATCHES) / (minutes + L * SHRINK_MATCHES));

  const pool = new Map<PositionGroup, number[]>(), defencePool = new Map<PositionGroup, number[]>();
  const matchPool = new Map<PositionGroup, { overall: number[]; attack: number[]; defence: number[] }>();
  for (const [pid, s] of firstPass) {
    const g = groupOf(pid); if (!g || s.value == null || s.minutes < L * QUALIFY_MATCHES) continue;
    (pool.get(g) ?? pool.set(g, []).get(g)!).push(shrink(s.value, s.minutes, g) as number);
    const rows = rowsOf(pid);
    (defencePool.get(g) ?? defencePool.set(g, []).get(g)!).push((rows.reduce((x, r) => x + r.def, 0) / s.minutes) * L);
    const mp = matchPool.get(g) ?? matchPool.set(g, { overall: [], attack: [], defence: [] }).get(g)!;
    for (const r of rows) if (r.m >= L * 0.5) { mp.overall.push((r.adj / r.m) * L); mp.attack.push((r.att / r.m) * L); mp.defence.push((r.def / r.m) * L); }
  }

  return {
    L, rowsOf, pool, defencePool, matchPool,
    season(rows, group) {
      const s = corridor(rows);
      return { value: shrink(s.value, s.minutes, group), minutes: s.minutes, rows, clipped: s.clipped, lowSample: s.minutes < L * QUALIFY_MATCHES };
    },
  };
}
