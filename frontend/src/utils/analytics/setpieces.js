/**
 * Эффективность стандартов: угловые/штрафные/ауты из teamAggregates.setPieces
 * + связь с ударами. Прокси-модель угрозы стандартов (без координат подачи).
 */
import { num } from '../num';

function pick(obj, key) {
  const v = obj?.[key];
  if (v == null) return null;
  if (typeof v === 'object') return num(v.value ?? v.total ?? v.pct);
  return Number(v);
}

/** Сводка стандартов команды. */
export function setPieceSummary(match) {
  const sp = match?.teamAggregates?.setPieces;
  if (!sp) return null;
  const corners = pick(sp, 'corners');
  const freeKicks = pick(sp, 'freeKicks');
  const throwIns = pick(sp, 'throwIns');
  const penalty = pick(sp, 'penalty');
  const offsides = pick(sp, 'offsides');
  const any = [corners, freeKicks, throwIns, penalty].some((x) => x && x > 0);
  if (!any) return null;

  // Прокси-угроза стандартов: угловые и штрафные генерируют ~0.03 xG за подачу.
  const setPieceXg = (corners || 0) * 0.03 + (freeKicks || 0) * 0.025;
  return { corners, freeKicks, throwIns, penalty, offsides, setPieceXg };
}
