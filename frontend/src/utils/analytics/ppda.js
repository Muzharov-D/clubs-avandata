/**
 * Прессинг и PPDA. PPDA = пасы соперника на одно оборонительное действие;
 * НИЖЕ = агрессивнее прессингуем. Значения уже считаются на бэке
 * (teamAggregates.pressing.averagePPDA — наш, passes.oppda — соперника), но
 * нигде не показывались. Здесь — чтение + человеческая интерпретация.
 */
import { num } from '../num';

/**
 * Достоверное PPDA: число > 0 или null. НЕ приводим отсутствие к 0 —
 * иначе карточка показывает ложный «PPDA 0.0». PPDA = пасы соперника на наше
 * оборонительное действие; пасы соперника есть только на pressing-странице
 * ПОЛНОГО PDF. У урезанного экспорта (25 стр.) их нет и из нашего CSV не
 * вывести → честно отдаём null, чип PPDA скрывается, остаётся «прессинг-действий».
 */
function ppdaVal(v) {
  const n = Number(v && typeof v === 'object' ? v.value : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** { ours, opp } PPDA из агрегатов матча (null, если метрики нет). */
export function teamPpda(match) {
  const ta = match?.teamAggregates || {};
  return {
    ours: ppdaVal(ta?.pressing?.averagePPDA),
    opp: ppdaVal(ta?.passes?.oppda),
  };
}

// Маржа, внутри которой считаем интенсивность отбора «на равных».
const PPDA_PARITY = 0.15;

/**
 * Интерпретация прессинга тренерским языком — ОТНОСИТЕЛЬНАЯ: сравниваем наш PPDA
 * с PPDA соперника (одна метрика, один провайдер, одна шкала). Это честно, в
 * отличие от взрослых абсолютных порогов 8/11/15: детская SportVisor-метрика
 * идёт в районе ~3 и под эти пороги не калибрована — абсолютный вердикт всегда
 * выдавал бы «очень высокий прессинг». Ниже PPDA = агрессивнее отбор. Без PPDA
 * соперника абсолютный уровень не выносим (возвращаем null).
 */
export function interpretPpda(ours, opp) {
  const a = Number(ours);
  const b = Number(opp);
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b <= 0) return null;
  if (a <= b * (1 - PPDA_PARITY)) return { level: 'Прессингуем активнее', tone: 'positive', note: 'отбираем мяч выше и быстрее соперника' };
  if (a >= b * (1 + PPDA_PARITY)) return { level: 'Спокойный отбор', tone: 'neutral', note: 'обороняемся компактнее, прессингуем реже соперника' };
  return { level: 'Прессинг на равных', tone: 'neutral', note: 'по интенсивности отбора близко к сопернику' };
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
