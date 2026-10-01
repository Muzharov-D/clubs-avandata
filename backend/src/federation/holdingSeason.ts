/**
 * Сезонный профиль игрока — то же, что профиль Легируса (ДНК, кольцо, сильные стороны,
 * пицца, динамика, форма, абзац-вывод), но против ВСЕХ сверстников региона его позиции,
 * а не внутри своей команды.
 *
 * Честный счёт:
 *  - всё — за полный матч своего возраста (U14 60′, U15–U16 70′, U17–U18 80′);
 *  - минуты на поле — по заменам в разметке (holdingMetrics.computeMinutes);
 *  - в пул сравнения — игроки той же линии с 45+ минутами;
 *  - индекс 0–10 = перцентиль суммы очков за полный матч среди этого пула / 10
 *    (рейтинг AvanData — сумма очков событий; методику в интерфейсе не показываем).
 */
import { cached, TTL } from './avandataSource.js';
import { getEventTypes } from '../services/avandataApi.js';
import { buildIndexModel, QUALIFY_MATCHES, tiersStamp, type IndexModel, type EventTypeInfo } from './holdingIndex.js';
import { normTeam } from './teamName.js';
import { cohortMetrics, type CohortMetrics } from './holdingMetrics.js';
import { OUTFIELD_PROFILE, GK_PROFILE, type ProfileMetric, type MetricGroup } from './metricsGlossary.js';
import type { HoldingXi } from './holdings.js';
import { GROUP_INFO, type PositionGroup } from './positionGroups.js';

type Line = HoldingXi['line'];
/** Сравнение со сверстниками — от двух полных матчей своего возраста; меньше — «б/о» (решение руководства). */
const poolMinutes = (L: number) => L * QUALIFY_MATCHES;
const MIN_RATIO_ATTEMPTS = 5;          // доля считается от 5 попыток
const SERIES_MIN_SHARE = 0.25;         // в динамику — матчи от четверти полного времени
const INDEX_MATCH_MIN_SHARE = 0.5;     // распределение «индекса матча» — по матчам от половины времени

export interface SeasonSlice { key: string; name: string; short: string; description: string; group: MetricGroup; polarity: 1 | -1; value: number | null; ratio: boolean; pct: number | null }
export interface SeasonMatch { matchId: number; minutes: number; overall: number | null; attack: number | null; defence: number | null; date: string | null; opponent: string | null; score: string | null; result: 'W' | 'D' | 'L' | null }
export interface PlayerSeason {
  playerId: number; year: number; line: Line | null; matchLen: number;
  /** Группа позиции и подписи: с кем сравнивается игрок. */
  group: PositionGroup | null; groupTitle: string | null; peersWord: string;
  minutes: number; matches: number; goals: number;
  /** Индекс сезона 0–10 и место в пуле своей позиции. */
  index: number | null; indexPct: number | null; rank: number | null; peers: number;
  /** Минут меньше двух полных матчей: без оценки (б/о). */
  lowSample: boolean;
  /** Против сильнейшей четверти команд региона: индекс (от одного полного матча), минуты, матчи. */
  vsTop: { index: number | null; minutes: number; matches: number };
  archetype: { name: string; tagline: string };
  superline: string | null;
  strengths: Array<{ key: string; name: string; description: string; pct: number }>;
  growth: Array<{ key: string; name: string; description: string; pct: number }>;
  roles: Array<{ name: string; score: number }>;
  slices: SeasonSlice[];
  series: SeasonMatch[];
  text: string;
  inPool: boolean;
}
export interface MatchContext { date: string; opponent: string; score: string; result: 'W' | 'D' | 'L' | null }

interface Agg { pid: number; group: PositionGroup | null; minutes: number; matches: number; counts: Map<string, number>; points: number; defence: number }
interface Table {
  aggs: Map<number, Agg>;
  /** Значения показателя по пулу группы позиций (для перцентиля). */
  pool: Map<string, number[]>;
  /** Индекс 2.0: оценки матчей и сезона с поправками на позицию, команду, стабильность и выборку. */
  model: IndexModel;
}

const metricsOf = (group: PositionGroup | null) => (group === 'GK' ? GK_PROFILE : OUTFIELD_PROFILE);
const sum = (counts: Map<string, number>, ids: string[]) => ids.reduce((s, id) => s + (counts.get(id) ?? 0), 0);

