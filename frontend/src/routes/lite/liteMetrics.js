// Lite — подготовка данных для пиццы и словесный вывод.
//
// ВАЖНО: каталог осей сюда БОЛЬШЕ НЕ ДУБЛИРУЕТСЯ. Оси, подписи, значения и
// перцентили считает сервер (`GET /lite/squad/:age`, модуль backend/modules/lite),
// и ровно те же числа он отдаёт игроку. Раньше здесь лежала копия каталога, и
// именно в ней жила «Интенсивность» — показатель, которого среди базовых 36 нет.
//
// Здесь осталось только то, что относится к отображению: раскладка состава по
// линиям и фраза-вывод под профилем.

export const LINE_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

export const LINE_LABEL = {
  GK: 'Вратарь', DEF: 'Защитник', MID: 'Полузащитник', FWD: 'Нападающий',
};

export const LINE_PLURAL = {
  GK: 'вратарей', DEF: 'защитников', MID: 'полузащитников', FWD: 'нападающих',
};

/**
 * Слайсы игрока → формат PizzaChart.
 * Длина слайса — место среди своей линии (перцентиль), подпись на слайсе —
 * само значение за матч. Контекстные оси приглушены, три главных ярко.
 */
export function toPizzaSlices(slices) {
  return (slices ?? []).map((s) => ({
    key: s.key,
    axis: s.label,
    group: s.group,
    value: s.percentile,
    displayValue: Number(s.value).toFixed(1),
    raw: Number(s.value),
    average: Number(s.average ?? 0),
    muted: !s.focus,
  }));
}

/**
 * Короткий словесный вывод — то, что тренер читает вместо чисел
 * (контракт CLAUDE.md: «тренеру нужен словесный вывод, а не сырое число»).
 * Сравниваем по месту среди своих, а не по абсолюту: два удара за матч у
 * защитника и у нападающего значат разное.
 */
export function verdictOf(slices) {
  const rated = (slices ?? []).filter((s) => Number.isFinite(Number(s.value)));
  if (rated.length < 2) return null;
  const sorted = [...rated].sort((a, b) => b.percentile - a.percentile);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.percentile - worst.percentile < 15) {
    return { text: 'Ровный профиль без явных перепадов', strong: null, weak: null };
  }
  return {
    text: `Сильнее всего — ${best.label.toLowerCase()}. Точка роста — ${worst.label.toLowerCase()}.`,
    strong: best.key,
    weak: worst.key,
  };
}
