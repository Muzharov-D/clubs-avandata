/**
 * Каталог метрик скаут-профиля + клиентский расчёт перцентилей.
 *
 * Перцентиль считаем НА КЛИЕНТЕ из талант-пула региона (`/federation/talent`) —
 * у федерации есть знаменатель (весь пул), у клуба его нет. Это и есть «пицца»:
 * место игрока относительно базы сравнения по каждому показателю.
 *
 * Базы сравнения (правка владельца «не vs позиции, а в сравнении с командой»):
 *   • 'team'   — товарищи по команде (клуб + возраст), все позиции;
 *   • 'region' — регион по линии позиции (вратарь/защита/полузащита/атака).
 * Группировка показателей — по граням CIES (завершение/распределение/…).
 *
 * Событийные метрики нормируем на 90 минут (честное сравнение независимо от
 * наигранных минут); индексы рейтинга 0–10 берём как есть (это уже средние).
 */

/** Строка талант-пула, нужная для расчёта (подмножество ответа `/talent`). */
export interface PoolPlayer {
  playerId: string;
  club: string;
  ageGroup: string;
  position: string | null;
  minutes: number;
  rating: number | null;
  attack: number | null;
  defence: number | null;
  passing: number | null;
  fitness: number | null;
  creativity: number | null;
  goals: number;
  shots: number;
  dribbles: number;
  progressivePasses: number;
  tackles: number;
  interceptions: number;
}

export type MetricKind = 'rating' | 'event';
export type Facet = 'Завершение' | 'Распределение' | 'Обыгрыш' | 'Оборона' | 'Атлетизм' | 'Класс';

export interface MetricDef {
  key: string;
  field: keyof PoolPlayer;
  /** Полная подпись (списки сильных/слабых сторон). */
  label: string;
  /** Короткая подпись (лучи «пиццы»). */
  short: string;
  facet: Facet;
  kind: MetricKind;
}

/** Грани CIES в порядке показа. */
export const FACETS: Facet[] = ['Завершение', 'Распределение', 'Обыгрыш', 'Оборона', 'Атлетизм', 'Класс'];

/**
 * Каталог всех показателей, которые федерация собирает и отдаёт (37 базовых
 * событий + 6 индексов рейтинга). Платные stats-секции сюда не входят — гейт.
 */
export const METRIC_CATALOG: MetricDef[] = [
  // Завершение
  { key: 'goals', field: 'goals', label: 'Голы', short: 'Голы', facet: 'Завершение', kind: 'event' },
  { key: 'shots', field: 'shots', label: 'Удары', short: 'Удары', facet: 'Завершение', kind: 'event' },
  { key: 'attack', field: 'attack', label: 'Индекс атаки', short: 'Атака', facet: 'Завершение', kind: 'rating' },
  // Распределение
  { key: 'progressivePasses', field: 'progressivePasses', label: 'Прогрессивные пасы', short: 'Прогр.', facet: 'Распределение', kind: 'event' },
  { key: 'passing', field: 'passing', label: 'Индекс паса', short: 'Пас', facet: 'Распределение', kind: 'rating' },
  // Обыгрыш
  { key: 'dribbles', field: 'dribbles', label: 'Обводки', short: 'Обводки', facet: 'Обыгрыш', kind: 'event' },
  { key: 'creativity', field: 'creativity', label: 'Индекс креатива', short: 'Креатив', facet: 'Обыгрыш', kind: 'rating' },
  // Оборона
  { key: 'tackles', field: 'tackles', label: 'Отборы', short: 'Отборы', facet: 'Оборона', kind: 'event' },
  { key: 'interceptions', field: 'interceptions', label: 'Перехваты', short: 'Перехв.', facet: 'Оборона', kind: 'event' },
  { key: 'defence', field: 'defence', label: 'Индекс обороны', short: 'Оборона', facet: 'Оборона', kind: 'rating' },
  // Атлетизм
  { key: 'fitness', field: 'fitness', label: 'Индекс физики', short: 'Физика', facet: 'Атлетизм', kind: 'rating' },
  // Класс
  { key: 'overall', field: 'rating', label: 'Общий индекс', short: 'Общий', facet: 'Класс', kind: 'rating' },
];

