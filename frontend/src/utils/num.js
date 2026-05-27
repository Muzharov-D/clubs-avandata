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
  let cnt = 0;
  if (inverse) {
    for (const v of arr) if (v >= value) cnt++;
  } else {
    for (const v of arr) if (v <= value) cnt++;
  }
  return Math.round((cnt / arr.length) * 100);
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
