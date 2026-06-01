/**
 * Перцентили против ОСМЫСЛЕННОГО пула: сезонный позиционный пул вместо 11–17
 * случайных партнёров одного матча. Это стандарт скаутинга — нападающего
 * сравнивать с нападающими, а не с вратарём.
 */
import { percentileRank } from '../num';
import { positionGroup } from '../pizzaTemplates';

/** Тонкая обёртка над percentileRank (0–100 или null при пуле <2). */
export function percentile(value, pool, inverse = false) {
  return percentileRank(value, pool, inverse);
}

/**
 * Сезонный позиционный пул значений по геттеру.
 * seasonPlayers — из /players/season (плоские поля: goals, tackle, minutes, …).
 * getter — (seasonPlayer) => number. Фильтр по позиционной группе субъекта.
 */
export function positionalPool(subjectPlayer, seasonPlayers, getter, { samePositionOnly = true } = {}) {
  const grp = positionGroup(subjectPlayer);
  const list = (seasonPlayers || []).filter((sp) => {
    if (!samePositionOnly || !grp) return true;
    return positionGroup(sp) === grp;
  });
  // Если позиционный пул слишком мал — расширяем до всей команды.
  const pool = list.length >= 4 ? list : seasonPlayers || [];
  return pool.map(getter);
}

/**
 * Перцентиль субъекта по сезонному позиционному пулу.
 * Возвращает { pct, poolSize, scope: 'position'|'team'|null }.
 */
export function seasonPercentile(subject, seasonPlayers, getterSeason, subjectValue, inverse = false) {
  const grp = positionGroup(subject);
  const posList = (seasonPlayers || []).filter((sp) => grp && positionGroup(sp) === grp);
  const usePos = posList.length >= 4;
  const list = usePos ? posList : seasonPlayers || [];
  const pool = list.map(getterSeason);
  const pct = percentileRank(subjectValue, pool, inverse);
  return { pct, poolSize: list.length, scope: pct == null ? null : usePos ? 'position' : 'team' };
}

/** Каллаут «выделяется / тревога» по перцентилю. */
export function callout(pct, label) {
  if (pct == null) return null;
  if (pct >= 85) return { kind: 'standout', tone: 'positive', text: `Топ по «${label}» (${pct}-й перцентиль)` };
  if (pct <= 15) return { kind: 'concern', tone: 'negative', text: `Проседает по «${label}» (${pct}-й перцентиль)` };
  return null;
}