function valueOf(m: ProfileMetric, a: { counts: Map<string, number>; minutes: number }, L: number): number | null {
  if (m.ratio) {
    const n = sum(a.counts, m.ratio.num), d = sum(a.counts, m.ratio.den);
    return n + d >= MIN_RATIO_ATTEMPTS ? Math.round((n / (n + d)) * 1000) / 10 : null;
  }
  if (a.minutes <= 0) return null;
  return Math.round((sum(a.counts, m.events) / a.minutes) * L * 100) / 100;
}

/** Перцентиль с делением ничьих пополам (midrank); для «меньше — лучше» — инвертирован. */
function pctOf(xs: number[], v: number, polarity: 1 | -1 = 1): number | null {
  if (xs.length < 5) return null;
  let below = 0, equal = 0;
  for (const x of xs) { if (x === v) equal++; else if (polarity > 0 ? x < v : x > v) below++; }
  return Math.max(0, Math.min(100, Math.round(((below + equal / 2) / xs.length) * 100)));
}

/**
 * Шкала индекса (утверждена руководством 2026-10-01): лучший в пуле (возраст + группа позиций,
 * весь регион) = 10.0, слабейший = 5.0, остальные — пропорционально оценке между ними.
 * Оценка — сумма очков за полный матч своего возраста.
 */
const scaleIdx = (v: number, lo: number, hi: number): number => {
  if (!(hi > lo)) return 7.5;
  return Math.round((5 + 5 * Math.max(0, Math.min(1, (v - lo) / (hi - lo)))) * 10) / 10;
};
/** Границы пула: для сезона — минимум и максимум; для отдельных матчей — 2-й и 98-й перцентили
 *  (один матч бывает выбросом), значения за границами прижимаются к 5.0 и 10.0. */
const bounds = (xs: number[], robust = false): [number, number] => {
  if (!xs.length) return [0, 0];
  const s = xs.slice().sort((a, b) => a - b);
  if (!robust) return [s[0]!, s[s.length - 1]!];
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!;
  return [q(0.02), q(0.98)];
};

function buildTable(c: CohortMetrics, types: Map<string, EventTypeInfo>): Table {
  const L = c.matchLen;
  const aggs = new Map<number, Agg>();
  for (const [pid, pmMap] of c.byMatch) {
    const line = c.groupOfPlayer.get(pid) ?? null;
    const mins = c.minutes.get(pid) ?? new Map<number, number>();
    const a: Agg = { pid, group: line, minutes: 0, matches: 0, counts: new Map(), points: 0, defence: 0 };
    for (const [mid, pm] of pmMap) {
      const m = mins.get(mid) ?? 0;
      if (m <= 0) continue;
      a.minutes += m; a.matches++; a.points += pm.points; a.defence += pm.defence;
      for (const [k, v] of pm.counts) a.counts.set(k, (a.counts.get(k) ?? 0) + v);
    }
    a.minutes = Math.round(a.minutes);
    aggs.set(pid, a);
  }
  const pool = new Map<string, number[]>();
  for (const a of aggs.values()) {
    if (!a.group || a.minutes < poolMinutes(L)) continue;
    for (const m of metricsOf(a.group)) {
      const v = valueOf(m, a, L);
      if (v == null) continue;
      const k = `${a.group}:${m.key}`;
      (pool.get(k) ?? pool.set(k, []).get(k)!).push(v);
    }
  }
  return { aggs, pool, model: buildIndexModel(c, types, normTeam) };
}

const tableOf = (season: number, c: CohortMetrics): Promise<Table> => cached(`holding-season-table:v2:${season}:${c.year}:${c.asOf}:${tiersStamp(c.year)}`, 6 * 60 * 60 * 1000, async () => {
  const raw = await cached('eventTypes', TTL, getEventTypes) as Array<{ id: string; points?: number | null; eventTypeCategoryId?: string | null }>;
  const types = new Map<string, EventTypeInfo>(raw.map((t) => [t.id, { points: t.points ?? 0, attack: t.eventTypeCategoryId === 'attack' }]));
  return buildTable(c, types);
});

