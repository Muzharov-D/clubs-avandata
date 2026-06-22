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
 * Рейтинг игрока региона (AvanData) на шкалу кабинета 0–10.
 *
 * `regionPlayers`/`best-xi` отдают СЫРОЙ averageRating — среднее по матчам поля
 * `averageRating` из by-role (avandataSource.regionPlayers: `Math.round(sum/n)`),
 * это целое в сотнях (≈200–900). Кабинет (и `ratingColor`, и клубный фронт)
 * говорит в шкале 0–10: топ региона ≈ 840 сырых ⇒ 8.4. Значит шкала — raw/100.
 * Возвращаем число 0–10 (1 знак) — НИКОГДА не показываем сырые сотни.
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
/** Готовая подпись рейтинга 0–10 (1 знак) или «—». */
export const ratingLabel = (raw: number | null | undefined): string => {
  const t = rating10(raw);
  return t == null ? '—' : t.toFixed(1);
};
/** Цвет-смысл по СЫРОМУ рейтингу: нормализуем в 0–10, затем тот же ratingColor. */
export const rating10Color = (raw: number | null | undefined): string => ratingColor(rating10(raw));
