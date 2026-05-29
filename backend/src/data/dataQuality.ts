/**
 * Индикатор достоверности данных матча (Phase 1).
 *
 * Считает покрытие: какие секции распознаны, сколько игроков с рейтингами/
 * минутами/детальными stats, какие источники (PDF / Excel). Фронт показывает
 * это бейджем «Достоверность 82%» с детализацией — аналитик сразу видит, чему
 * можно доверять, а где данных нет (вместо молчаливых нулей).
 */
type AnyObj = Record<string, unknown>;

export interface DataQuality {
  score: number; // 0..100
  level: 'high' | 'medium' | 'low';
  sources: { pdf: boolean; excel: boolean };
  sections: {
    teamSummary: boolean;
    teamAggregates: boolean;
    teamRatings: boolean;
    formation: boolean;
    maps: number;
    events: number;
    splits: boolean;
  };
  players: { total: number; withRatings: number; withMinutes: number; withDetailedStats: number };
  warnings: string[];
}

function nonEmptyObj(v: unknown): boolean {
  return !!v && typeof v === 'object' && Object.keys(v as AnyObj).length > 0;
}

export function computeDataQuality(match: AnyObj, mp: AnyObj[]): DataQuality {
  const meta = (match.meta as AnyObj) ?? {};
  const tar = (match.teamAvgRatings as AnyObj) ?? {};
  const teamRatings = ['overall', 'attack', 'defence', 'fitness'].some(
    (k) => tar[k] != null && Number(tar[k]) > 0,
  );
  const teamMaps = (meta.teamMaps as AnyObj) ?? {};
  const events = (meta.events as unknown[]) ?? [];

  let withRatings = 0;
  let withMinutes = 0;
  let withDetailed = 0;
  let withSplits = 0;
  for (const p of mp) {
    const r = (p.ratings as AnyObj) ?? {};
    if (Number(r.overall ?? 0) > 0) withRatings++;
    if (Number(p.minutes ?? 0) > 0) withMinutes++;
    const stats = (p.stats as AnyObj) ?? {};
    if (nonEmptyObj(stats.attack) || nonEmptyObj(stats.defence)) withDetailed++;
    if (nonEmptyObj(p.splits)) withSplits++;
  }
  const total = mp.length;

  const sections = {
    teamSummary: nonEmptyObj(match.teamSummaryStats),
    teamAggregates: nonEmptyObj(match.teamAggregates),
    teamRatings,
    formation: !!meta.formation || !!meta.formationImage,
    maps: Object.keys(teamMaps).length,
    events: events.length,
    splits: withSplits > 0,
  };

  const sources = {
    pdf: true,
    excel: !!(meta.xlsxFile || meta.excelMeta || meta.excelColumnsCount),
  };

  // Скоринг: игроки 50% (рейтинги+минуты+детальные), команда 35%, доп 15%.
  const playerScore = total
    ? ((withRatings + withMinutes + withDetailed) / (total * 3)) * 50
    : 0;
  const teamScore =
    (sections.teamRatings ? 15 : 0) +
    (sections.teamAggregates ? 12 : 0) +
    (sections.teamSummary ? 8 : 0);
  const extraScore =
    (sections.formation ? 5 : 0) +
    (sections.maps > 0 ? 5 : 0) +
    (sections.events > 0 ? 3 : 0) +
    (sections.splits ? 2 : 0);
  const score = Math.round(Math.min(100, playerScore + teamScore + extraScore));

  const warnings: string[] = [];
  if (total === 0) warnings.push('Игроки не распознаны');
  if (!sections.teamRatings) warnings.push('Командные рейтинги отсутствуют');
  if (total > 0 && withDetailed < total) warnings.push(`Детальные действия у ${withDetailed}/${total} игроков`);
  if (!sections.splits) warnings.push('Нет разбивки по таймам');
  if (sections.maps === 0) warnings.push('Карты не распознаны');
  if (!sources.excel) warnings.push('Excel не загружен — часть передач/дуэлей может отсутствовать');

  const level: DataQuality['level'] = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';

  return { score, level, sources, sections, players: { total, withRatings, withMinutes, withDetailedStats: withDetailed }, warnings };
}
