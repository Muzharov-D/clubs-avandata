/**
 * Цвет рейтинга ИГРОКА (шкала 0–10) = смысл (отлично-зелёный → плохо-красный).
 * Порт utils/colors.js клубного фронта на токены федерации (--av-rating-*).
 * Только для рейтингов игроков 0–10; клубные очки (тысячи) — отдельная шкала.
 */
export function ratingColor(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'var(--av-rating-none)';
  const n = Number(value);
  if (n <= 0) return 'var(--av-rating-none)';
  if (n >= 9.0) return 'var(--av-rating-excellent)';
  if (n >= 8.0) return 'var(--av-rating-good)';
  if (n >= 7.0) return 'var(--av-rating-ok)';
  if (n >= 6.0) return 'var(--av-rating-weak)';
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
/** Цвет-смысл по СЫРОМУ рейтингу: нормализуем в 0–10, затем тот же ratingColor. */
export const rating10Color = (raw: number | null | undefined): string => ratingColor(rating10(raw));
