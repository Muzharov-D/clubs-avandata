/**
 * Momentum по таймам: темп команды в 1-м и 2-м таймах из per-player splits
 * (удары, единоборства, прессинг, передачи). Показывает, где команда поймала
 * волну, а где сдала. Координат/минутных меток нет — два сегмента, честно.
 */

const TEMPO_KEYS = [
  ['Shot', 3],
  ['Key pass', 2],
  ['Duel', 1],
  ['Pressing', 1],
  ['Tackle', 1],
  ['Interception', 1],
];

/** Взвешенный темп по таймам: { first, second, shift } (shift>0 — прибавили во 2-м). */
export function teamMomentum(players) {
  let first = 0;
  let second = 0;
  for (const p of players || []) {
    for (const [key, w] of TEMPO_KEYS) {
      const r = p.splits?.[key];
      if (r) {
        first += (Number(r.first) || 0) * w;
        second += (Number(r.second) || 0) * w;
      }
    }
  }
  const total = first + second;
  if (total <= 0) return null;
  return {
    first,
    second,
    firstShare: first / total,
    secondShare: second / total,
    shift: second - first,
  };
}

/** xG-гонка (прокси): накопленный командный xG по таймам через долю ударов. */
export function xgRace(players, teamXgValue) {
  const xg = Number(teamXgValue);
  if (!Number.isFinite(xg) || xg <= 0) return null;
  let firstShots = 0;
  let secondShots = 0;
  for (const p of players || []) {
    const r = p.splits?.Shot;
    if (r) {
      firstShots += Number(r.first) || 0;
      secondShots += Number(r.second) || 0;
    }
  }
  const total = firstShots + secondShots;
  if (total <= 0) return null;
  const firstXg = xg * (firstShots / total);
  return { first: firstXg, second: xg - firstXg, total: xg };
}
