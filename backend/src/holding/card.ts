/**
 * Карточка кандидата для решения — одна страница на игрока для тренерского совета:
 * вывод словами («готов в молодёжку: топ-6% региона, стабилен 7 матчей, сильнее амплуа
 * лиги по …»), на чём он основан, сильные и слабые стороны по 36 показателям против
 * амплуа в лиге, ряд последних матчей и решения руководства по игроку.
 *
 * Тексты собираются здесь, а не на фронте: правило одно на кабинет и печать.
 */
import type { HoldingAnalytics, LeaguePlayer } from '../federation/holdingAnalytics.js';
import type { PlayerMetricsVsLeague, PlayerMetricRow } from '../federation/holdingMetrics.js';
import type { RegionPlayer } from '../federation/avandataSource.js';

export type VerdictTone = 'up' | 'watch' | 'neutral' | 'down';
export interface CardFact { text: string; tone?: 'good' | 'bad' }
export interface CardMetric { id: string; title: string; perMatch: number; lineAvgDiv: number | null; pctileDiv: number; negative: boolean }
export interface CandidateCard {
  verdict: { headline: string; tone: VerdictTone; summary: string };
  facts: CardFact[];
  strengths: CardMetric[];
  weaknesses: CardMetric[];
  stability: { streak: number; aboveLine: number; rated: number; cv: number | null } | null;
  series: Array<{ tour: number; rating: number; aboveLine: boolean | null }>;
  decisions: string[];
}

const STRENGTH_PCT = 75, WEAK_PCT = 25;
const STABLE_STREAK = 3;
const n0 = (x: number) => Math.round(x).toLocaleString('ru-RU');
const matchesW = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };
const quote = (xs: string[]) => xs.map((x) => `«${x}»`).join(xs.length === 2 ? ' и ' : ', ');

/** Значимые для сравнения строки: событие за матч встречается хоть у кого-то, перцентиль посчитан. */
function scored(rows: PlayerMetricRow[]): CardMetric[] {
  return rows.filter((r) => r.pctileDiv != null && (r.perMatch > 0 || (r.lineAvgDiv ?? 0) > 0.05))
    .map((r) => ({ id: r.id, title: r.title, perMatch: r.perMatch, lineAvgDiv: r.lineAvgDiv, pctileDiv: r.pctileDiv as number, negative: r.points < 0 }));
}

