import { ratingColor, ratingTextColor } from '../utils/colors';
import './RatingPill.css';

export default function RatingPill({ value, size = 'md' }) {
  if (value === null || value === undefined || isNaN(value)) {
    return <span className={`rating-pill rating-pill--${size} rating-pill--empty`}>—</span>;
  }
  const num = Number(value);
  return (
    <span
      className={`rating-pill rating-pill--${size}`}
      style={{ background: ratingColor(num), color: ratingTextColor(num) }}
    >
      {num.toFixed(1)}
    </span>
  );
}
