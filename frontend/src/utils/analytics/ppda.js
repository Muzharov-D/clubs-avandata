/**
 * Прессинг и PPDA. PPDA = пасы соперника на одно оборонительное действие;
 * НИЖЕ = агрессивнее прессингуем. Значения уже считаются на бэке
 * (teamAggregates.pressing.averagePPDA — наш, passes.oppda — соперника), но
 * нигде не показывались. Здесь — чтение + человеческая интерпретация.
 */
import { num } from '../num';

/** { ours, opp } PPDA из агрегатов матча. */
export function teamPpda(match) {
  const ta = match?.teamAggregates || {};
  return {
    ours: num(ta?.pressing?.averagePPDA),
    opp: num(ta?.passes?.oppda),
  };
}

/** Интерпретация PPDA тренерским языком. */
export function interpretPpda(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const x = Number(v);
  if (x < 8) return { level: 'Очень высокий прессинг', tone: 'positive', note: 'высоко встречаем и не даём сопернику развивать атаки' };
  if (x < 11) return { level: 'Высокий прессинг', tone: 'positive', note: 'агрессивный отбор на чужой половине' };
  if (x < 15) return { level: 'Средний блок', tone: 'neutral', note: 'сбалансированное давление' };
  return { level: 'Низкий блок', tone: 'neutral', note: 'выжидательная оборона, прессинг включается реже' };
}

/** Интенсивность прессинга команды (сумма прессинг-действий состава). */
export function pressingVolume(players) {
  let pressing = 0;
  let counter = 0;
  for (const p of players || []) {
    pressing += statSafe(p, 'defence2', 'pressing');
    counter += statSafe(p, 'defence2', 'counterpressing');
  }
  return { pressing, counterpressing: counter };
}

function statSafe(p, group, key) {
  const v = p?.stats?.[group]?.[key];
  const n = typeof v === 'object' && v ? v.value ?? v.successful ?? v.total : v;
  return Number(n) || 0;
}

/**
 * Высота/агрессия линии обороны (прокси): доля возвратов/отборов в чужой и
 * средней третях. Чем выше — тем выше команда отбирает мяч.
 * Использует recoveriesAndTackling агрегат, если он есть.
 */
export function lineHeight(match) {
  const r = match?.teamAggregates?.recoveriesAndTackling;
  if (!r) return null;
  const first = num(r.inFirstThird?.value ?? r.inFirstThird);
  const second = num(r.inSecondThird?.value ?? r.inSecondThird);
  const third = num(r.inThirdThird?.value ?? r.inThirdThird);
  const total = (first || 0) + (second || 0) + (third || 0);
  if (total <= 0) return null;
  // Доля отборов в средней+чужой третях = высокий отбор.
  const highShare = ((second || 0) + (third || 0)) / total;
  let label = 'Низкая линия';
  if (highShare >= 0.6) label = 'Высокая линия';
  else if (highShare >= 0.4) label = 'Средняя линия';
  return { highShare, label, first, second, third };
}