// ─── ДНК: архетип по навыковым областям (как CIES-амплуа в Легирусе) ──────────
type Areas = Record<'finishing' | 'creation' | 'takeon' | 'security' | 'ballwin' | 'defending', number | null>;
const avgN = (...xs: Array<number | null | undefined>) => { const p = xs.filter((x): x is number => x != null); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null; };
// Архетипы — по группе позиций (центральный защитник выбирает из ролей защитника и т. д.).
const ARCHETYPES: Record<Exclude<PositionGroup, 'GK'>, Array<{ area: keyof Areas; name: string; tagline: string }>> = {
  CB: [
    { area: 'creation', name: 'Защитник-распасовщик', tagline: 'начинает атаки первым пасом' },
    { area: 'defending', name: 'Чистильщик', tagline: 'выносит и блокирует без риска' },
    { area: 'ballwin', name: 'Цепкий защитник', tagline: 'отбирает и перехватывает' },
    { area: 'security', name: 'Надёжный защитник', tagline: 'не теряет мяч под давлением' },
    { area: 'takeon', name: 'Выносящий защитник', tagline: 'проводит мяч вперёд из обороны' },
    { area: 'finishing', name: 'Защитник-бомбардир', tagline: 'опасен на стандартах и в штрафной' },
  ],
  FB: [
    { area: 'creation', name: 'Атакующий крайний', tagline: 'подключается и создаёт моменты' },
    { area: 'takeon', name: 'Крайний-дриблёр', tagline: 'проходит фланг с мячом' },
    { area: 'defending', name: 'Надёжный крайний', tagline: 'закрывает свой фланг' },
    { area: 'ballwin', name: 'Цепкий крайний', tagline: 'отбирает мяч на своём фланге' },
    { area: 'security', name: 'Крайний-связующий', tagline: 'держит мяч и не теряет' },
    { area: 'finishing', name: 'Подключающийся крайний', tagline: 'врывается в штрафную и бьёт' },
  ],
  CM: [
    { area: 'ballwin', name: 'Разрушитель', tagline: 'выгрызает мячи в центре' },
    { area: 'defending', name: 'Страхующий полузащитник', tagline: 'закрывает зону перед защитой' },
    { area: 'creation', name: 'Дирижёр', tagline: 'организует атаки команды' },
    { area: 'security', name: 'Связующий', tagline: 'держит мяч и не теряет его' },
    { area: 'finishing', name: 'Подключающийся полузащитник', tagline: 'врывается в штрафную и бьёт' },
    { area: 'takeon', name: 'Полузащитник с мячом', tagline: 'проводит мяч через центр ведением' },
  ],
  W: [
    { area: 'takeon', name: 'Вингер', tagline: 'обыгрывает один в один' },
    { area: 'finishing', name: 'Смещающийся нападающий', tagline: 'смещается в центр и бьёт' },
    { area: 'creation', name: 'Крайний-распасовщик', tagline: 'создаёт моменты партнёрам' },
    { area: 'ballwin', name: 'Прессингующий крайний', tagline: 'отбирает мяч на чужой половине' },
    { area: 'security', name: 'Крайний-связующий', tagline: 'держит мяч под давлением' },
    { area: 'defending', name: 'Трудяга', tagline: 'возвращается и помогает в обороне' },
  ],
  ST: [
    { area: 'finishing', name: 'Завершитель', tagline: 'решает ударами' },
    { area: 'creation', name: 'Оттянутый форвард', tagline: 'связывает игру и создаёт моменты' },
    { area: 'ballwin', name: 'Прессингующий форвард', tagline: 'отбирает мяч на чужой половине' },
    { area: 'security', name: 'Опорный форвард', tagline: 'держит мяч спиной к воротам' },
    { area: 'takeon', name: 'Подвижный форвард', tagline: 'обыгрывает и уходит в прорыв' },
    { area: 'defending', name: 'Форвард-трудяга', tagline: 'помогает в обороне всей команде' },
  ],
};

