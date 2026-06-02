/**
 * Агрегация командных показателей за период (правка Зенита #7).
 *
 * Блок «Командные показатели» на главной клуба умеет показывать не только
 * последний матч, но и усреднённые показатели за 1 круг / 2 круг / сезон.
 *
 * Усреднение: для каждого числового поля «нашей стороны» teamSummaryStats берём
 * среднее по матчам периода (среднее ЗА МАТЧ — так показатели сопоставимы между
 * периодами с разным числом игр). Соперник в агрегате не показывается.
 *
 * Границы кругов — по турам календаря: 1 круг = туры ≤ середины сезона,
 * 2 круг = туры > середины. Матч маппится на тур по дню матча.
 */

type AnyObj = Record<string, unknown>;

export type AggregatePeriod = 'round1' | 'round2' | 'season';

export interface MatchStatsRow {
  id: string;
  teamId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  home: string | null;
  away: string | null;
  date: string | Date | null;
  teamSummaryStats: { home?: AnyObj; away?: AnyObj } | null;
  teamAvgRatings: AnyObj | null;
}

export interface CalendarRoundRow {
  date: string | Date | null;
  round: number | null;
}

export interface TeamRef {
  id: string;
  name: string | null;
}

export interface AggregateResult {
  period: AggregatePeriod;
  matchCount: number;
  /** Усреднённые показатели нашей стороны (форма как teamSummaryStats.home/away). */
  our: AnyObj | null;
  /** Усреднённые средние Performance Index по команде. */
  teamAvgRatings: AnyObj | null;
  /** Граница кругов (макс. тур / середина) — для подписи на фронте. */
  maxRound: number;
  midpoint: number;
}

const dayKey = (d: unknown): string => {
  if (!d) return '';
  try {
    return new Date(d as string).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const normName = (s: unknown): string => String(s ?? '').toLowerCase().trim();

/** Наша сторона teamSummaryStats: по ID (надёжно), fallback — по имени. */
function pickOurSide(m: MatchStatsRow, ourLower: string): AnyObj | null {
  const ss = m.teamSummaryStats;
  if (!ss) return null;
  if (m.homeTeamId && m.homeTeamId === m.teamId) return ss.home ?? null;
  if (m.awayTeamId && m.awayTeamId === m.teamId) return ss.away ?? null;
  // Legacy-строки без backfill orientation → ориентируемся по имени.
  const home = normName(m.home);
  const isHome = !!ourLower && (home === ourLower || home.includes(ourLower) || ourLower.includes(home));
  return isHome ? (ss.home ?? null) : (ss.away ?? null);
}

const isPlainObj = (v: unknown): v is AnyObj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Глубокое усреднение: union ключей по всем объектам; вложенные объекты — рекурсивно,
 * числа — среднее по присутствующим значениям, нечисловые скаляры игнорируем.
 */
function deepAverage(objs: AnyObj[]): AnyObj {
  const out: AnyObj = {};
  const keys = new Set<string>();
  for (const o of objs) for (const k of Object.keys(o)) keys.add(k);

  for (const k of keys) {
    const vals = objs.map((o) => o?.[k]).filter((v) => v != null);
    if (vals.length === 0) continue;

    if (vals.every(isPlainObj)) {
      out[k] = deepAverage(vals as AnyObj[]);
      continue;
    }
    const nums = vals.map(Number).filter(Number.isFinite);
    if (nums.length > 0) {
      out[k] = round2(nums.reduce((a, b) => a + b, 0) / nums.length);
    }
  }
  return out;
}

/**
 * Считает агрегат показателей за период.
 *
 * @param matches  Наши разобранные матчи (team_summary_stats не null), любой порядок.
 * @param calendar Туры календаря для нашей возрастной группы (date + round).
 * @param team     Наша команда (id + name) — для выбора стороны.
 * @param period   round1 | round2 | season.
 */
export function aggregateTeamStats(
  matches: MatchStatsRow[],
  calendar: CalendarRoundRow[],
  team: TeamRef,
  period: AggregatePeriod,
): AggregateResult {
  // День матча → номер тура (по календарю).
  const dayToRound = new Map<string, number>();
  let maxRound = 0;
  for (const c of calendar) {
    if (c.round == null) continue;
    // calendar.round хранится как текстовый ярлык («Тур 9», «Тур 12 · ДЕРБИ»),
    // а не число — Number() даёт NaN и round1/round2 оставались пустыми.
    // Достаём номер тура из строки.
    const matchNum = String(c.round).match(/\d+/);
    if (!matchNum) continue;
    const r = Number(matchNum[0]);
    if (!Number.isFinite(r)) continue;
    maxRound = Math.max(maxRound, r);
    const day = dayKey(c.date);
    if (day) dayToRound.set(day, r);
  }
  const midpoint = Math.ceil(maxRound / 2);

  const inPeriod = (m: MatchStatsRow): boolean => {
    if (period === 'season') return true;
    const r = dayToRound.get(dayKey(m.date));
    if (r == null) return false; // матч не сматчился с туром — только в «сезон»
    return period === 'round1' ? r <= midpoint : r > midpoint;
  };

  const ourLower = normName(team.name);
  const selected = matches.filter(inPeriod);

  const sides = selected
    .map((m) => pickOurSide(m, ourLower))
    .filter((s): s is AnyObj => isPlainObj(s));
  const ratings = selected
    .map((m) => m.teamAvgRatings)
    .filter((r): r is AnyObj => isPlainObj(r));

  return {
    period,
    matchCount: selected.length,
    our: sides.length > 0 ? deepAverage(sides) : null,
    teamAvgRatings: ratings.length > 0 ? deepAverage(ratings) : null,
    maxRound,
    midpoint,
  };
}
