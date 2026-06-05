/**
 * xG-слой: командный xG из SportVisor (доверенное число) + прозрачная
 * per-player xG-МОДЕЛЬ (распределение командного xG по миксу ударов),
 * реализация (G−xG), вероятность исхода из Пуассона и ожидаемые очки (xPTS).
 *
 * Всё, что не пришло напрямую из отчёта, помечается в UI как «модель».
 */
import { num } from '../num';
import { M } from './metrics';

// Защита от битого/устаревшего xG: значение из старых разборов могло содержать
// мусор (схваченный рейтинг игрока ~8.3). xG команды за матч физически не бывает
// выше ~6 даже у взрослых — такое значение считаем недостоверным.
const MAX_PLAUSIBLE_TEAM_XG = 6;

/** Командный xG нужной стороны из teamSummaryStats (битые значения → null). */
export function teamXg(match, side /* 'home'|'away' */) {
  const v = num(match?.teamSummaryStats?.[side]?.expectedGoals);
  if (v == null || v > MAX_PLAUSIBLE_TEAM_XG) return null;
  return v;
}

/** Наша / соперника сторона по ориентации матча. */
export function ourSideKey(match) {
  const homeIsUs = match?.homeTeam?.isOurTeam ?? !match?.awayTeam?.isOurTeam;
  return { our: homeIsUs ? 'home' : 'away', opp: homeIsUs ? 'away' : 'home' };
}

/** Реализация: фактические голы минус ожидаемые. >0 — перебили (класс/везение). */
export function finishing(goals, xg) {
  const g = Number(goals);
  const x = Number(xg);
  if (!Number.isFinite(g) || !Number.isFinite(x)) return null;
  return g - x;
}

/** xG на удар — качество моментов. */
export function xgPerShot(xg, shots) {
  const x = Number(xg);
  const s = Number(shots);
  if (!Number.isFinite(x) || !s) return null;
  return x / s;
}

// ── per-player xG-модель ────────────────────────────────────────────────────
// Эвристические веса xG/удар по типу момента (координат удара в данных нет):
// открытая игра ~0.11, головой ~0.09, со штрафного ~0.06. Грубая оценка по
// типу/объёму ударов, НЕ координатная xG-модель — отсюда подача «прокси/оценка».
const XG_W = { open: 0.11, head: 0.09, freeKick: 0.06 };

/** Сырой модельный xG игрока по миксу ударов (до калибровки). */
export function rawPlayerXg(p) {
  const shots = M.shots(p);
  const head = M.byHead(p);
  const fk = M.freeKickShot(p);
  const open = Math.max(0, shots - head - fk);
  return open * XG_W.open + head * XG_W.head + fk * XG_W.freeKick;
}

/**
 * Карта playerId → { xg, calibrated }. Сумма модельных xG состава калибруется к
 * РЕАЛЬНОМУ командному xG из отчёта — так per-player xG не выдуман, а честно
 * распределяет доверенное командное число по объёму и типу ударов.
 */
export function playerXgModel(players, teamActualXg) {
  const raw = (players || []).map((p) => ({ id: p.id, xg: rawPlayerXg(p) }));
  const sum = raw.reduce((a, x) => a + x.xg, 0);
  const actual = Number(teamActualXg);
  let scale = 1;
  let calibrated = false;
  if (sum > 0 && Number.isFinite(actual) && actual > 0) {
    scale = actual / sum;
    calibrated = true;
  }
  const map = new Map();
  raw.forEach((x) => map.set(x.id, { xg: x.xg * scale, calibrated }));
  return map;
}

// ── Вероятность исхода и ожидаемые очки ─────────────────────────────────────
function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

/**
 * Вероятности победы/ничьей/поражения из двух xG (независимые Пуассоны).
 * Модель — не предсказание, а «насколько по моментам заслужен исход».
 */
export function winProbFromXg(xgFor, xgAgainst, maxGoals = 9) {
  const a = Math.max(0, Number(xgFor) || 0);
  const b = Math.max(0, Number(xgAgainst) || 0);
  if (a === 0 && b === 0) return { win: 0, draw: 1, loss: 0 };
  let win = 0;
  let draw = 0;
  let loss = 0;
  for (let i = 0; i <= maxGoals; i++) {
    const pi = poissonPmf(i, a);
    for (let j = 0; j <= maxGoals; j++) {
      const p = pi * poissonPmf(j, b);
      if (i > j) win += p;
      else if (i === j) draw += p;
      else loss += p;
    }
  }
  const s = win + draw + loss || 1;
  return { win: win / s, draw: draw / s, loss: loss / s };
}

/** Ожидаемые очки (xPTS) из xG: 3·P(win) + 1·P(draw). */
export function expectedPoints(xgFor, xgAgainst) {
  const { win, draw } = winProbFromXg(xgFor, xgAgainst);
  return 3 * win + 1 * draw;
}

/**
 * «Заслуженный счёт» — округлённые xG обеих сторон + вердикт vs фактический счёт.
 * luck >0 — повезло (взяли больше, чем наиграли), <0 — недобрали.
 */
export function deservedResult({ xgFor, xgAgainst, goalsFor, goalsAgainst }) {
  const xf = Number(xgFor);
  const xa = Number(xgAgainst);
  if (!Number.isFinite(xf) || !Number.isFinite(xa)) return null;
  const xp = expectedPoints(xf, xa);
  let actualPts = null;
  if (Number.isFinite(Number(goalsFor)) && Number.isFinite(Number(goalsAgainst))) {
    actualPts = goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0;
  }
  const luck = actualPts == null ? null : actualPts - xp;
  return {
    deservedFor: Math.round(xf),
    deservedAgainst: Math.round(xa),
    xPoints: xp,
    actualPoints: actualPts,
    luck,
  };
}
