/**
 * Перцентили внутри команды (Phase 2/5 — бенчмарк без данных лиги).
 * percentileRank: какова доля игроков команды, которых данный не превосходит.
 */
export function percentileRank(values, value) {
  const arr = values.filter((v) => Number.isFinite(v));
  if (!arr.length || !Number.isFinite(value)) return null;
  const below = arr.filter((v) => v < value).length;
  const equal = arr.filter((v) => v === value).length;
  return Math.round(((below + equal * 0.5) / arr.length) * 100);
}

/** Цвет перцентиля — семантическая шкала (через CSS-токены, не хардкод). */
export function percentileColor(p) {
  if (p == null) return 'var(--rating-none)';
  if (p >= 80) return 'var(--rating-excellent)';
  if (p >= 60) return 'var(--rating-good)';
  if (p >= 40) return 'var(--rating-ok)';
  if (p >= 20) return 'var(--rating-weak)';
  return 'var(--rating-poor)';
}
