/**
 * Прессинг команды: объём прессинг-действий и высота линии отбора.
 * Простые сырые счётчики/зоны из агрегатов. PPDA УБРАН целиком — метрика
 * слишком сложная для тренерской трактовки (пасы соперника на оборонительное
 * действие, «меньше = лучше»), её невозможно коротко объяснить.
 */
import { num } from '../num';

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
