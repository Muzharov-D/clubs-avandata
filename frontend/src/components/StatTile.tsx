/**
 * StatTile — glassmorphism KPI-карточка для дашборда клуба.
 *
 * Используется в сетке 4×N: владение / удары / xG / передачи / угловые / etc.
 *
 * Визуал:
 *  - стекло (rgba blur), мягкое свечение с accent-цветом слева
 *  - крупное значение (32px), мелкая подпись сверху, опциональный delta-badge
 *  - hover-эффект: scale + усиление glow
 */
import './StatTile.css';
// @ts-ignore — legacy .js hook
import { useCountUp } from '../hooks/useReveal';

export type AccentColor = 'cyan' | 'gold' | 'red' | 'green' | 'violet' | 'muted';
export type DeltaSign = 'up' | 'down' | 'neutral';

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  extra?: string;
  delta?: { sign: DeltaSign; text: string };
  accent?: AccentColor;
  big?: boolean;
}

/** Значение с count-up анимацией для числовых KPI (xG «2.20» → 2 знака). */
function StatValue({ value }: { value: string | number }) {
  const raw = String(value);
  const isNumeric = /^-?\d+(\.\d+)?$/.test(raw);
  const decimals = isNumeric && raw.includes('.') ? raw.split('.')[1].length : 0;
  const animated = useCountUp(isNumeric ? Number(value) : 0, 900, decimals) as number;
  return <span className="stat-tile__value">{isNumeric ? animated.toFixed(decimals) : value}</span>;
}

const ACCENT_RGB: Record<AccentColor, string> = {
  cyan:   '34, 211, 238',
  gold:   '250, 204, 21',
  red:    '239, 68, 68',
  green:  '34, 197, 94',
  violet: '168, 85, 247',
  muted:  '148, 163, 184',
};

export function StatTile({ label, value, unit, extra, delta, accent = 'cyan', big = false }: Props) {
  const rgb = ACCENT_RGB[accent];
  return (
    <div
      className={`stat-tile${big ? ' stat-tile--big' : ''}`}
      style={{
        ['--st-accent' as string]: `rgb(${rgb})`,
        ['--st-accent-soft' as string]: `rgba(${rgb}, 0.18)`,
        ['--st-accent-edge' as string]: `rgba(${rgb}, 0.5)`,
      }}
    >
      <div className="stat-tile__glow" aria-hidden />
      <div className="stat-tile__top">
        <span className="stat-tile__label">{label}</span>
        {delta && (
          <span className={`stat-tile__delta stat-tile__delta--${delta.sign}`}>
            {delta.sign === 'up' ? '↑' : delta.sign === 'down' ? '↓' : '•'} {delta.text}
          </span>
        )}
      </div>
      <div className="stat-tile__value-row">
        <StatValue value={value} />
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </div>
      {extra && <div className="stat-tile__extra">{extra}</div>}
    </div>
  );
}
