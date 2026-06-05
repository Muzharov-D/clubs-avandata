// Универсальная нормализация значений из stats / splits / radar.
// Значения приходят либо как число, либо как { value, pct } объект.
export function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Percentile rank — позиция значения внутри отсортированной выборки в %.
// По умолчанию «больше = лучше»: percentile = доля значений ≤ value.
// inverse=true — «меньше = лучше» (фолы, ЖК, потери): percentile = доля значений ≥ value.
// Возвращает 0–100. Если выборка <2 — возвращаем null (UI рендерит «нет
// данных для сравнения», вместо обманного flat 50% по всем осям).
export function percentileRank(value, allValues, inverse = false) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const arr = (allValues || []).map(num).filter((v) => v !== null && !isNaN(v));
  if (arr.length < 2) return null;
  // Midrank: равные значения считаем как ПОЛОВИНУ, а не как «≤».
  // Иначе нуль среди многих нулей (защитник с 0 обводок при 9 нулях из 12)
  // получал бы 75-й перцентиль — ложная «сильная сторона»; а единственный
  // лучший «прилипал» к ровно 100. Стандарт скаутинга — midrank.
  let below = 0;
  let equal = 0;
  for (const v of arr) {
    if (v === value) equal++;
    else if (inverse ? v > value : v < value) below++;
  }
  return Math.round(((below + 0.5 * equal) / arr.length) * 100);
}

// Русское склонение существительного по числу.
// plural(1,'матч','матча','матчей') → 'матч'; plural(3,…) → 'матча'; plural(5,…) → 'матчей'.
export function plural(n, one, few, many) {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// «5 матчей» / «1 матч» / «3 матча» — без уродливого сокращения «матч.».
export function matchesWord(n) {
  return plural(n, 'матч', 'матча', 'матчей');
}

// Буква результата матча для значка формы: латинский код модели → русская
// буква (W→В, D→Н, L→П). CSS-классы остаются на латинском коде, меняется
// только отображаемый текст — правило «без англицизмов» в UI.
const FORM_LETTER_RU = { W: 'В', D: 'Н', L: 'П' };
export function formLetterRu(result) {
  return FORM_LETTER_RU[result] || '–';
}

// Форматирование «сырых» значений метрик для подписи на слайсе:
// - integer-значения как целые числа;
// - дробные (xG/xA, среднее) — 1 знак;
// - больше 1000 — без дроби и с пробелом-разделителем тысяч.
export function formatRaw(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString('ru-RU');
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 10) return String(Math.round(n));
  return n.toFixed(Math.abs(n) < 1 ? 2 : 1);
}
