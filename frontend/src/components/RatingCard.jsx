import { ratingColor } from '../utils/colors';
import './RatingCard.css';

export default function RatingCard({ label, value, scaleMax = 10 }) {
  const v = Number(value);
  const valid = !isNaN(v);
  const pct = valid ? Math.max(0, Math.min(100, (v / scaleMax) * 100)) : 0;
  const color = valid ? ratingColor(v) : '#666';
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
