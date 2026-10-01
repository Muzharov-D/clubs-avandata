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
 *  5. Соперник. Сила соперника — рейтинг AvanData команды за разобранный матч (сравним между лигами),
 *     четверти команд возраста в регионе. В сам индекс не входит: очки — это действия, и против
 *     сильного соперника у защитника их больше, а не меньше (проверено: поправка по данным выходит
 *     немонотонной). Вместо этого — отдельный стресс-тест «против сильнейших» (сильнейшая четверть
 *     региона, без коридора стабильности, от одного полного матча).
 *  4. Малая выборка. Пока на поле меньше двух полных матчей своего возраста — без оценки («б/о»):
 *     индекс не считается и в шкалу не входит (решение руководства).
 * Шкала прежняя: лучший в пуле (возраст + специализация, весь регион, 45+ минут) = 10.0, слабейший = 5.0.
 */
import type { CohortMetrics } from './holdingMetrics.js';
import type { PositionGroup } from './positionGroups.js';

export interface EventTypeInfo { points: number; attack: boolean }
/** Сила соперника — четверть команд возраста в регионе по рейтингу AvanData за разобранный матч: С1 — сильнейшие. */
export type OppTier = 'С1' | 'С2' | 'С3' | 'С4';
/** Уровни команд возраста по таблицам ФФСПб (ключ — нормализованное название команды). */
const tiersByYear = new Map<number, { stamp: string; map: Map<string, OppTier> }>();
export function setTeamTiers(year: number, map: Map<string, OppTier>): void {
  const stamp = [...map].sort().map(([k, v]) => `${k}=${v}`).join(';');
  if (tiersByYear.get(year)?.stamp !== stamp) tiersByYear.set(year, { stamp, map });
}
export const tiersStamp = (year: number): string => { const t = tiersByYear.get(year); return t ? String(t.stamp.length) + ':' + t.map.size : '0'; };

const COEF_MIN = 0.6, COEF_MAX = 1.5;          // коэффициент специализации
const RARE_RATE = 0.02;                         // событие реже 0.02 за матч у всех — без коэффициента
const TEAM_MIN = 0.75, TEAM_MAX = 1.33;         // поправка на объём действий команды
const CORRIDOR = 0.25, CORRIDOR_LAST = 10, CORRIDOR_MIN_MATCHES = 3;
const CORRIDOR_MATCH_SHARE = 0.25;              // матч в расчёт среднего — от четверти полного времени
export const POOL_MIN_MINUTES = 45;
/** Оценка — от двух полных матчей своего возраста на поле; меньше — «б/о» (без оценки). */
export const QUALIFY_MATCHES = 2;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const median = (xs: number[]) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

/** Игрок в матче после поправок: оценка всего / атака / оборона (очки за матч, не за 90′). */
export interface MatchRow { mid: number; m: number; adj: number; att: number; def: number; opp: OppTier | null }
export interface SeasonValue {
  value: number | null; minutes: number; rows: MatchRow[]; clipped: Map<number, number>; lowSample: boolean;
  /** Только матчи против сильнейшей четверти команд региона: оценка за полный матч (от одного полного матча), минуты, матчи. */
  vsTop: { value: number | null; minutes: number; matches: number };
}

export interface IndexModel {
  L: number;
  rowsOf(pid: number): MatchRow[];
  /** Сезон по строкам матчей (склейка регистраций): коридор; меньше двух полных матчей — без оценки. */
  season(rows: MatchRow[], group: PositionGroup | null): SeasonValue;
  /** Сезонные оценки пула (игроки от двух полных матчей) — для шкалы 5–10, перцентиля и места. */
  pool: Map<PositionGroup, number[]>;
  /** Оборона за полный матч по пулу — кто сильнее в оборонительной фазе. */
  defencePool: Map<PositionGroup, number[]>;
  /** Оценки отдельных матчей (от половины времени) — шкала индекса матча. */
  matchPool: Map<PositionGroup, { overall: number[]; attack: number[]; defence: number[] }>;
}

