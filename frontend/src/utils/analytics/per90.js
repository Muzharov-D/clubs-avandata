/**
 * Нормализация на длину полного матча — базис любого скаут-отчёта. Сырые суммы
 * вводят в заблуждение: вышедший на 20′ и игравший весь матч сравниваются
 * нечестно. Переводим всё в «за полный матч».
 *
 * ВАЖНО: в детском футболе матч короче 90′ (U18/17 — 80, U16/15 — 70, U14 — 60),
 * поэтому базис задаётся параметром `basis` = matchMinutes(год команды). По
 * умолчанию 90 (взрослые / неизвестный возраст), чтобы не ломать старые вызовы.
 */

export const MATCH_MINUTES_DEFAULT = 90;

// Минимум сезонных минут, чтобы попадать в перцентильный пул и получать per-match
// нормировку. Ниже — экстраполяция шумит: вышедший на 26′ с 1 действием давал бы
// «×2.7 за матч» и завышал и свой перцентиль, и планку для остальных.
export const MIN_RANK_MINUTES = 45;

/**
 * Длина полного матча по возрасту команды (год рождения).
 * Категория U = U_ANCHOR − год. Клиент: 2010 = U17 (сезон 2025/26) → ANCHOR=2027.
 * При смене сезона поднять U_ANCHOR на 1.
 *   U18/U17 → 80′ · U16/U15 → 70′ · U14 и младше → 60′.
 */
export function matchMinutes(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1990 || y > 2100) return MATCH_MINUTES_DEFAULT;
  const U_ANCHOR = 2027;
  const u = U_ANCHOR - y;
  if (u >= 17) return 80;
  if (u >= 15) return 70;
  return 60;
}

/** value за полный матч (basis минут). minutes<минимума → null. */
export function per90(value, minutes, minMinutes = 20, basis = MATCH_MINUTES_DEFAULT) {
  const v = Number(value);
  const m = Number(minutes);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m < minMinutes) return null;
  return (v / m) * (Number(basis) || MATCH_MINUTES_DEFAULT);
}

/**
 * Безопасный per-матч: если минут мало — возвращаем сырое значение с флагом raw,
 * чтобы UI мог показать «—» или сырое число вместо пустоты.
 */
export function per90Safe(value, minutes, minMinutes = 20, basis = MATCH_MINUTES_DEFAULT) {
  const p = per90(value, minutes, minMinutes, basis);
  if (p == null) return { value: Number(value) || 0, per90: false };
  return { value: p, per90: true };
}

/** Форматирование per-90 числа: 1–2 знака, сохраняем сигнал у малых величин. */
export function fmtPer90(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString('ru-RU');
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
