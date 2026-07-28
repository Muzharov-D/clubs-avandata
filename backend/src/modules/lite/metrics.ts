/**
 * Оси кабинета Lite — КАНОН (сервер решает, что и в каком виде видит тренер и игрок).
 *
 * Каждая ось — конкретный счётчик SportVisor, за которым стоит один из БАЗОВЫХ
 * 36 показателей АванДаты (таблица соответствий — `base36.ts`). Раньше оси брались
 * из `radar` — сводных индексов SportVisor («Интенсивность», «Объём бега»), которых
 * среди 36 нет вовсе; владелец поймал именно это.
 *
 * Значение оси — СРЕДНЕЕ ЗА МАТЧ, а не сумма за сезон. Сумма делает лидером того,
 * кто просто чаще выходил, и разговор про игру превращается в разговор про минуты.
 */

import type { PosGroup } from '../../shared/positions.js';
import { BASE36_SV_KEYS } from './base36.js';

export interface AxisDef {
  /** Подпись. Русская, без англицизмов (контракт CLAUDE.md). */
  label: string;
  /** Цветовая группа слайса пиццы. */
  group: 'attack' | 'defence';
  /** Короткое пояснение — что это за действие. Тренеру и особенно игроку. */
  hint: string;
  /**
   * 'total' — считаем ПОПЫТКИ (удары, обводки: тренеру важна активность,
   * а не только результат), иначе — удавшееся действие. См. `statAt`.
   */
  mode?: 'total' | 'value';
  /**
   * «Меньше значит лучше» — фолы, карточки, потери. Длину слайса у таких осей
   * переворачиваем: длиннее обязано означать «лучше», иначе пицца врёт.
   */
  inverse?: boolean;
}

/**
 * Все оси, которые кабинет умеет показывать. Ключ — путь в `stats` (плоская
 * секция: нумерованных в базе нет, их достраивает адаптер одного матча).
 *
 * Здесь ВЕСЬ выбор, из которого тренер собирает свои наборы по амплуа. Каждая
 * ось стоит на одном из базовых 36 (см. `base36.ts`) — иначе в кабинет не идёт.
 * `inverse` — «меньше значит лучше» (фолы, карточки, потери): длина слайса у
 * таких осей переворачивается, чтобы длиннее всегда означало «лучше».
 */
export const AXES: Record<string, AxisDef> = {
  // ── Атака ──────────────────────────────────────────────────────────────
  'attack.shot':           { label: 'Удары',              group: 'attack',  hint: 'попытки пробить по воротам',            mode: 'total' },
  'attack.dribble':        { label: 'Обводки',            group: 'attack',  hint: 'попытки обыграть один в один',          mode: 'total' },
  'attack.keyPass':        { label: 'Создание момента',   group: 'attack',  hint: 'передачи, после которых партнёр бьёт' },
  'attack.secondAssist':   { label: 'Развитие момента',   group: 'attack',  hint: 'передача перед голевой' },
  'attack.pass':           { label: 'Точные передачи',    group: 'attack',  hint: 'передачи, дошедшие до своего' },
  'attack.corner':         { label: 'Угловые',            group: 'attack',  hint: 'подачи с углового' },
  // ── Оборона ────────────────────────────────────────────────────────────
  'defence.tackle':        { label: 'Отборы',             group: 'defence', hint: 'мяч отобран у соперника' },
  'defence.interception':  { label: 'Перехваты',          group: 'defence', hint: 'передача соперника прервана' },
  'defence.duel':          { label: 'Единоборства',       group: 'defence', hint: 'выигранная борьба за мяч' },
  'defence.pressing':      { label: 'Прессинг',           group: 'defence', hint: 'давление на соперника с мячом' },
  'defence.counterpressing': { label: 'Контрпрессинг',    group: 'defence', hint: 'давление сразу после потери' },
  'defence.clearance':     { label: 'Выносы',             group: 'defence', hint: 'мяч выбит из своей штрафной',           mode: 'total' },
  'defence.blockedShot':   { label: 'Блоки',              group: 'defence', hint: 'удар соперника заблокирован' },
  'defence.save':          { label: 'Сейвы',              group: 'defence', hint: 'мяч отражён вратарём' },
  // ── «Меньше — лучше» ───────────────────────────────────────────────────
  'attack.lostBall':       { label: 'Потери под прессингом', group: 'attack', hint: 'мяч потерян под давлением',           inverse: true },
  'attack.loseOnOwnHalf':  { label: 'Потери у своих ворот',  group: 'defence', hint: 'потеря на своей половине поля',      inverse: true },
  'attack.technicalMistake': { label: 'Технический брак',    group: 'attack',  hint: 'ошибка в обработке или передаче',    inverse: true },
  'defence.dribbleAgainst':  { label: 'Обыгран соперником',  group: 'defence', hint: 'соперник прошёл один в один',        inverse: true },
  'attack.offside':        { label: 'Офсайды',            group: 'attack',  hint: 'уход за спину раньше времени',          inverse: true },
  'defence.fouls':         { label: 'Фолы',               group: 'defence', hint: 'нарушения правил',                      inverse: true },
  'defence.yellowCards':   { label: 'Жёлтые карточки',    group: 'defence', hint: 'предупреждения',                        inverse: true },
  'defence.redCards':      { label: 'Красные карточки',   group: 'defence', hint: 'удаления',                              inverse: true },
  'attack.ownGoal':        { label: 'Автоголы',           group: 'attack',  hint: 'мяч в свои ворота',                     inverse: true },
};

