/**
 * Нормализация на 90 минут — базис любого профессионального скаут-отчёта.
 * Сырые суммы вводят в заблуждение: вышедший на 20′ и игравший весь матч
 * сравниваются нечестно. per-90 переводит всё в «за полный матч».
 */

/** value за 90 минут. minutes<минимума → null (слишком мало для надёжной оценки). */
export function per90(value, minutes, minMinutes = 20) {
  const v = Number(value);
  const m = Number(minutes);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m < minMinutes) return null;
  return (v / m) * 90;
}

/**
 * Безопасный per-90: если минут мало — возвращаем сырое значение с флагом raw,
 * чтобы UI мог показать «—/90» или сырое число вместо пустоты.
 */
export function per90Safe(value, minutes, minMinutes = 20) {
  const p = per90(value, minutes, minMinutes);
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
