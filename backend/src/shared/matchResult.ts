/**
 * Результат матча С НАШЕЙ стороны: победа/ничья/поражение, счёт, соперник.
 *
 * ЕДИНЫЙ ИСТОЧНИК. Ориентируемся по `team_id`, а НЕ по имени команды: имена в
 * загрузках пишутся по-разному («Легирус», «ФК Легирус 2010»), и разбор по
 * имени регулярно переворачивал счёт. Раньше функция жила внутри `data/routes.ts`
 * и была недоступна другим модулям — кабинету Lite она нужна для динамики по
 * матчам, а копия дала бы второй расходящийся счёт.
 */

export interface MatchSideRow {
  team_id?: unknown;
  home_team_id?: unknown;
  away_team_id?: unknown;
  home_team_name?: unknown;
  away_team_name?: unknown;
  score_home?: unknown;
  score_away?: unknown;
}

export interface OurResult {
  /** null — счёта нет или матч не привязан к нашей команде. */
  result: 'W' | 'D' | 'L' | null;
  us: number | null;
  them: number | null;
  opponent: string;
}

export function ourResult(m: MatchSideRow): OurResult {
  const sh = m.score_home as number | null;
  const sa = m.score_away as number | null;
  const ourHome = m.home_team_id === m.team_id;
  const ourAway = m.away_team_id === m.team_id;
  const opponent = String(
    (ourHome ? m.away_team_name : ourAway ? m.home_team_name : m.away_team_name) ?? 'Соперник',
  );
  if (sh == null || sa == null || (!ourHome && !ourAway)) {
    return { result: null, us: null, them: null, opponent };
  }
  const us = ourHome ? sh : sa;
  const them = ourHome ? sa : sh;
  return { result: us > them ? 'W' : us < them ? 'L' : 'D', us, them, opponent };
}
