/**
 * Цвета метрик кабинета федерации — ТОЛЬКО токены проекта (styles/index.css).
 * Никаких Material-хексов (#2e7d32 и т.п.): они ломали единство с клубным UI.
 */

/** Здоровье метрики 0–100 (охват данными / полнота паспортизации / согласие). */
export function healthColor(pct: number | null): string {
  if (pct == null) return 'var(--border-strong)';
  if (pct >= 80) return 'var(--success)';
  if (pct >= 50) return 'var(--warning)';
  return 'var(--danger)';
}

/** Цвет индекса эффективности 0–10. */
export function ratingColor(v: number | null): string {
  if (v == null) return 'var(--text-faint)';
  if (v >= 7) return 'var(--success)';
  if (v >= 6) return 'var(--accent-cyan)';
  if (v >= 5) return 'var(--warning)';
  return 'var(--danger)';
}

/**
 * Цвет перцентиля 0–100 (место игрока в пуле сравнения). Скаут-шкала:
 * чем выше игрок относительно сверстников — тем «теплее» к успеху.
 *  ≥75 элита · 50–74 выше среднего · 25–49 ниже среднего · <25 слабая зона.
 */
export function pctColor(pct: number | null): string {
  if (pct == null) return 'var(--text-faint)';
  if (pct >= 75) return 'var(--success)';
  if (pct >= 50) return 'var(--accent-cyan)';
  if (pct >= 25) return 'var(--warning)';
  return 'var(--danger)';
}

/** Мягкая заливка под цвет (для пилюль рейтинга). */
export function tint(color: string, pct = 16): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