function dna(line: PositionGroup | null, slices: SeasonSlice[]): { archetype: { name: string; tagline: string }; roles: Array<{ name: string; score: number }> } {
  const p = (k: string) => slices.find((s) => s.key === k)?.pct ?? null;
  if (line === 'GK') {
    const hard = p('hardSaves'), clean = p('gkErrors'), feet = avgN(p('progPasses'), p('accuracy'));
    const best = [{ v: hard, name: 'Вратарь-спаситель', tagline: 'вытаскивает трудные мячи' }, { v: clean, name: 'Надёжный вратарь', tagline: 'играет без ошибок' }, { v: feet, name: 'Вратарь-распасовщик', tagline: 'начинает атаки ногами' }]
      .filter((x) => x.v != null).sort((a, b) => (b.v as number) - (a.v as number));
    return { archetype: best[0] ? { name: best[0].name, tagline: best[0].tagline } : { name: 'Вратарь', tagline: 'последний рубеж обороны' }, roles: best.map((b) => ({ name: b.name, score: Math.round(b.v as number) })) };
  }
  const areas: Areas = {
    finishing: avgN(p('goals'), p('shots')), creation: avgN(p('chances'), p('progPasses')), takeon: p('dribbles'),
    security: avgN(p('security'), p('accuracy')), ballwin: avgN(p('ballWin'), p('pressing')), defending: p('clearances'),
  };
  const cat = ARCHETYPES[(line ?? 'CM') as Exclude<PositionGroup, 'GK'>];
  const ranked = cat.map((a) => ({ ...a, score: areas[a.area] })).filter((a) => a.score != null).sort((a, b) => (b.score as number) - (a.score as number));
  const top = ranked[0];
  return { archetype: top ? { name: top.name, tagline: top.tagline } : { name: GROUP_INFO[line ?? 'CM'].title, tagline: 'мало данных для профиля' }, roles: ranked.slice(0, 4).map((r) => ({ name: r.name, score: Math.round(r.score as number) })) };
}

const plural = (n: number, one: string, few: string, many: string) => { const a = Math.abs(n) % 100, b = a % 10; if (a >= 11 && a <= 14) return many; if (b === 1) return one; if (b >= 2 && b <= 4) return few; return many; };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const RESULT_WORD = { W: 'победа', D: 'ничья', L: 'поражение' } as const;

/**
 * Сезонный профиль игрока (одна или несколько регистраций одного ребёнка). null — когорта
 * ещё считается. ctx — дата/соперник/счёт матчей команд холдинга (для динамики и текста).
 */
