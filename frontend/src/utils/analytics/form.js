/**
 * Форма игрока/команды: взвешенный по свежести индекс последних N матчей,
 * детект горячих/холодных серий и наклон развития (траектория за сезон).
 * Вход — серия из /player/:id/trend ([{date, overall, attack, ...}]).
 */

const DECAY = 0.78; // вес затухания на матч в прошлое

// Минимум матчей для словесных выводов о ДИНАМИКЕ (траектория/серия). На 3
// точках «форма растёт» или «серия из 3 матчей» — статистический шум: один
// слабый/яркий матч переворачивает наклон. Индекс формы (взвешенное среднее)
// показываем и раньше, а вердикты о тренде — только с накоплением выборки.
const MIN_TREND_MATCHES = 5;

/** Индекс формы: среднее по последним N с экспоненциальным затуханием свежести. */
export function formIndex(series, key = 'overall', n = 5) {
  const vals = (series || []).filter((s) => Number(s?.[key]) > 0).slice(-n);
  if (!vals.length) return null;
  let wsum = 0;
  let w = 0;
  vals.forEach((s, i) => {
    const weight = Math.pow(DECAY, vals.length - 1 - i);
    wsum += Number(s[key]) * weight;
    w += weight;
  });
  return w ? wsum / w : null;
}

/** Среднее по сезону (для сравнения формы с базой). */
export function seasonMean(series, key = 'overall') {
  const vals = (series || []).map((s) => Number(s?.[key])).filter((v) => v > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Наклон развития (рейтинг за матч): линейная регрессия. >0 — растёт. */
export function trajectorySlope(series, key = 'overall') {
  const pts = (series || [])
    .map((s, i) => [i, Number(s?.[key])])
    .filter((p) => p[1] > 0);
  if (pts.length < MIN_TREND_MATCHES) return null;
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const d = n * sxx - sx * sx;
  if (!d) return null;
  return (n * sxy - sx * sy) / d;
}

/** Горячая/холодная серия относительно личного среднего. */
export function streak(series, key = 'overall') {
  const vals = (series || []).filter((s) => Number(s?.[key]) > 0).map((s) => Number(s[key]));
  if (vals.length < MIN_TREND_MATCHES) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  let count = 0;
  let dir = null;
  for (let i = vals.length - 1; i >= 0; i--) {
    const above = vals[i] >= avg;
    if (dir === null) {
      dir = above;
      count = 1;
    } else if (above === dir) count++;
    else break;
  }
  if (count < 2) return null;
  return { hot: dir, count };
}
