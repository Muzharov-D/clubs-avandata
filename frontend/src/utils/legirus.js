// Single source of truth для всего что связано с клубом Легирус.
// Раньше было 5+ копий isLegirus/shieldFor/LEGIRUS_LOGO в разных файлах — теперь одна.

export const LEGIRUS_LOGO = '/icons/legirus.png';

// Whitelist team_id для нашего клуба — точнее чем substring "легирус" в названии
export const LEGIRUS_TEAM_IDS = new Set([
  'legirus-2010', 'legirus-2011', 'legirus-2012', 'legirus-2013',
]);

// Распознавание по имени — простой case-insensitive substring.
// (Не используем \b word-boundary — в JS regex он работает только с ASCII,
// для кириллицы \bлегирус\b НИКОГДА не матчит. Подстрока надёжнее.)
export function isLegirus(name) {
  return String(name || '').toLowerCase().includes('легирус');
}

// Подмена щита команды на наш локальный лого, если это Легирус
export function shieldFor(teamName, fallbackUrl) {
  return isLegirus(teamName) ? LEGIRUS_LOGO : (fallbackUrl || '');
}

// ───────────────────────────────────────────────────────────────────────
// Tenant-aware «это наша команда?»
//
// В multi-tenant SaaS (clubs.avandata.ru) клуб не обязательно Легирус —
// это может быть ФК Зенит, СШОР Зенит, любой другой. AuthContext при
// логине вызывает setClubHints(['ФК Зенит']) — и весь UI начинает считать
// «нашими» матчи с этим клубом.
//
// «Легирус» остаётся в whitelist всегда — для обратной совместимости с
// legacy-кодом и для tenant=legirus (если кто-то его реактивирует).
// ───────────────────────────────────────────────────────────────────────
const CLUB_HINTS = new Set(['легирус']);

export function setClubHints(names) {
  CLUB_HINTS.clear();
  CLUB_HINTS.add('легирус');  // safety baseline
  if (!Array.isArray(names)) names = [names];
  for (const n of names) {
    if (!n) continue;
    const norm = normalizeTeamName(n);
    if (norm) CLUB_HINTS.add(norm);
  }
}

export function clearClubHints() {
  CLUB_HINTS.clear();
  CLUB_HINTS.add('легирус');
}

// «Это наша команда?» — учитывает тенант и edge case СШОР vs ФК
// (если мы СШОР Зенит, то просто «Зенит» — это НЕ мы).
export function isOurClub(name) {
  const t = normalizeTeamName(name);
  if (!t) return false;
  for (const hint of CLUB_HINTS) {
    if (!hint) continue;
    // Edge: «сшор» в наших подсказках — но команда без «сшор» в имени —
    // это другой клуб (ФК Зенит vs СШОР Зенит)
    const hintIsShkola = hint.includes('сшор') || hint.includes('школа');
    const nameIsShkola = t.includes('сшор') || t.includes('школа');
    if (hintIsShkola !== nameIsShkola) continue;
    if (t === hint) return true;
    if (t.includes(hint) || hint.includes(t)) return true;
  }
  return false;
}

// Алиасы команд: одна команда у FFSPB фигурирует под разными именами.
// Авто-схлопнуть нельзя (нельзя резать по дефису — «СШОР Лидер» и «СШОР
// Лидер-Купчино» это РАЗНЫЕ команды). Поэтому ведём ручную мапу:
//   ключ — любой из вариантов (после срезания юр-префиксов, lowercase),
//   значение — каноническое имя (то что в standings).
// Дополняй мапу когда находишь новый дубль.
// Ключи/значения — БЕЗ дефисов (normalizeTeamName меняет дефисы на пробелы
// до применения алиасов).
const TEAM_ALIASES = {
  'пороховчанин': 'пороховчанин тосно',
  'сшор экран': 'сш экран',
  'сш выборжанин': 'выборжанин',
};

// Нормализация имени команды для СРАВНЕНИЯ (не для отображения).
// FFSPB непоследователен:
//  - юр-формы вразнобой: «Легирус» / «ФК Легирус», «СШОР Кировского
//    района» / «ГБУ ДО СШОР Кировского района»
//  - дефис vs пробел: «Кировец Восхождение» / «Кировец-Восхождение»
// Что делаем: срезаем юр-формы (НЕ трогаем СШОР/СШ — содержательная
// часть), все дефисы/тире → пробел, lowercase, схлопываем пробелы,
// применяем ручные алиасы.
// Важно: «-2» в «Кировец-Восхождение-2» становится словом «2» —
// вторая команда школы остаётся ОТДЕЛЬНОЙ, не схлопывается с первой.
export function normalizeTeamName(name) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/^(фк|гбу\s+до|гбоу|мбоу|маоу|гку|мку|гкоу|ано|оо|роо)\s+/i, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return TEAM_ALIASES[n] || n;
}
