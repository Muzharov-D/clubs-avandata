/**
 * Каталог показателей кабинета Lite — КАНОН (сервер решает, что видит игрок).
 *
 * Зеркало во фронте: `frontend/src/routes/lite/liteMetrics.js` (там же пицца и
 * словесный вывод для тренера). Ключи и наборы по амплуа обязаны совпадать —
 * при правке менять оба файла. Фильтрация видимости живёт ТОЛЬКО здесь: если бы
 * сервер отдавал всё, а прятал фронт, скрытые числа были бы видны в сети.
 *
 * Источник значений — `radar` из match_players (SportVisor), индекс 0–10,
 * усреднённый по матчам сезона.
 */

import type { PosGroup } from '../../shared/positions.js';

/**
 * Русские подписи осей. Без англицизмов (контракт CLAUDE.md).
 *
 * 🔴 ГРАНИЦА НАБОРА: в Lite попадают только те оси, у которых есть опора в
 * БАЗОВЫХ 36 ПОКАЗАТЕЛЯХ АванДаты (живой каталог `/event-types`, ровно 36 штук).
 * Поэтому здесь НЕТ «Интенсивности» и «Объёма бега»: это трекинговая физика
 * SportVisor, события такого типа в 36 не существует. Владелец поймал именно
 * это — «интенсивность» стояла шестой осью у всех четырёх амплуа.
 *
 * Опора каждой оставшейся оси в 36:
 *   Отбор → «Отбор»; Прессинг → «Прессинг», «Контрпрессинг»;
 *   Обводка → «Дриблинг +/−»; Удары → «Удар», «Удар в створ»;
 *   Владение → «Сохранение мяча под прессингом», «Потеря под прессингом»;
 *   Единоборства → «Опека», «Отбор»; Выбор позиции → «Позиционная ошибка»;
 *   Игра вперёд → «Развитие/Создание голевого момента», «Передача +/−»;
 *   Игра в воротах → «Сейв 20/50/90/150», «Пропущенный гол», «Ошибка вратаря»;
 *   Стандарты → «Угловой удар».
 */
export const AXIS_LABEL: Record<string, string> = {
  goalkeeping: 'Игра в воротах',
  positioning: 'Выбор позиции',
  possession: 'Владение',
  forwardPlay: 'Игра вперёд',
  duels: 'Единоборства',
  tackling: 'Отбор',
  pressing: 'Прессинг',
  dribbling: 'Обводка',
  shooting: 'Удары',
  setPiece: 'Стандарты',
};

/**
 * По 6 осей на линию: `focus` — три главных для амплуа (они же открыты игроку
 * по умолчанию), `context` — ещё три, чтобы у пиццы читалась форма.
 */
export const LINE_SETS: Record<PosGroup, { label: string; focus: string[]; context: string[] }> = {
  GK: {
    label: 'Вратарь',
    // Шестая ось — стандарты: у вратаря это работа на угловых, а не бег.
    focus: ['goalkeeping', 'positioning', 'possession'],
    context: ['forwardPlay', 'duels', 'setPiece'],
  },
  DEF: {
    label: 'Защитник',
    focus: ['tackling', 'duels', 'positioning'],
    context: ['possession', 'forwardPlay', 'pressing'],
  },
  MID: {
    label: 'Полузащитник',
    focus: ['possession', 'forwardPlay', 'pressing'],
    context: ['duels', 'dribbling', 'tackling'],
  },
  FWD: {
    label: 'Нападающий',
    focus: ['shooting', 'dribbling', 'forwardPlay'],
    context: ['pressing', 'duels', 'possession'],
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
 * кабинет игрока.
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

/**
 * Перцентиль значения внутри пула сверстников (0–100). Доля тех, кто строго
 * слабее, плюс половина равных — устойчивее к «полке» одинаковых значений.
 * Повторяет `percentileOf` во фронте: обе стороны обязаны считать одинаково,
 * иначе тренер и игрок увидят разные доли по одному и тому же показателю.
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
