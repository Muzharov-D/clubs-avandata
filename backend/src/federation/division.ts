/**
 * Классификация дивизиона (Высшая/Первая) по названию — ЕДИНЫЙ источник истины для
 * всего федеративного слоя (фильтр refs, группировка, weekly-радар).
 *
 * Почему по названию, а не по id: у AvanData `divisionId` СВОЙ в каждом возрастном
 * турнире, поэтому стабильного id для «Высшей» по всем годам не существует. Алиасы
 * покрывают спонсорские имена сезонов (Боброва=Высшая, Дементьева=Первая). При
 * переименовании лиги вызывающая сторона обязана не молчать, а логировать (см.
 * auditDivisions в avandataSource) — пустой экран без причины недопустим для регулятора.
 *
 * Чистый модуль (без env/живого API) — поэтому тестируется офлайн (division.test.ts).
 */
export const DIVISION_ALIASES: Record<string, RegExp> = {
  'Высшая': /Высшая|Боброва/i,
  'Первая': /Первая|Дементьева/i,
};
export type DivisionKey = keyof typeof DIVISION_ALIASES;

/** Название дивизиона → ключ лиги, либо null (нижний эшелон / неизвестное). */
export const classifyDivision = (title: string): DivisionKey | null => {
  for (const [key, re] of Object.entries(DIVISION_ALIASES)) {
    if (re.test(title)) return key as DivisionKey;
  }
  return null;
};

/** Совпадает ли название турнира с запрошенным дивизионом (фронт шлёт 'Высшая'/'Первая'). */
export const matchesDivision = (title: string, division: string): boolean => {
  const re = DIVISION_ALIASES[division];
  return re ? re.test(title) : title.toLowerCase().includes(division.toLowerCase());
};
