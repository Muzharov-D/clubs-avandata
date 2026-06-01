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

  // Source-aware скоринг: балл считается ТОЛЬКО по «ядру» аналитики — то, что
  // составляет суть отчёта SportVisor и есть в каждом нормальном разборе:
  //   • per-player рейтинги + минуты + детальные действия (attack/defence) — 65%
  //   • командные рейтинги (Performance Index) — 20%
  //   • командные агрегаты (детальная аналитика по секциям) — 15%
  // = 100% для полностью распознанного матча.
  //
  // Карты / события / разбивка по таймам / формация / teamSummary — это
  // best-effort ВИЗУАЛ и производные: они зависят от верстки конкретного формата
  // (напр. в новом RU-формате нет карты «Владение», нет картинки формации). Их
  // отсутствие НЕ топит достоверность — они показываются информативными бейджами
  // (sections.*), но в балл не входят. Иначе честно распознанный матч получал бы
  // «95%» из-за того, что формат объективно не содержит какую-то картинку.
  const PLAYER_WEIGHT = 65;
  const TEAM_RATINGS_WEIGHT = 20;
  const TEAM_AGGREGATES_WEIGHT = 15;

  const playerScore = total
    ? ((withRatings + withMinutes + withDetailed) / (total * 3)) * PLAYER_WEIGHT
    : 0;
  const teamScore =
    (sections.teamRatings ? TEAM_RATINGS_WEIGHT : 0) +
    (sections.teamAggregates ? TEAM_AGGREGATES_WEIGHT : 0);
  const score = Math.round(Math.min(100, playerScore + teamScore));

  // Предупреждения — только про РЕАЛЬНЫЕ пробелы в ядре (что снижает балл).
  // Best-effort визуал в warnings не выносим, чтобы не пугать аналитика «Карты
  // не распознаны», когда формат их попросту не содержит.
  const warnings: string[] = [];
  if (total === 0) warnings.push('Игроки не распознаны');
  if (!sections.teamRatings) warnings.push('Командные рейтинги отсутствуют');
  if (!sections.teamAggregates) warnings.push('Командные агрегаты отсутствуют');
  if (total > 0 && withDetailed < total) warnings.push(`Детальные действия у ${withDetailed}/${total} игроков`);
  if (total > 0 && withRatings < total) warnings.push(`Рейтинги у ${withRatings}/${total} игроков`);

  const level: DataQuality['level'] = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';

  return { score, level, sources, sections, players: { total, withRatings, withMinutes, withDetailedStats: withDetailed }, warnings };
}