export function buildCard(p: LeaguePlayer, a: HoldingAnalytics, raw: RegionPlayer | null, metrics: PlayerMetricsVsLeague | null): CandidateCard {
  const youthReady = a.youth.ready.some((x) => x.id === p.id);
  const youthWatch = a.youth.watch.some((x) => x.id === p.id);
  const promote = a.promote.some((x) => x.id === p.id);
  const older = a.olderAge.find((x) => x.id === p.id);
  const losing = a.losing.find((x) => x.id === p.id);
  const risk = a.risk.some((x) => x.id === p.id);
  const youthIdx = [...a.youth.ready, ...a.youth.watch, ...a.youth.rest].findIndex((x) => x.id === p.id);

  // Ряд матчей и стабильность: «выше среднего по амплуа в лиге» — матч за матчем.
  const series = (raw?.series ?? []).map((s) => ({ tour: s.tour, rating: Math.round(s.rating), aboveLine: p.lineAvgDiv != null ? s.rating >= p.lineAvgDiv : null }));
  let streak = 0;
  for (let i = series.length - 1; i >= 0 && series[i]!.aboveLine; i--) streak++;
  const aboveLine = series.filter((s) => s.aboveLine).length;
  const rs = series.map((s) => s.rating);
  const mean = rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : 0;
  const cv = rs.length >= 3 && mean > 0 ? Math.round((Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length) / mean) * 100) / 100 : null;
  const stability = series.length ? { streak, aboveLine, rated: series.length, cv } : null;

  const sc = metrics ? scored(metrics.rows) : [];
  const strengths = sc.filter((m) => m.pctileDiv >= STRENGTH_PCT).sort((x, y) => y.pctileDiv - x.pctileDiv).slice(0, 5);
  const weaknesses = sc.filter((m) => m.pctileDiv <= WEAK_PCT).sort((x, y) => x.pctileDiv - y.pctileDiv).slice(0, 4);

  // Вывод: самое сильное решение по игроку.
  let headline: string, tone: VerdictTone;
  if (youthReady) { headline = 'Готов в молодёжную команду'; tone = 'up'; }
  else if (promote) { headline = 'Уровень Высшей лиги — кандидат в ФК Динамо'; tone = 'up'; }
  else if (older) { headline = `Готов играть на возраст старше`; tone = 'up'; }
  else if (losing) { headline = losing.reason === 'trend' ? 'Теряем: падение формы' : 'Теряем: выпал из ротации'; tone = 'down'; }
  else if (risk) { headline = 'Зона риска: ниже уровня Первой лиги'; tone = 'down'; }
  else if (youthWatch) { headline = 'Кандидат в молодёжную команду — присмотреться'; tone = 'watch'; }
  else if (p.pctRegion != null && p.pctRegion <= 25) { headline = 'Сильный игрок своего возраста'; tone = 'watch'; }
  else if (p.rating == null) { headline = 'Мало разобранных матчей для вывода'; tone = 'neutral'; }
  else { headline = 'На уровне своего возраста'; tone = 'neutral'; }

  const facts: CardFact[] = [];
  if (p.rankRegion != null) facts.push({ text: `Топ-${p.pctRegion}% региона: ${p.rankRegion}-й из ${p.sizeRegion} игроков ${p.birthYear} г.р. с рейтингом.`, tone: (p.pctRegion ?? 100) <= 25 ? 'good' : (p.pctRegion ?? 0) > 60 ? 'bad' : undefined });
  if (p.rankDiv != null) facts.push({ text: `${p.rankDiv}-й из ${p.sizeDiv} в своём дивизионе (${p.division}).` });
  if (p.deltaLine != null && p.lineAvgDiv != null) {
    const rel = Math.round((p.deltaLine / p.lineAvgDiv) * 100);
    facts.push({ text: `${rel >= 0 ? 'Выше' : 'Ниже'} среднего по амплуа в лиге на ${n0(Math.abs(p.deltaLine))} (${rel >= 0 ? '+' : ''}${rel}%): ${n0(p.rating as number)} против ${n0(p.lineAvgDiv)}.`, tone: rel >= 12 ? 'good' : rel <= -12 ? 'bad' : undefined });
  }
  if (stability && p.lineAvgDiv != null) {
    if (streak >= STABLE_STREAK) facts.push({ text: `Стабилен: ${streak} ${matchesW(streak)} подряд выше среднего по амплуа в лиге.`, tone: 'good' });
    else facts.push({ text: `Выше среднего по амплуа в ${aboveLine} из ${stability.rated} разобранных ${matchesW(stability.rated)}.`, tone: aboveLine / stability.rated >= 0.6 ? 'good' : aboveLine / stability.rated < 0.4 ? 'bad' : undefined });
  }
  if (p.trend != null && p.rating) {
    const rel = p.trend / p.rating;
    if (rel >= 0.08) facts.push({ text: `Форма растёт: последние матчи в среднем на ${n0(p.trend)} выше сезона.`, tone: 'good' });
    else if (rel <= -0.08) facts.push({ text: `Форма падает: последние матчи в среднем на ${n0(-p.trend)} ниже сезона.`, tone: 'bad' });
    else facts.push({ text: 'Форма ровная: последние матчи на уровне сезона.' });
  }
  if (!p.inRotation) facts.push({ text: 'Не попадал в оценённые составы последние туры — уточнить у тренера причину.', tone: 'bad' });
  if (older) facts.push({ text: `В «${older.olderTeamName}» был бы ${older.olderRank}-м из ${older.olderSize} по рейтингу (медиана команды ${n0(older.olderMedian)}).`, tone: 'good' });
  const med = a.medians.find((m) => m.year === p.birthYear);
  if (promote && med?.top != null) facts.push({ text: `Рейтинг ${n0(p.rating as number)} не ниже медианы Высшей лиги своего возраста (${n0(med.top)}).`, tone: 'good' });
  if (risk && med?.first != null) facts.push({ text: `Рейтинг ${n0(p.rating as number)} ниже медианы Первой лиги своего возраста (${n0(med.first)}).`, tone: 'bad' });
  if (youthIdx >= 0 && youthIdx < a.youthSlots) facts.push({ text: `${youthIdx + 1}-й в очереди в молодёжную команду (мест ${a.youthSlots}).`, tone: 'good' });

  // Сводка одной фразой — как её прочитают на совете.
  const parts: string[] = [];
  if (p.pctRegion != null) parts.push(`топ-${p.pctRegion}% региона`);
  if (streak >= STABLE_STREAK) parts.push(`стабилен ${streak} ${matchesW(streak)}`);
  else if (p.trend != null && p.rating && p.trend / p.rating >= 0.08) parts.push('форма растёт');
  else if (p.trend != null && p.rating && p.trend / p.rating <= -0.08) parts.push('форма падает');
  if (strengths.length) parts.push(`сильнее амплуа лиги по ${quote(strengths.slice(0, 2).map((s) => s.title))}`);
  if (weaknesses.length && tone !== 'up') parts.push(`слабее по ${quote(weaknesses.slice(0, 1).map((s) => s.title))}`);
  const summary = `${headline}${parts.length ? ': ' + parts.join(', ') : ''}.`;

  const decisions: string[] = [];
  if (youthReady) decisions.push('в молодёжную команду');
  else if (youthWatch) decisions.push('кандидат в молодёжную команду');
  if (promote) decisions.push('из Царского Села в ФК Динамо');
  if (older) decisions.push(`на возраст старше (${older.olderTeamName})`);
  if (losing) decisions.push(losing.reason === 'trend' ? 'падение формы' : 'выпал из ротации');
  if (risk) decisions.push('зона риска');

  return { verdict: { headline, tone, summary }, facts, strengths, weaknesses, stability, series: series.slice(-12), decisions };
}
