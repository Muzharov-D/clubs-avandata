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
   * Пути в `stats` по порядку: сначала нумерованная секция (там живут реальные
   * числа), потом плоская как запасная. Почему перебор — см. `statAt` в base36.
   */
  paths: readonly string[];
}

/** Все оси, которые кабинет вообще умеет показывать. Ключ = путь в `stats`. */
export const AXES: Record<string, AxisDef> = {
  'attack4.shot':          { label: 'Удары',            group: 'attack',  hint: 'попытки пробить по воротам',           paths: ['attack4.shot', 'attack.shot'] },
  'attack4.dribble':       { label: 'Обводки',          group: 'attack',  hint: 'удачные обыгрыши один в один',         paths: ['attack4.dribble', 'attack.dribble'] },
  'attack1.keyPass':       { label: 'Создание момента', group: 'attack',  hint: 'передачи, после которых партнёр бьёт', paths: ['attack1.keyPass', 'attack.keyPass'] },
  'attack.passOnTarget':   { label: 'Точные передачи',  group: 'attack',  hint: 'передачи, дошедшие до своего',         paths: ['attack.passOnTarget'] },
  'attack5.corner':        { label: 'Угловые',          group: 'attack',  hint: 'подачи с углового',                    paths: ['attack5.corner', 'attack.corner'] },
  'defence2.pressing':     { label: 'Прессинг',         group: 'defence', hint: 'давление на соперника с мячом',        paths: ['defence2.pressing', 'defence.pressing'] },
  'defence2.duel':         { label: 'Единоборства',     group: 'defence', hint: 'борьба за мяч один в один',            paths: ['defence2.duel', 'defence.duel'] },
  'defence1.tackle':       { label: 'Отборы',           group: 'defence', hint: 'мяч отобран у соперника',              paths: ['defence1.tackle', 'defence.tackle'] },
  'defence1.interception': { label: 'Перехваты',        group: 'defence', hint: 'передача соперника прервана',          paths: ['defence1.interception', 'defence.interception'] },
  'defence1.clearance':    { label: 'Выносы',           group: 'defence', hint: 'мяч выбит из своей штрафной',          paths: ['defence1.clearance', 'defence.clearance'] },
  'defence1.blockedShot':  { label: 'Блоки',            group: 'defence', hint: 'удар соперника заблокирован',          paths: ['defence1.blockedShot', 'defence.blockedShot'] },
  'defence3.save':         { label: 'Сейвы',            group: 'defence', hint: 'мяч отражён вратарём',                 paths: ['defence3.save', 'defence.save'] },
};

/**
 * По 6 осей на линию: `focus` — три главных для амплуа (они же открыты игроку
 * по умолчанию), `context` — ещё три, чтобы у пиццы читалась форма.
 */
export const LINE_SETS: Record<PosGroup, { label: string; focus: string[]; context: string[] }> = {
  GK: {
    label: 'Вратарь',
    focus: ['defence3.save', 'attack.passOnTarget', 'defence1.clearance'],
    context: ['defence1.blockedShot', 'defence1.interception', 'defence2.duel'],
  },
  DEF: {
    label: 'Защитник',
    focus: ['defence1.tackle', 'defence1.interception', 'defence2.duel'],
    context: ['defence1.clearance', 'defence1.blockedShot', 'attack.passOnTarget'],
  },
  MID: {
    label: 'Полузащитник',
    focus: ['attack.passOnTarget', 'attack1.keyPass', 'defence2.pressing'],
    context: ['defence1.tackle', 'attack4.dribble', 'defence2.duel'],
  },
  FWD: {
    label: 'Нападающий',
    focus: ['attack4.shot', 'attack4.dribble', 'attack1.keyPass'],
    context: ['defence2.pressing', 'defence2.duel', 'attack.passOnTarget'],
  },
};

/** Все шесть осей амплуа в порядке «сначала главные». */
export function axesOfLine(line: PosGroup): string[] {
  return [...LINE_SETS[line].focus, ...LINE_SETS[line].context];
}

/**
 * Что открыто игроку по умолчанию, пока тренер ничего не выбрал, — три главных
 * показателя амплуа. Пустой кабинет игрок бы просто не понял, а полный набор
 * решал бы за тренера.
 */
export function defaultSharedMetrics(line: PosGroup | null): string[] {
  return line ? [...LINE_SETS[line].focus] : [];
}

/**
 * Отсекаем всё, чего нет в шестёрке амплуа: тренер не может открыть ось, которую
 * сам на экране не видел, а битый ключ из старой настройки не должен ломать
 * кабинет игрока. Старые ключи радара (`intensity` и прочие) отсеются здесь же.
 */
export function sanitizeMetrics(raw: unknown, line: PosGroup | null): string[] {
  if (!Array.isArray(raw) || !line) return [];
  const allowed = new Set(axesOfLine(line));
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k === 'string' && allowed.has(k) && !out.includes(k)) out.push(k);
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
 */
export function percentileOf(value: number, pool: number[]): number {
  const vals = pool.filter((n) => Number.isFinite(n));
  if (!vals.length || !Number.isFinite(value)) return 0;
  let below = 0;
  let equal = 0;
  for (const v of vals) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return Math.round(((below + equal / 2) / vals.length) * 100);
}

/** Число «за матч» в подпись: 2.5 — с десятыми, 0 — нулём, не «0.0». */
export function perMatch(total: number, matches: number): number {
  if (!matches) return 0;
  return Number((total / matches).toFixed(1));
}
