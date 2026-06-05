/**
 * Единый матчинг «наша команда» для ВСЕХ экранов. Источник истины — ext team id:
 * бэк проставляет каждому матчу календаря `ourSide` ('home'|'away'|null),
 * посчитанный по ext_team_id (см. backend/src/data/ourTeam.ts).
 *
 * Раньше «наша сторона» определялась 4-5 разными способами (подстрока имени,
 * хардкод isLegirus) → переворот счёта/формы и «своя команда как соперник» в
 * публичном календаре. Теперь — один помощник, импортируемый везде.
 *
 * Фолбэк по имени применяется ТОЛЬКО если `ourSide` не пришёл (старые данные или
 * иной источник): строгое нормализованное равенство + защита от резерва/дублей
 * и от пары «Зенит» / «СШОР Зенит».
 */

/** @param {unknown} s */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\bu-?\s*\d{1,3}\b/gi, '') // U-15, U15
    .replace(/\b20\d{2}\b/g, '')        // годы
    .replace(/[«»()[\]]/g, '')          // кавычки/скобки
    .replace(/\s+/g, ' ')
    .trim();
}

const RESERVE_RE = /[-\s](?:2|3|ii|iii)$/i;

/**
 * Строгий матч имени нашей команды — ФОЛБЭК, когда ext id недоступен.
 * @param {unknown} teamName
 * @param {unknown} ourName
 * @returns {boolean}
 */
export function isOurTeamName(teamName, ourName) {
  const me = norm(ourName);
  const her = norm(teamName);
  if (!me || !her) return false;
  // «Зенит» / «ФК Зенит» не путаем с «СШОР Зенит» (и наоборот).
  if ((me === 'зенит' || me === 'фк зенит') && her.includes('сшор')) return false;
  if (me.includes('сшор') && !her.includes('сшор')) return false;
  if (me === her) return true;
  // Резерв/дубль («Легирус-2», «… II») есть только у одной стороны → не наш.
  if (RESERVE_RE.test(her) !== RESERVE_RE.test(me)) return false;
  return her.includes(me) || me.includes(her);
}

/**
 * Наша сторона матча: 'home' | 'away' | null.
 * @param {Record<string, any>|null|undefined} match — ряд календаря.
 * @param {{ ourExtId?: string|number|null, ourName?: string }} [ctx]
 * @returns {'home'|'away'|null}
 */
export function ourSide(match, ctx = {}) {
  if (!match) return null;
  // 1) Бэк уже посчитал по ext id — высший приоритет.
  if (match.ourSide === 'home' || match.ourSide === 'away') return match.ourSide;
  const { ourExtId, ourName } = ctx;
  // 2) ext id на клиенте (если есть и ourExtId известен).
  const h = match.homeTeamId ?? match.extHomeTeamId;
  const a = match.awayTeamId ?? match.extAwayTeamId;
  if (ourExtId != null && (h != null || a != null)) {
    if (h != null && String(h) === String(ourExtId)) return 'home';
    if (a != null && String(a) === String(ourExtId)) return 'away';
    return null; // ext известен, ни одна сторона не совпала → точно не наш
  }
  // 3) Фолбэк по имени.
  if (isOurTeamName(match.home, ourName)) return 'home';
  if (isOurTeamName(match.away, ourName)) return 'away';
  return null;
}

/**
 * Наш ли это матч вообще.
 * @param {Record<string, any>|null|undefined} match
 * @param {{ ourExtId?: string|number|null, ourName?: string }} [ctx]
 * @returns {boolean}
 */
export function isOurMatch(match, ctx = {}) {
  if (match?.ourSide === 'home' || match?.ourSide === 'away') return true;
  // ourSide === null от бэка означает «посчитано по ext id, не наш» —
  // доверяем флагу isOurMatch, который бэк выставил той же логикой.
  if (match?.ourSide === null && typeof match?.isOurMatch === 'boolean') return match.isOurMatch;
  return ourSide(match, ctx) != null;
}
