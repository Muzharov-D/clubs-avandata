/**
 * Продвижение мяча и угроза (xT-стиль, прокси) + packing + xA-прокси +
 * креативность. Координат у нас нет, поэтому это ПРОЗРАЧНЫЕ взвешенные модели
 * из реальных событий продвижения — честно помечаем как оценку.
 */
import { M } from './metrics';

// Добавленная угроза за действие (EPV-подобные веса; вход в опасную зону дороже).
const THREAT_W = {
  keyPass: 0.09,
  intoPenArea: 0.07,
  entriesInBox: 0.06,
  progressiveRun: 0.05,
  progressivePass: 0.035,
  passToFinalThird: 0.03,
  cross: 0.025,
  touchesInPenArea: 0.02,
};

/** xT-прокси: суммарная добавленная угроза игрока за матч. */
export function playerThreat(p) {
  let t = 0;
  for (const [k, w] of Object.entries(THREAT_W)) {
    const get = M[k];
    if (get) t += get(p) * w;
  }
  return t;
}

/** Доля игрока в командной угрозе (0–1). */
export function threatShare(p, squad) {
  const total = (squad || []).reduce((a, x) => a + playerThreat(x), 0);
  if (total <= 0) return null;
  return playerThreat(p) / total;
}

// xA-прокси: ожидаемые ассисты из созидающих передач (ключевые дороже).
const XA_W = { keyPass: 0.13, intoPenArea: 0.05, cross: 0.04, passToFinalThird: 0.012 };

/** xA-прокси игрока. */
export function playerXa(p) {
  let x = 0;
  for (const [k, w] of Object.entries(XA_W)) {
    const get = M[k];
    if (get) x += get(p) * w;
  }
  return x;
}

/** Packing-прокси: пасы и обводки, которые продвинули мяч сквозь линии. */
export function playerPacking(p) {
  return M.passPacking(p) + M.progressiveRun(p) + M.progressivePass(p);
}

/**
 * Индекс креативности: xA-прокси + ключевые + пасы в фин.треть + входы в штрафную.
 * Возвращает сырое значение (нормализацию на 90 делает вызывающий код).
 */
export function creativityIndex(p) {
  return playerXa(p) * 4 + M.keyPass(p) + M.passToFinalThird(p) * 0.4 + M.entriesInBox(p) * 0.6;
}

/** «Машинное отделение»: совмещённый индекс продвижения + отбора мяча. */
export function engineRoomIndex(p) {
  const progression = M.progressivePass(p) + M.progressiveRun(p) + M.passToFinalThird(p);
  const ballWinning = M.tackle(p) + M.interception(p) + M.recovery(p);
  return progression + ballWinning;
}