/**
 * УМОЛЧАНИЕ по линиям — стартовая точка, а не догма: тренер собирает свои
 * наборы сам (таблица `lite_line_metrics`, миграция 0023). Здесь то, что клуб
 * видит, пока ничего не менял: 6 осей, из них 3 главных.
 */
export const LINE_SETS: Record<PosGroup, { label: string; focus: string[]; context: string[] }> = {
  GK: {
    label: 'Вратарь',
    focus: ['defence.save', 'attack.pass', 'defence.clearance'],
    context: ['defence.blockedShot', 'defence.interception', 'defence.duel'],
  },
  DEF: {
    label: 'Защитник',
    focus: ['defence.tackle', 'defence.interception', 'defence.duel'],
    context: ['defence.clearance', 'defence.blockedShot', 'attack.pass'],
  },
  MID: {
    label: 'Полузащитник',
    focus: ['attack.pass', 'attack.keyPass', 'defence.pressing'],
    context: ['defence.tackle', 'attack.dribble', 'defence.duel'],
  },
  FWD: {
    label: 'Нападающий',
    focus: ['attack.shot', 'attack.dribble', 'attack.keyPass'],
    context: ['defence.pressing', 'defence.duel', 'attack.pass'],
  },
};

/** Все шесть осей амплуа в порядке «сначала главные». */
export function axesOfLine(line: PosGroup): string[] {
  return [...LINE_SETS[line].focus, ...LINE_SETS[line].context];
}

/** Набор амплуа: все оси по порядку + какие из них главные. */
export interface LineSet { axes: string[]; focus: string[] }

/** Границы набора: меньше четырёх — не форма, больше восьми — снова каша. */
export const MIN_AXES = 4;
export const MAX_AXES = 8;
export const MAX_FOCUS = 4;

/** Умолчание для линии в виде набора. */
export function defaultLineSet(line: PosGroup): LineSet {
  return { axes: axesOfLine(line), focus: [...LINE_SETS[line].focus] };
}

/**
 * Проверка набора, пришедшего от тренера. Возвращает null, если набор негоден —
 * молча «починить» его нельзя: тренер должен увидеть, что именно не так.
 */
export function sanitizeLineSet(rawAxes: unknown, rawFocus: unknown): LineSet | null {
  if (!Array.isArray(rawAxes)) return null;
  const axes: string[] = [];
  for (const k of rawAxes) {
    // Ось без опоры в базовых 36 в кабинет не попадает — это и есть граница набора.
    if (typeof k === 'string' && AXES[k] && !axes.includes(k)) axes.push(k);
  }
  if (axes.length < MIN_AXES || axes.length > MAX_AXES) return null;

  const focus: string[] = [];
  if (Array.isArray(rawFocus)) {
    for (const k of rawFocus) {
      if (typeof k === 'string' && axes.includes(k) && !focus.includes(k)) focus.push(k);
    }
  }
  if (focus.length > MAX_FOCUS) return null;
  // Главные не выбраны — берём первые три: пустой фокус оставил бы и пиццу без
  // акцентов, и игрока без открытых по умолчанию показателей.
  return { axes, focus: focus.length ? focus : axes.slice(0, 3) };
}

/**
 * Отсекаем всё, чего нет в наборе амплуа: тренер не может открыть игроку ось,
 * которую сам на экране не видел, а ключ из старой настройки не должен ломать
 * кабинет. Старые ключи радара (`intensity` и прочие) отсеются здесь же.
 */
export function sanitizeMetrics(raw: unknown, allowed: string[]): string[] {
  if (!Array.isArray(raw) || !allowed.length) return [];
  const set = new Set(allowed);
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k === 'string' && set.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** Ось обязана стоять на одном из 36 — иначе она в кабинет не попадает. */
export function axisIsFromBase36(key: string): boolean {
  return BASE36_SV_KEYS.has(key);
}

/**
 * Перцентиль значения внутри пула сверстников (0–100). Доля тех, кто строго
 * слабее, плюс половина равных — устойчивее к «полке» одинаковых значений.
 *
 * У осей «меньше значит лучше» (фолы, потери, карточки) шкалу переворачиваем:
 * длинный слайс обязан означать «лучше», иначе пицца читается наоборот.
 */
export function percentileOf(value: number, pool: number[], inverse = false): number {
  const vals = pool.filter((n) => Number.isFinite(n));
  if (!vals.length || !Number.isFinite(value)) return 0;
  let below = 0;
  let equal = 0;
  for (const v of vals) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  const pct = Math.round(((below + equal / 2) / vals.length) * 100);
  return inverse ? 100 - pct : pct;
}

/** Число «за матч» в подпись: 2.5 — с десятыми, 0 — нулём, не «0.0». */
export function perMatch(total: number, matches: number): number {
  if (!matches) return 0;
  return Number((total / matches).toFixed(1));
}
