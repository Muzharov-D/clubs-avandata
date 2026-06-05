/**
 * Унификация значений stats: SportVisor отдаёт либо скаляр, либо compound-объект
 * {total, successful, accuracy, value}. Эти хелперы используются в сезонных
 * агрегатах (/players/season) и тренде (/player/:id/trend), чтобы не тянуть
 * legirusAdapter (он заточен под per-match форму PlayerDetail).
 */
type AnyObj = Record<string, unknown>;

/** Полезное «успешное/значение» (successful → value → total). */
export function unwrapScalar(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const o = v as AnyObj;
    for (const k of ['successful', 'value', 'total'] as const) {
      const n = o[k];
      if (typeof n === 'number') return n;
    }
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Достаём поле из группы stats (attack/defence/fitness). */
export function statField(stats: unknown, group: 'attack' | 'defence' | 'fitness', key: string): number {
  const g = (stats as AnyObj | null)?.[group] as AnyObj | undefined;
  return unwrapScalar(g?.[key]);
}

/**
 * «Total» компонента для попыточных метрик (удары и т.п.) — сколько было ПОПЫТОК,
 * а не только успешных. Должна совпадать с per-match адаптером (legirusAdapter
 * `aT('shot')` = total), иначе сезонная сумма «Удары» расходится с разбором матча.
 */
export function unwrapTotal(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const t = (v as AnyObj).total;
    if (typeof t === 'number') return t;
    return unwrapScalar(v);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** statField, но берёт total (для попыточных метрик: удары/обводки и т.п.). */
export function statFieldTotal(stats: unknown, group: 'attack' | 'defence' | 'fitness', key: string): number {
  const g = (stats as AnyObj | null)?.[group] as AnyObj | undefined;
  return unwrapTotal(g?.[key]);
}
