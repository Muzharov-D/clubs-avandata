/**
 * Командные показатели «матч против сезона» — единый источник метрик и расчёта.
 *
 * Один список метрик (TEAM_VS_SEASON_DEFS) и один билдер строк для ВСЕХ экранов,
 * где показываем командный выхлоп матча против среднего по сезону: разбор матча
 * (/matches/:id) и сезонная сводка последнего матча (/matches). Раньше defs жили
 * только в MatchDetail — при правке метрик легко было разъехаться.
 *
 * teamAggregates — ВСЕГДА наша команда (бэк нормализует), не home/away: на выезде
 * teamSummaryStats.home = соперник и давал чужие удары в створ.
 */

// teamAggregates-значения — объекты {value,…} или числа.
function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

// Берём ПЕРВЫЙ источник с положительным значением (не первый не-null): в урезанном
// экспорте основной ключ присутствует со значением 0 (duels.totalDuels = {value:0}),
// и `??` на него не падал → реальные Отборы/Перехваты прятались.
function firstPositive(...vals) {
  for (const v of vals) { const n = num(v); if (n > 0) return n; }
  return 0;
}

// Дистанция в км (метры/1000, округление). 0 → скрыта (cur > 0 в билдере).
function km(m) {
  const d = num(m?.teamAggregates?.fitness?.totalDistance);
  return d > 0 ? Math.round(d / 1000) : 0;
}

// Тренерские метрики без жаргона; нулевые/отсутствующие авто-скрыты (cur > 0),
// поэтому набор широкий — на полном экспорте грид насыщенный, на урезанном
// показывает только то, что реально есть.
// paid: true — метрика на платных данных (касания в штрафной, качество паса,
// кроссы, физика). На free скрыта. group — для free-свёртки в 2 показателя
// (Атака / Оборона), см. buildTeamVsSeasonRows.
export const TEAM_VS_SEASON_DEFS = [
  // Атака
  { label: 'Удары',                  group: 'attack',  get: (m) => num(m?.teamAggregates?.shooting?.shots ?? m?.teamAggregates?.shooting?.totalShots) },
  { label: 'Удары в створ',          group: 'attack',  get: (m) => num(m?.teamAggregates?.shooting?.onTarget) },
  { label: 'Касания в штрафной',     group: 'attack',  get: (m) => num(m?.teamAggregates?.attacks?.touchesInBox), paid: true },
  { label: 'Обводки',                group: 'attack',  get: (m) => num(m?.teamAggregates?.attacks?.dribble) },
  // Передачи
  { label: 'Ключевые передачи',      group: 'attack',  get: (m) => num(m?.teamAggregates?.passes?.keyPass) },
  { label: 'Точные передачи',        group: 'attack',  get: (m) => num(m?.teamAggregates?.passes?.successful), paid: true },
  { label: 'Прогрессивные передачи', group: 'attack',  get: (m) => num(m?.teamAggregates?.passes?.progressive) },
  { label: 'Кроссы',                 group: 'attack',  get: (m) => num(m?.teamAggregates?.passes?.crosses), paid: true },
  // Оборона
  { label: 'Отборы',                 group: 'defence', get: (m) => firstPositive(m?.teamAggregates?.recoveriesAndTackling?.tackle, m?.teamAggregates?.duels?.totalDuels) },
  { label: 'Перехваты',              group: 'defence', get: (m) => firstPositive(m?.teamAggregates?.recoveriesAndTackling?.interception, m?.teamAggregates?.positioning?.interceptions) },
  { label: 'Подборы',                group: 'defence', get: (m) => num(m?.teamAggregates?.recoveriesAndTackling?.recovery) },
  // Физика (платное)
  { label: 'Дистанция, км',          group: 'fitness', get: km, paid: true },
];

/**
 * Сколько ОСТАЛЬНЫХ матчей сезона формируют эталон (текущий исключён по id).
 * Для подписи «среднее по остальным N матчам».
 */
export function otherMatchesCount(match, allMatches) {
  const data = Array.isArray(allMatches) ? allMatches : [];
  return data.filter((m) => m && m.id !== match?.id).length;
}

/**
 * Строки «матч против сезона»: текущий матч + среднее по ОСТАЛЬНЫМ матчам сезона.
 * Текущий (выбранный) матч исключаем из среднего по id — иначе он сам тянул бы
 * эталон к своим значениям («6 ударов против среднего 6.0» вместо «против 4»).
 * Среднее показываем при ≥2 остальных матчах; метрика скрыта, если в текущем
 * матче её нет (cur ≤ 0).
 * @param {Object} match — матч (с teamAggregates).
 * @param {Array} allMatches — все разобранные матчи сезона (детально).
 * @returns {{label:string, cur:number, avg:number|null}[]}
 */
export function buildTeamVsSeasonRows(match, allMatches, isPaidPlan = false) {
  const data = Array.isArray(allMatches) ? allMatches : [];
  const others = data.filter((m) => m && m.id !== match?.id);

  // На FREE — не детальные метрики (их в бесплатном экспорте нет), а 2 сводных
  // показателя из БАЗОВЫХ free-метрик: «Атака» и «Оборона» (сумма событий
  // группы), тоже против среднего по остальным матчам сезона.
  if (!isPaidPlan) {
    const freeDefs = TEAM_VS_SEASON_DEFS.filter((d) => !d.paid);
    const sumGroup = (m, g) =>
      freeDefs.filter((d) => d.group === g).reduce((s, d) => s + (Number(d.get(m)) || 0), 0);
    return [
      { label: 'Атака', group: 'attack' },
      { label: 'Оборона', group: 'defence' },
    ].map((g) => {
      const cur = sumGroup(match, g.group);
      if (!(cur > 0)) return null;
      const vals = others.map((m) => sumGroup(m, g.group)).filter((v) => v > 0);
      const avg = vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { label: g.label, cur, avg };
    }).filter(Boolean);
  }

  return TEAM_VS_SEASON_DEFS.map((d) => {
    const cur = d.get(match);
    if (!(cur > 0)) return null;
    const vals = others.map(d.get).filter((v) => v > 0);
    const avg = vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { label: d.label, cur, avg };
  }).filter(Boolean);
}
