/**
 * Нормализация имён команд для СРАВНЕНИЯ (не для отображения).
 *
 * Порт «выстраданного» контракта Легируса (MULTI_TENANT_BLUEPRINT §13.4):
 * провайдеры пишут имена непоследовательно —
 *   - юр-формы вразнобой: «Зенит» / «ФК Зенит», «СШОР …» / «ГБУ ДО СШОР …»
 *   - дефис vs пробел: «Кировец Восхождение» / «Кировец-Восхождение»
 *
 * Правила: срезаем юр-префиксы (НО НЕ СШОР/СШ — это содержательная часть),
 * дефисы/тире → пробел, срезаем возрастной суффикс (U-15/U15/2011 — это
 * не идентичность команды, а группа; в одном матче у обеих сторон она одна),
 * lowercase, схлопываем пробелы.
 * Важно: «-2» в «Зенит-2» становится словом «2» и СОХРАНЯЕТСЯ — вторая
 * команда клуба остаётся ОТДЕЛЬНОЙ (это не возрастной маркер).
 *
 * Срез возраста критичен для дерби: «Зенит U15» vs «СШОР Зенит U15» →
 * «зенит» vs «сшор зенит». Точное совпадение нашего имени бьёт подстроку
 * (см. matchScore), поэтому ФК и СШОР различаются автоматически.
 */
const LEGAL_PREFIX = /^(фк|гбу\s+до|гбоу|мбоу|маоу|гку|мку|гкоу|ано|оо|роо)\s+/i;

export function normalizeTeamName(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(LEGAL_PREFIX, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\bu\s?\d{1,3}\b/g, ' ')   // U-15 / U15 / U 15 (после дефис→пробел)
    .replace(/\b20\d{2}\b/g, ' ')        // год рождения: 2011, 2012…
    .replace(/\s+/g, ' ')
    .trim();
}

/** Качество совпадения двух нормализованных имён: 3=точное, 2=префикс, 1=подстрока, 0=нет. */
function matchScore(our: string, other: string): number {
  if (!our || !other) return 0;
  if (our === other) return 3;
  if (other.startsWith(our) || our.startsWith(other)) return 2;
  if (other.includes(our) || our.includes(other)) return 1;
  return 0;
}

/**
 * На какой стороне наша команда. Сравниваем имя нашей команды с ОБЕИМИ
 * сторонами и берём ту, что совпала лучше. Возвращаем null если:
 *  - ни одна не совпала (имя не распознано — оставляем ориентацию неизвестной), либо
 *  - совпали одинаково (дерби двух наших команд / клубное имя в обеих) — не угадываем.
 *
 * Это надёжнее, чем старое `home.includes(ourName)`, которое молча считало нас
 * гостём при любом непопадании и переворачивало голы.
 */
export function resolveOurSide(
  ourName: string | null | undefined,
  homeName: string | null | undefined,
  awayName: string | null | undefined,
): 'home' | 'away' | null {
  const our = normalizeTeamName(ourName);
  if (!our) return null;
  const h = matchScore(our, normalizeTeamName(homeName));
  const a = matchScore(our, normalizeTeamName(awayName));
  if (h === 0 && a === 0) return null;
  if (h === a) return null;
  return h > a ? 'home' : 'away';
}