export function buildIndexModel(c: CohortMetrics, types: Map<string, EventTypeInfo>, normName: (s: string) => string): IndexModel {
  const L = c.matchLen;
  const tiers = tiersByYear.get(c.year)?.map;
  const tierOfTeam = (tid: number): OppTier | null => { const t = c.teams.get(tid); return t && tiers ? tiers.get(normName(t.name)) ?? null : null; };
  // Соперник в матче: другая команда, чьи игроки есть в этом матче.
  const teamsInMatch = new Map<number, Set<number>>();
  for (const mm of c.byMatch.values()) for (const [mid, x] of mm) (teamsInMatch.get(mid) ?? teamsInMatch.set(mid, new Set()).get(mid)!).add(x.teamId);
  const oppOf = (mid: number, own: number): OppTier | null => { for (const t of teamsInMatch.get(mid) ?? []) if (t !== own) return tierOfTeam(t); return null; };
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
  type Raw = { mid: number; m: number; teamKey: string; opp: OppTier | null; pos: number; neg: number; attPos: number; attNeg: number; defPos: number; defNeg: number };
  const raw = new Map<number, Raw[]>();
  const teamVol = new Map<string, number>();
  for (const [pid, mm] of c.byMatch) {
    const k0 = coef.get(groupOf(pid) as PositionGroup);
    const list: Raw[] = [];
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
      if (m > 0) list.push({ mid, m, teamKey, opp: oppOf(mid, x.teamId), pos, neg, attPos, attNeg, defPos, defNeg });
    }
    raw.set(pid, list.sort((a, b) => a.mid - b.mid));
  }
  const volAvg = median([...teamVol.values()].filter((v) => v > 0));
  const teamF = (key: string) => { const v = teamVol.get(key) ?? 0; return v > 0 && volAvg > 0 ? clamp(Math.sqrt(volAvg / v), TEAM_MIN, TEAM_MAX) : 1; };
  const baseRows = (pid: number) => (raw.get(pid) ?? []).map((r) => { const f = teamF(r.teamKey); return { mid: r.mid, m: r.m, opp: r.opp, adj: r.pos * f + r.neg, att: r.attPos * f + r.attNeg, def: r.defPos * f + r.defNeg }; });
  const rowsCache = new Map<number, MatchRow[]>();
  const rowsOf = (pid: number): MatchRow[] => {
    const hit = rowsCache.get(pid); if (hit) return hit;
    const rows = baseRows(pid);
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

  // 4. Пул шкалы — только игроки от двух полных матчей.
  const firstPass = new Map<number, ReturnType<typeof corridor>>();
  for (const pid of c.byMatch.keys()) firstPass.set(pid, corridor(rowsOf(pid)));

  const pool = new Map<PositionGroup, number[]>(), defencePool = new Map<PositionGroup, number[]>();
  const matchPool = new Map<PositionGroup, { overall: number[]; attack: number[]; defence: number[] }>();
  for (const [pid, s] of firstPass) {
    const g = groupOf(pid); if (!g || s.value == null || s.minutes < L * QUALIFY_MATCHES) continue;
    (pool.get(g) ?? pool.set(g, []).get(g)!).push(s.value);
    const rows = rowsOf(pid);
    (defencePool.get(g) ?? defencePool.set(g, []).get(g)!).push((rows.reduce((x, r) => x + r.def, 0) / s.minutes) * L);
    const mp = matchPool.get(g) ?? matchPool.set(g, { overall: [], attack: [], defence: [] }).get(g)!;
    for (const r of rows) if (r.m >= L * 0.5) { mp.overall.push((r.adj / r.m) * L); mp.attack.push((r.att / r.m) * L); mp.defence.push((r.def / r.m) * L); }
  }

  return {
    L, rowsOf, pool, defencePool, matchPool,
    season(rows, group) {
      const s = corridor(rows);
      const lowSample = s.minutes < L * QUALIFY_MATCHES;
      const top = rows.filter((r) => r.opp === 'С1');
      const tm = top.reduce((x, r) => x + r.m, 0);
      // Без коридора: стресс-тест должен показывать провалы против сильнейших, а не сглаживать их.
      const vsTop = { value: tm >= L ? (top.reduce((x, r) => x + r.adj, 0) / tm) * L : null, minutes: Math.round(tm), matches: top.length };
      return { value: lowSample ? null : s.value, minutes: s.minutes, rows, clipped: s.clipped, lowSample, vsTop };
    },
  };
}
