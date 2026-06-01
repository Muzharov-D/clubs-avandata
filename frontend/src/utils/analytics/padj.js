/**
 * Possession-adjusted (PAdj) оборона + индекс оборонительной работы.
 *
 * Проблема: команда с меньшим владением физически имеет больше шансов на отбор
 * (мяч чаще у соперника) → её защитники ложно выглядят «активнее». PAdj
 * приводит оборонительные действия к эталону 50% владения соперника.
 */
import { M } from './metrics';

/**
 * Множитель PAdj по нашему владению (%). Соперник владеет (100−наше).
 * Эталон — 50% владения соперника. Доминируем мячом → редкие оборонительные
 * действия ценнее (инфляция); сидим в обороне → дефляция.
 */
export function padjFactor(ourPossessionPct) {
  const our = Number(ourPossessionPct);
  const oppPoss = Math.max(5, Math.min(95, 100 - (Number.isFinite(our) ? our : 50)));
  return 50 / oppPoss;
}

const DEF_ACTIONS = ['tackle', 'interception', 'recovery', 'clearance', 'blockedShot'];

/** Сырой объём оборонительной работы игрока. */
export function defensiveWorkload(p) {
  return DEF_ACTIONS.reduce((a, k) => a + (M[k] ? M[k](p) : 0), 0);
}

/** PAdj-оборонительная работа: объём × множитель владения. */
export function padjWorkload(p, ourPossessionPct) {
  return defensiveWorkload(p) * padjFactor(ourPossessionPct);
}

/** PAdj отдельной оборонительной метрики. */
export function padj(value, ourPossessionPct) {
  return (Number(value) || 0) * padjFactor(ourPossessionPct);
}
