/** Federation view formatting utilities. */

export const num = (n: number): string => Math.round(n).toLocaleString('ru-RU');
export const pm = (n: number) => (n > 0 ? `+${n}` : String(n));

/** "Александр Суслов" → "Суслов А." — фамилия не теряется при обрезке. */
export const shortName = (s: string): string => {
  const w = s.trim().split(/\s+/);
  return w.length > 1 ? `${w[w.length - 1]} ${w[0][0]}.` : s;
};

/** "Александр Суслов" → "Суслов" (для сортировок/подписей). */
export const lastName = (s: string): string => {
  const w = s.trim().split(/\s+/);
  return w.length > 1 ? w[w.length - 1] : s;
};

/** ISO → "15 июн" (без точки). */
export const fmtDate = (iso: string | null): string => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
      .format(new Date(iso))
      .replace('.', '');
  } catch { return ''; }
};

/** ISO → "15 июн 14:32" */
export const fmtStamp = (iso: string | null | undefined): string => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return ''; }
};

/** Склонение "матч": 1 матч, 2–4 матча, 5+ матчей. */
export const plMatch = (n: number): string => {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return 'матчей';
  if (b === 1) return 'матч';
  if (b >= 2 && b <= 4) return 'матча';
  return 'матчей';
};

/** Склонение "место": 1 место, 2–4 места, 5+ мест. */
export const plMesto = (n: number): string => {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return 'мест';
  if (b === 1) return 'место';
  if (b >= 2 && b <= 4) return 'места';
  return 'мест';
};

/** Склонение "изменение": 1 изменение, 2–4 изменения, 5+ изменений. */
export const plChange = (n: number): string => {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return 'изменений';
  if (b === 1) return 'изменение';
  if (b >= 2 && b <= 4) return 'изменения';
  return 'изменений';
};

/** Грубая линия амплуа: GK / DEF / MID / FWD. */
export type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
export const lineOf = (pos: string | null): Line | null => {
  const p = (pos ?? '').toLowerCase();
  if (/врат/.test(p)) return 'GK';
  if ((/защит/.test(p) || /фулбек/.test(p)) && !/полуз/.test(p)) return 'DEF';
  if (/полуз|опорн/.test(p)) return 'MID';
  if (/напад|форвард/.test(p)) return 'FWD';
  return null;
};
export const LINE_LABEL: Record<Line, string> = {
  GK: 'вратарей', DEF: 'защитников', MID: 'полузащитников', FWD: 'нападающих',
};

/**
 * Канон-ключ клуба для склейки источников и year-вариантов = ЗЕРКАЛО backend `federation/teamName.ts`.
 * Срезает «ФК», ХВОСТОВОЙ ГОД (у игроков club = «Автово 2011»!), скобку-программу «(…)», дефисы,
 * город-квалификатор (спб/санкт-петербург). СШ/СШОР НЕ схлопывает — это РАЗНЫЕ школы. Критично:
 * без среза года звёзды игроков не стыковались с клубами-кандидатами (LeaguesView), а школы
 * дробились по годам (QualityView). Один ключ для сборной, звёздочек и качества игроков.
 */
export const normTeam = (s: string): string => s.toLowerCase()
  .replace(/[«»"']/g, '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/^фк\s+/, '')
  .replace(/\s*\d{4}\s*$/, '')
  .replace(/[-–—]/g, ' ')
  .replace(/(^|\s)(спб|санкт петербург)(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** Перцентиль «топ X%» внутри пула: меньше = лучше. null — пул мал. */
export const topPctOf = (mine: number, pool: number[], min = 5): number | null => {
  if (pool.length < min) return null;
  const below = pool.filter((r) => r < mine).length;
  return Math.max(1, Math.min(100, Math.round((1 - below / Math.max(1, pool.length - 1)) * 100)));
};
