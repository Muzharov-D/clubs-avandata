// Конвенция рейтинга (#5): 0 / null / NaN == «не оценён» (бенч), отображается
// серым «—». Это единый контракт по всему UI (RatingPill, RatingCard, lines,
// leaders, FormationField, средние в MatchesDashboard — все фильтруют `<= 0`).
// SportVisor-рейтинги ~4–10, реального 0.x не бывает, поэтому 0=не-оценён
// безопасно и не прячет валидные низкие оценки. Менять на честный null нельзя
// без риска `null.toFixed()` в десятках мест — конвенция выбрана осознанно.
export function ratingColor(value) {
  if (value === null || value === undefined || isNaN(value)) return 'var(--rating-none)';
  const n = Number(value);
  if (n <= 0) return 'var(--rating-none)';   // не оценён → серый
  if (n >= 9.0) return 'var(--rating-excellent)';
  if (n >= 8.0) return 'var(--rating-good)';
  if (n >= 7.0) return 'var(--rating-ok)';
  if (n >= 6.0) return 'var(--rating-weak)';
  return 'var(--rating-poor)';
}

export function ratingTextColor(value) {
  if (value >= 7.0 && value < 8.0) return 'var(--rating-text-dark)';
  return 'var(--rating-text-light)';
}
