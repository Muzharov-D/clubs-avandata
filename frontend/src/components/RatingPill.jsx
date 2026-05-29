import { ratingColor, ratingTextColor } from '../utils/colors';
import './RatingPill.css';

export default function RatingPill({ value, size = 'md' }) {
  const num = Number(value);
  // 0 = «не оценён» → пустое состояние, а не красный пилл «0.0»
  if (value === null || value === undefined || isNaN(num) || num <= 0) {
    return <span className={`rating-pill rating-pill--${size} rating-pill--empty`}>—</span>;
  }
  return (
    <span
      className={`rating-pill rating-pill--${size}`}
      style={{ background: ratingColor(num), color: ratingTextColor(num) }}
    >
      {num.toFixed(1)}
    </span>
  );
}
