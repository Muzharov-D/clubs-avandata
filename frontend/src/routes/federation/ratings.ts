/**
 * Цвет-смысл рейтинга AvanData по АБСОЛЮТНОЙ шкале (раз показываем абсолют — и красим
 * по абсолюту, не по нормализованным 0–10). Порог зелёного — 400 (директива владельца:
 * «всё выше 400 уже зелёное»). Принимает СЫРОЙ рейтинг.
 *  ≥400 — зелёное · 300–399 — жёлтое · 200–299 — янтарь · <200 — красное.
 * Клубные суммы (десятки тысяч) всегда ≥400 → зелёные (отдельной семантики у них нет).
 */
export function ratingColor(raw: number | null | undefined): string {
  if (raw == null || Number.isNaN(Number(raw))) return 'var(--av-rating-none)';
  const n = Number(raw);
  if (n <= 0) return 'var(--av-rating-none)';
  if (n >= 400) return 'var(--av-rating-excellent)';
  if (n >= 300) return 'var(--av-rating-ok)';
  if (n >= 200) return 'var(--av-rating-weak)';
  return 'var(--av-rating-poor)';
}

/**
 * Нормализация СЫРОГО рейтинга AvanData в 0–10 — ТОЛЬКО для выбора цвета-смысла
 * (ratingColor). Само ЧИСЛО на экране показываем АБСОЛЮТНЫМ (ratingLabel) — рейтинг
 * AvanData это методика продукта, его не «причёсываем». raw ≈ 200–900 ⇒ /100 для порога.
 */
const RAW_TO_TEN = 100;
export function rating10(raw: number | null | undefined): number | null {
  if (raw == null || Number.isNaN(raw)) return null;
  const n = Number(raw);
  if (n <= 0) return null;
  // Уже на шкале 0–10 (на случай, если источник сменит методику) — не делим.
  const ten = n > 20 ? n / RAW_TO_TEN : n;
  return Math.round(ten * 10) / 10;
}
/**
 * Подпись рейтинга — АБСОЛЮТНОЕ значение методики AvanData (НЕ нормируем!).
 * Показываем как есть, с разделением разрядов: 830, 12 480, хоть миллиард. «—» если нет.
 */
export const ratingLabel = (raw: number | null | undefined): string => {
  if (raw == null || Number.isNaN(Number(raw))) return '—';
  const n = Number(raw);
  if (n <= 0) return '—';
  return Math.round(n).toLocaleString('ru-RU');
};
/** Цвет-смысл по СЫРОМУ рейтингу — абсолютная шкала (тот же ratingColor, без деления на 100). */
export const rating10Color = ratingColor;
