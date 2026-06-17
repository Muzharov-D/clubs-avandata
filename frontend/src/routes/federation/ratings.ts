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
