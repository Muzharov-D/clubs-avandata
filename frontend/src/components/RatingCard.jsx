import { ratingColor } from '../utils/colors';
import './RatingCard.css';

export default function RatingCard({ label, value, scaleMax = 10 }) {
  const v = Number(value);
  // 0 трактуем как «не оценён» (бенч / нет данных) — показываем «—»,
  // а не «0.0» с красной заливкой во всю карточку.
  const valid = !isNaN(v) && v > 0;
  const pct = valid ? Math.max(0, Math.min(100, (v / scaleMax) * 100)) : 0;
  const color = valid ? ratingColor(v) : 'var(--rating-none)';
  return (
    <div className="rating-card">
      <div className="rating-card__label">{label}</div>
      <div className="rating-card__value" style={{ color }}>
        {valid ? v.toFixed(1) : '—'}
      </div>
      <div className="rating-card__bar">
        <div className="rating-card__bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