/** Набор по умолчанию для «пиццы» — сбалансированный профиль (события за 90). */
export const DEFAULT_PIZZA = ['goals', 'shots', 'dribbles', 'progressivePasses', 'tackles', 'interceptions'];

export type Line = 'GK' | 'DEF' | 'MID' | 'FWD';

/** Позиция (RU-коды провайдеров) → линия. Зеркало LINE_CASE из бэка. */
export function lineOf(pos: string | null): Line {
  const s = (pos ?? '').toUpperCase();
  if (/^ВР|ВРАТ/.test(s)) return 'GK';
  if (/НАП|ФОР|^ЦН|^ЛН|^ПН|^ЛВ|^ПВ/.test(s)) return 'FWD';
  if (/ЗАЩ|^ЦЗ|^ЛЗ|^ЛКЗ|^ПКЗ/.test(s)) return 'DEF';
  if (/ПОЛ|^ЦОП|^ОПЗ|^ЦП|^ЛЦП|^ПЦП|^ВОП|^ПЗ/.test(s)) return 'MID';
  return 'MID';
}

export const LINE_LABEL: Record<Line, string> = {
  GK: 'вратари',
  DEF: 'защита',
  MID: 'полузащита',
  FWD: 'атака',
};

export type Baseline = 'team' | 'region';

/** Сырое значение показателя у игрока (события — за 90 минут; индексы — как есть). */
export function rawValue(p: PoolPlayer, def: MetricDef): number | null {
  const v = p[def.field];
  if (v == null) return null;
  if (def.kind === 'event') {
    if (p.minutes <= 0) return null;
    return (Number(v) / p.minutes) * 90;
  }
  return Number(v);
}

export interface PctResult {
  /** Перцентиль 0–100 (100 = лучший), либо null если пул < 3 или значения нет. */
  pct: number | null;
  /** Место в пуле, 1 = лучший (или null если значения нет). */
  rank: number | null;
  /** Размер пула сравнения (игроки с непустым значением показателя). */
  poolSize: number;
  /** Сырое значение игрока (за 90 / индекс). */
  value: number | null;
}

/** Пул сравнения для игрока по выбранной базе. */
export function poolFor(all: PoolPlayer[], target: PoolPlayer, base: Baseline): PoolPlayer[] {
  if (base === 'team') {
    return all.filter((p) => p.club === target.club && p.ageGroup === target.ageGroup);
  }
  const line = lineOf(target.position);
  return all.filter((p) => lineOf(p.position) === line);
}

/** Перцентиль игрока по показателю внутри пула. */
export function percentileIn(pool: PoolPlayer[], target: PoolPlayer, def: MetricDef): PctResult {
  const tv = rawValue(target, def);
  const vals = pool.map((p) => rawValue(p, def)).filter((x): x is number => x != null);
  const poolSize = vals.length;
  if (tv == null) return { pct: null, rank: null, poolSize, value: null };
  const rank = 1 + vals.filter((v) => v > tv).length;
  if (poolSize < 3) return { pct: null, rank, poolSize, value: tv };
  const below = vals.filter((v) => v < tv).length;
  const pct = Math.max(0, Math.min(100, Math.round((below / (poolSize - 1)) * 100)));
  return { pct, rank, poolSize, value: tv };
}

export interface MetricRow {
  def: MetricDef;
  res: PctResult;
}

/** Все показатели каталога с перцентилем для игрока по выбранной базе. */
export function computeMetricRows(all: PoolPlayer[], target: PoolPlayer, base: Baseline): MetricRow[] {
  const pool = poolFor(all, target, base);
  return METRIC_CATALOG.map((def) => ({ def, res: percentileIn(pool, target, def) }));
}

/** Форматирование значения показателя. */
export function fmtValue(def: MetricDef, value: number | null): string {
  if (value == null) return '—';
  if (def.kind === 'rating') return value.toFixed(1);
  const r = Math.round(value * 10) / 10;
  return r >= 10 ? String(Math.round(r)) : r.toFixed(1);
}

/** Единица измерения показателя (для подписей). */
export function unitOf(def: MetricDef): string {
  return def.kind === 'event' ? 'за 90' : 'из 10';
}
