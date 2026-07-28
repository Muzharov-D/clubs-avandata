// Lite-каталог метрик: по 6 осей на линию, из них 3 — фокус.
//
// ПОЧЕМУ ТАК. Тренеры просят «три показателя на позицию». Три слайса в пицце
// вырождаются в треугольник и теряют узнаваемый силуэт роли, поэтому рисуем 6
// (форма читается), а фокусные 3 подсвечиваем — остальные приглушены как контекст.
//
// ИСТОЧНИК ЗНАЧЕНИЙ — `radar` из match_players (SportVisor), уже нормированный
// индекс 0–10 и заполненный на 100% строк. Тяжёлый разбор по `stats` (28 слайсов
// на позицию, pizzaTemplates.js) остаётся «глубоким» уровнем для эскалации.
//
// Длина слайса = перцентиль внутри своей линии (сравнение со сверстниками),
// подпись на слайсе = сам индекс 0–10 (абсолют). Так «рейтинг остаётся абсолютом»,
// а форма пиццы при этом сопоставима между игроками.

/**
 * Русские подписи осей радара. Без англицизмов (контракт CLAUDE.md).
 *
 * 🔴 ГРАНИЦА НАБОРА: только оси с опорой в БАЗОВЫХ 36 показателях АванДаты.
 * «Интенсивности» и «Объёма бега» здесь нет и быть не должно — это трекинговая
 * физика SportVisor, события такого типа среди 36 не существует.
 * Канон и разбор соответствий — `backend/src/modules/lite/metrics.ts`.
 */
export const AXIS_LABEL = {
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

/** Цветовая группа слайса — переиспользуем палитру PizzaChart. */
const AXIS_GROUP = {
  shooting: 'attack', dribbling: 'attack', forwardPlay: 'attack',
  possession: 'attack', setPiece: 'attack',
  tackling: 'defence', duels: 'defence', positioning: 'defence',
  pressing: 'defence', goalkeeping: 'defence',
};

/**
 * Наборы по линиям. `focus` — три показателя, которые тренер назвал главными
 * для амплуа; `context` — ещё три, чтобы у пиццы была форма.
 * Подбор сверен с позиционными KPI (нападающий: завершение/обводка/игра вперёд;
 * защитник: отбор/единоборства/позиция; полузащитник: владение/передача вперёд/прессинг).
 */
export const LINE_SETS = {
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

export const LINE_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

export const LINE_PLURAL = {
  GK: 'вратарей', DEF: 'защитников', MID: 'полузащитников', FWD: 'нападающих',
};

/**
 * Линия игрока. ЕДИНЫЙ ИСТОЧНИК: группа, посчитанная на бэкенде
 * (`positions[].group` / `posGroupFromCode`) по сумме минут за сезон.
 * Во фронте исторически три разных `lineOf` с расходящимися результатами —
 * здесь сознательно НЕ повторяем их, а доверяем бэкенду.
 */
export function lineOfPlayer(player) {
  const fromPositions = player?.positions?.find((p) => p?.group)?.group;
  if (fromPositions && LINE_SETS[fromPositions]) return fromPositions;
  return null;
}

/** Значение оси радара игрока (0–10) или null. */
export function axisValue(player, key) {
  const v = player?.radar?.[key];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Перцентиль значения внутри пула сверстников (0–100).
 * Доля тех, кто строго слабее + половина равных — устойчивее к «полке» одинаковых.
 */
export function percentileOf(value, pool) {
  const vals = pool.filter((n) => Number.isFinite(n));
  if (!vals.length || !Number.isFinite(value)) return 0;
  let below = 0, equal = 0;
  for (const v of vals) { if (v < value) below += 1; else if (v === value) equal += 1; }
  return Math.round(((below + equal / 2) / vals.length) * 100);
}

/**
 * Слайсы Lite-пиццы для игрока.
 * @param player  игрок из /data/players/season
 * @param peers   игроки той же линии (включая самого) — пул для перцентиля
 * @returns {{slices: Array, line: string|null, poolSize: number}}
 */
export function liteSlices(player, peers) {
  const line = lineOfPlayer(player);
  if (!line) return { slices: [], line: null, poolSize: 0 };
  const set = LINE_SETS[line];
  const keys = [...set.focus, ...set.context];
  const slices = keys.map((key) => {
    const val = axisValue(player, key);
    const pool = peers.map((p) => axisValue(p, key)).filter((n) => n != null);
    const pct = val == null ? 0 : percentileOf(val, pool);
    return {
      key,
      axis: AXIS_LABEL[key] ?? key,
      group: AXIS_GROUP[key] ?? 'attack',
      value: pct,                                   // длина слайса — перцентиль
      displayValue: val == null ? '—' : val.toFixed(1), // подпись — абсолютный индекс
      raw: val,
      muted: !set.focus.includes(key),              // контекстные оси приглушены
    };
  });
  return { slices, line, poolSize: peers.length };
}

/**
 * Короткий словесный вывод — то, что тренер читает вместо чисел
 * (контракт CLAUDE.md: «тренеру нужен словесный вывод, а не сырое число»).
 */
export function verdictOf(slices) {
  const rated = slices.filter((s) => s.raw != null);
  if (rated.length < 2) return null;
  const sorted = [...rated].sort((a, b) => b.value - a.value);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const strong = best.axis.toLowerCase();
  const weak = worst.axis.toLowerCase();
  if (best.value - worst.value < 15) {
    return { text: 'Ровный профиль без явных перепадов', strong: null, weak: null };
  }
  return {
    text: `Сильнее всего — ${strong}. Точка роста — ${weak}.`,
    strong: best.key,
    weak: worst.key,
  };
}