export async function playerSeason(season: number, year: number, ids: number[], name: string, ctx: (avMatchId: number) => MatchContext | null): Promise<PlayerSeason | null> {
  const c = cohortMetrics(season, year);
  if (!c) return null;
  const t = await tableOf(season, c);
  const L = c.matchLen;
  // Склейка регистраций: события и минуты по матчам.
  const counts = new Map<string, number>();
  let minutes = 0, matches = 0;
  for (const id of ids) {
    const pmMap = c.byMatch.get(id); const mins = c.minutes.get(id);
    if (!pmMap || !mins) continue;
    for (const [mid, pm] of pmMap) {
      const m = mins.get(mid) ?? 0;
      if (m <= 0) continue;
      minutes += m; matches++;
      for (const [k, v] of pm.counts) counts.set(k, (counts.get(k) ?? 0) + v);
    }
  }
  minutes = Math.round(minutes);
  const lineOfPlayer = ids.map((id) => c.lineOfPlayer.get(id)).find((l) => l != null) ?? null;
  const line = ids.map((id) => c.groupOfPlayer.get(id)).find((g) => g != null) ?? null;   // группа позиции
  const inPool = !!line && minutes >= poolMinutes(L);

  const slices: SeasonSlice[] = metricsOf(line).map((m) => {
    const value = valueOf(m, { counts, minutes }, L);
    const pool = line ? t.pool.get(`${line}:${m.key}`) ?? [] : [];
    return { key: m.key, name: m.name, short: m.short, description: m.description, group: m.group, polarity: m.polarity, value, ratio: !!m.ratio, pct: value != null && inPool ? pctOf(pool, value, m.polarity) : null };
  });
  // Индекс 2.0 по всем регистрациям игрока разом.
  const sv = t.model.season(ids.flatMap((id) => t.model.rowsOf(id)).sort((a, b) => a.mid - b.mid), line);
  const pp = line ? t.model.pool.get(line) ?? [] : [];
  const mine = sv.value;
  const indexPct = mine != null && inPool ? pctOf(pp, mine) : null;
  const [lo, hi] = bounds(pp);
  const rank = mine != null && inPool ? pp.filter((x) => x > mine).length + 1 : null;

  const { archetype, roles } = dna(line, slices);
  const scored = slices.filter((s) => s.pct != null) as Array<SeasonSlice & { pct: number }>;
  const strengths = scored.slice().sort((a, b) => b.pct - a.pct).slice(0, 4).filter((s) => s.pct >= 50).map((s) => ({ key: s.key, name: s.name, description: s.description, pct: s.pct }));
  const growth = scored.slice().sort((a, b) => a.pct - b.pct).filter((s) => s.pct <= 40 && !strengths.some((x) => x.key === s.key)).slice(0, 3).map((s) => ({ key: s.key, name: s.name, description: s.description, pct: s.pct }));
  const peersWord = line ? `${GROUP_INFO[line].peers} ${year} г.р. региона` : `игроков ${year} г.р.`;
  let superline: string | null = null;
  if (strengths[0]) {
    const s0 = scored.find((s) => s.key === strengths[0]!.key)!;
    const pool = line ? t.pool.get(`${line}:${s0.key}`) ?? [] : [];
    const better = s0.value != null ? pool.filter((x) => (s0.polarity > 0 ? x > (s0.value as number) : x < (s0.value as number))).length : 99;
    superline = better === 0 ? `Лучший среди ${peersWord} по «${s0.name}»` : s0.pct >= 80 ? `В числе сильнейших ${peersWord} по «${s0.name}»` : `Сильнее всего — «${s0.name}»`;
  }

  // Динамика: индекс матча 0–10 против распределения «за матч» по линии.
  const mp = line ? t.model.matchPool.get(line) : undefined;
  const toIdx = (xs: number[] | undefined, v: number) => { if (!xs || xs.length < 5) return null; const [a0, b0] = bounds(xs, true); return scaleIdx(v, a0, b0); };
  const series: SeasonMatch[] = sv.rows.filter((m) => m.m >= L * SERIES_MIN_SHARE).map((m) => {
    const k = L / m.m;
    const cx = ctx(m.mid);
    return {
      matchId: m.mid, minutes: Math.round(m.m),
      overall: toIdx(mp?.overall, sv.clipped.get(m.mid) ?? m.adj * k), attack: toIdx(mp?.attack, m.att * k), defence: toIdx(mp?.defence, m.def * k),
      date: cx?.date ?? null, opponent: cx?.opponent ?? null, score: cx?.score ?? null, result: cx?.result ?? null,
    };
  }).sort((a, b) => a.matchId - b.matchId);
  // Порядок по датам, где они известны (id матчей AvanData растут по ходу сезона).
  series.sort((a, b) => (a.date && b.date ? (a.date < b.date ? -1 : 1) : a.matchId - b.matchId));

  const goals = counts.get('goal') ?? 0;
  const index = mine != null && inPool && pp.length >= 5 ? scaleIdx(mine, lo, hi) : null;
  // Абзац-вывод, как «Профиль» в Легирусе.
  const parts: string[] = [];
  parts.push(`${name} — ${line ? GROUP_INFO[line].one : 'игрок'}, ${year} г.р. В сезоне — ${matches} ${plural(matches, 'разобранный матч', 'разобранных матча', 'разобранных матчей')} (${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')} на поле)${goals ? `, ${goals} ${plural(goals, 'гол', 'гола', 'голов')}` : ''}.`);
  if (!inPool) parts.push(`Без оценки (б/о): для сравнения со сверстниками нужно от двух полных матчей на поле — ${poolMinutes(L)} минут.`);
  else {
    if (strengths.length) parts.push(`Среди ${peersWord} сильнее всего по: ${strengths.slice(0, 2).map((s) => `${s.name.toLowerCase()} (${s.pct}-й перцентиль)`).join(', ')}.`);
    const rated = series.filter((s) => s.overall != null);
    if (rated.length >= 4) {
      const last3 = rated.slice(-3).reduce((s, x) => s + (x.overall as number), 0) / 3;
      const all = rated.reduce((s, x) => s + (x.overall as number), 0) / rated.length;
      parts.push(last3 - all >= 0.5 ? 'В хорошей форме — последние матчи выше своего среднего.' : all - last3 >= 0.5 ? 'Последние матчи ниже своего среднего.' : 'Форма ровная — последние матчи на уровне сезона.');
    }
    const last = series.filter((s) => s.date).slice(-1)[0];
    if (last?.date && last.opponent) parts.push(`Последний разобранный матч — ${fmtDate(last.date)} против «${last.opponent}» (${last.score ?? '—'})${last.result ? `, ${RESULT_WORD[last.result]}` : ''}.`);
    if (index != null) parts.push(`Индекс сезона — ${index.toFixed(1)} из 10 (10 — лучший среди ${GROUP_INFO[line as PositionGroup].peers} своего возраста в регионе); лучше ${Math.round(indexPct as number)}% из них.`);
  }

  return {
    playerId: ids[0]!, year, line: lineOfPlayer, matchLen: L, minutes, matches, goals,
    group: line, groupTitle: line ? GROUP_INFO[line].title : null, peersWord,
    index, indexPct, rank, peers: pp.length, lowSample: sv.lowSample,
    vsTop: { index: sv.vsTop.value != null && pp.length >= 5 ? scaleIdx(sv.vsTop.value, lo, hi) : null, minutes: sv.vsTop.minutes, matches: sv.vsTop.matches },
    archetype, superline, strengths, growth, roles, slices, series, text: parts.join(' '), inPool,
  };
}

