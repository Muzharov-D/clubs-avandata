/**
 * Канонические геттеры метрик игрока — единый источник правды о том, ГДЕ в
 * `player.stats` лежит та или иная величина. Все модули аналитики читают данные
 * только отсюда, чтобы при смене shape править одно место.
 *
 * Игрок приходит после `adaptPlayerForLegirus`: есть и raw-группы
 * (`stats.attack/defence/fitness` с compound `{value,total,accuracy,successful}`),
 * и Легирус-shape `attack1..5 / defence1..3 / fitness` (уже скаляры). Для счётных
 * метрик берём стабильный Легирус-shape; для win%/точности — raw compound.
 */
import { num } from '../num';

/** Числовое значение по dotted-path внутри player.stats (через num-нормализацию). */
export function statAt(player, path) {
  if (!player?.stats || !path) return null;
  let cur = player.stats;
  for (const k of path.split('.')) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return num(cur);
}

/**
 * Raw compound метрики `stats[group][key]` → { won, total, accuracy }.
 * Поддерживает обе формы парсера: {value,total,accuracy} и {total,successful,accuracy}.
 * Если accuracy не задан, но есть won+total — считаем сами.
 */
export function compoundAt(player, group, key) {
  const g = player?.stats?.[group];
  const v = g ? g[key] : null;
  if (v == null) return { won: null, total: null, accuracy: null };
  if (typeof v === 'number') return { won: v, total: null, accuracy: null };
  const won = v.successful ?? v.value ?? null;
  const total = v.total ?? null;
  let accuracy = v.accuracy ?? null;
  if (accuracy == null && won != null && total) accuracy = Math.round((Number(won) / Number(total)) * 100);
  return {
    won: won == null ? null : Number(won),
    total: total == null ? null : Number(total),
    accuracy: accuracy == null ? null : Number(accuracy),
  };
}

const g = (path) => (p) => statAt(p, path) ?? 0;

/**
 * M — словарь канонических метрик: имя → (player) => number.
 * Имена стабильны; на них завязаны per-90, перцентили, xG/xT-модели и инсайты.
 */
export const M = {
  minutes: (p) => Number(p?.minutes ?? 0),
  // ── Атака / завершение ──
  goals: g('attack4.goal'),
  shots: g('attack4.shot'),
  byHead: g('attack5.byHead'),
  freeKickShot: g('attack4.freeKickShot'),
  assists: g('attack1.assist'),
  secondAssist: g('attack1.secondAssist'),
  keyPass: g('attack1.keyPass'),
  goalActions: g('attack1.goalActions'),
  // ── Созидание / прогрессия ──
  pass: g('attack2.pass'),
  progressivePass: g('attack2.progressivePass'),
  passToFinalThird: g('attack2.passToFinalThird'),
  intoPenArea: g('attack2.intoPenArea'),
  cross: g('attack2.cross'),
  passPacking: g('attack2.passPacking'),
  progressiveRun: g('attack2.progressiveRun'),
  dribble: g('attack4.dribble'),
  entriesInBox: g('attack5.entriesInBox'),
  touchesInPenArea: g('attack3.touchesInPenArea'),
  receivedPass: g('attack3.receivedPass'),
  passForward: g('attack3.passForward'),
  // ── Оборона ──
  tackle: g('defence1.tackle'),
  interception: g('defence1.interception'),
  recovery: g('defence1.recovery'),
  clearance: g('defence1.clearance'),
  blockedShot: g('defence1.blockedShot'),
  duel: g('defence2.duel'),
  aerialDuel: g('defence2.aerialDuel'),
  pressing: g('defence2.pressing'),
  counterpressing: g('defence2.counterpressing'),
  // ── Вратарь ──
  save: g('defence3.save'),
  shotsAgainst: g('defence3.shotsAgainst'),
  goalKick: g('defence3.goalKick'),
  goalkeeperExits: g('defence3.goalkeeperExits'),
  // ── Физика ──
  totalDistance: g('fitness.totalDistance'),
  sprintDistance: g('fitness.sprintDistance'),
  sprintsCount: g('fitness.sprintsCount'),
  intenseRunning: g('fitness.intenseRunning'),
  speedTop: g('fitness.speed_7plus'),
  hsr: (p) =>
    (statAt(p, 'fitness.speed_4_5_5') ?? 0) +
    (statAt(p, 'fitness.speed_5_5_7') ?? 0) +
    (statAt(p, 'fitness.speed_7plus') ?? 0),
  // ── Производные ──
  goalContrib: (p) => (statAt(p, 'attack4.goal') ?? 0) + (statAt(p, 'attack1.assist') ?? 0),
};

/** Win% дуэлей (won/total) — из raw compound, иначе null. */
export function duelWinPct(player) {
  const c = compoundAt(player, 'defence', 'duel');
  return c.accuracy;
}
export function aerialWinPct(player) {
  const c = compoundAt(player, 'defence', 'aerialDuel');
  return c.accuracy;
}

/** Игрок реально выходил на поле (для фильтрации бенча из перцентилей/моделей). */
export function played(player, minMinutes = 1) {
  return Number(player?.minutes ?? 0) >= minMinutes;
}
