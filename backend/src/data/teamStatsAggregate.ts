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
 * Границы кругов — по дате матча: 1 круг = матчи ДО 25 июля, 2 круг = 25 июля и
 * позже (правило проекта). Сезон называется по году окончания (2026).
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
  teamAggregates: AnyObj | null;
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
  /** Усреднённые средние рейтинги (индекс эффективности) по команде. */
  teamAvgRatings: AnyObj | null;
  /** Усреднённые командные агрегаты (для блока «Идентичность команды»). */
  teamAggregates: AnyObj | null;
}

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
/**
 * Круг матча по дате (правило проекта): 1 круг = ДО 25 июля, 2 круг = с 25 июля.
 * Сравниваем по (месяц, день) — сезон укладывается в один календарный год.
 * null — нет даты (попадёт только в «сезон»).
 */
function matchRound(date: unknown): 1 | 2 | null {
  if (!date) return null;
  const d = new Date(date as string);
  if (Number.isNaN(d.getTime())) return null;
  const monthDay = (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); // июль=7 → 0725
  return monthDay < 725 ? 1 : 2;
}

export function aggregateTeamStats(
  matches: MatchStatsRow[],
  _calendar: CalendarRoundRow[],
  team: TeamRef,
  period: AggregatePeriod,
): AggregateResult {
  const inPeriod = (m: MatchStatsRow): boolean => {
    if (period === 'season') return true;
    const r = matchRound(m.date);
    if (r == null) return false; // нет даты — только в «сезон»
    return period === 'round1' ? r === 1 : r === 2;
  };

  const ourLower = normName(team.name);
  const selected = matches.filter(inPeriod);

  const sides = selected
    .map((m) => pickOurSide(m, ourLower))
    .filter((s): s is AnyObj => isPlainObj(s));
  const ratings = selected
    .map((m) => m.teamAvgRatings)
    .filter((r): r is AnyObj => isPlainObj(r));
  const aggregates = selected
    .map((m) => m.teamAggregates)
    .filter((a): a is AnyObj => isPlainObj(a));

  return {
    period,
    matchCount: selected.length,
    our: sides.length > 0 ? deepAverage(sides) : null,
    teamAvgRatings: ratings.length > 0 ? deepAverage(ratings) : null,
    teamAggregates: aggregates.length > 0 ? deepAverage(aggregates) : null,
  };
}