/**
 * Индекс и форма всех игроков когорты разом — для списков решений (тот же честный счёт,
 * что в профиле: за полный матч своего возраста, против своей позиции, с минутами).
 * null — когорта ещё считается.
 */
export interface PlayerForm { index: number | null; indexPct: number | null; /** Минут меньше двух полных матчей: без оценки (б/о). */ lowSample: boolean; /** Индекс против сильнейшей четверти команд региона. */ vsTop: { index: number | null; minutes: number; matches: number }; /** Перцентиль игры в обороне среди своей группы позиций. */ defPct: number | null; minutes: number; matches: number; series: number[]; formDelta: number | null; lastMinutesShare: number | null }
export async function cohortForms(season: number, year: number): Promise<{ asOf: string; forms: Map<number, PlayerForm> } | null> {
  const c = cohortMetrics(season, year);
  if (!c) return null;
  const t = await tableOf(season, c);
  return cached(`holding-forms:v2:${season}:${year}:${c.asOf}:${tiersStamp(year)}`, 6 * 60 * 60 * 1000, async () => {
    const L = c.matchLen;
    const forms = new Map<number, PlayerForm>();
    for (const a of t.aggs.values()) {
      const pool = a.group ? t.model.pool.get(a.group) ?? [] : [];
      const inPool = !!a.group && a.minutes >= poolMinutes(L);
      const sv = t.model.season(t.model.rowsOf(a.pid), a.group);
      const val = inPool ? sv.value : null;
      const pct = val != null ? pctOf(pool, val) : null;
      const [plo, phi] = bounds(pool);
      const mp = a.group ? t.model.matchPool.get(a.group) : undefined;
      const rows = sv.rows;
      const [mlo, mhi] = mp ? bounds(mp.overall, true) : [0, 0];
      const series = rows.filter((x) => x.m >= L * SERIES_MIN_SHARE && mp && mp.overall.length >= 5).map((x) => scaleIdx(sv.clipped.get(x.mid) ?? (x.adj / x.m) * L, mlo, mhi));
      // Форма: последние 3 матча против всего сезона (шкала 5–10), от 5 оценённых матчей.
      const formDelta = series.length >= 5 ? Math.round((series.slice(-3).reduce((s, x) => s + x, 0) / 3 - series.reduce((s, x) => s + x, 0) / series.length) * 10) / 10 : null;
      const last3 = rows.slice(-3);
      const lastMinutesShare = last3.length ? Math.round((last3.reduce((s, x) => s + x.m, 0) / (last3.length * L)) * 100) / 100 : null;
      const defPct = inPool ? pctOf(t.model.defencePool.get(a.group as PositionGroup) ?? [], (rows.reduce((x, r) => x + r.def, 0) / (sv.minutes || 1)) * L) : null;
      forms.set(a.pid, { index: val != null && pool.length >= 5 ? scaleIdx(val, plo, phi) : null, indexPct: pct, lowSample: sv.lowSample, vsTop: { index: sv.vsTop.value != null && pool.length >= 5 ? scaleIdx(sv.vsTop.value, plo, phi) : null, minutes: sv.vsTop.minutes, matches: sv.vsTop.matches }, defPct, minutes: a.minutes, matches: a.matches, series, formDelta, lastMinutesShare });
    }
    return { asOf: c.asOf, forms };
  });
}
