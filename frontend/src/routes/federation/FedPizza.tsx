/**
 * FedPizza — перцентильная «пицца» скаут-профиля. Каждый луч = показатель,
 * длина луча = перцентиль (0–100) относительно базы сравнения, цвет — pctColor.
 * Только токены проекта. Лучи без данных рисуются как пустой трек с «—».
 */
import { pctColor, tint } from './fedColors';

export interface PizzaSlice {
  key: string;
  short: string;
  pct: number | null;
  /** Подпись у обода (перцентиль либо «—»). */
  badge: string;
}

interface Props {
  slices: PizzaSlice[];
  size?: number;
}

/** Точка на окружности; deg отсчитывается от верха (−90° = 12 часов) по часовой. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

/** Путь сектора-«пиццы» от центра до радиуса r в угловом диапазоне [a0,a1]. */
function wedge(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export function FedPizza({ slices, size = 320 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 56;
  const n = slices.length;
  const step = 360 / n;
  const gap = n > 1 ? Math.min(2.2, step * 0.12) : 0;
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="fed-pizza" role="img" aria-label="Перцентильный профиль игрока">
      {rings.map((lv, i) => (
        <circle key={i} cx={cx} cy={cy} r={R * lv} fill="none" stroke="var(--border)" strokeWidth={1} opacity={i === rings.length - 1 ? 0.8 : 0.4} />
      ))}

      {slices.map((s, i) => {
        const center = step * i + step / 2;
        const a0 = step * i + gap;
        const a1 = step * (i + 1) - gap;
        const color = pctColor(s.pct);
        const frac = s.pct == null ? 0 : Math.max(0.02, s.pct / 100);
        const [lx, ly] = polar(cx, cy, R + 22, center);
        const anchor = Math.abs(lx - cx) < 12 ? 'middle' : lx > cx ? 'start' : 'end';
        return (
          <g key={s.key}>
            <path d={wedge(cx, cy, R, a0, a1)} fill="var(--bg-surface-2)" opacity={0.5} />
            {s.pct != null && (
              <path d={wedge(cx, cy, R * frac, a0, a1)} fill={tint(color, 78)} stroke={color} strokeWidth={1} strokeLinejoin="round" />
            )}
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="fed-pizza__lbl">
              <tspan x={lx} dy="-0.35em">{s.short}</tspan>
              <tspan x={lx} dy="1.15em" className="fed-pizza__val" fill={s.pct == null ? 'var(--text-faint)' : color}>{s.badge}</tspan>
            </text>
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={2.5} fill="var(--border-strong)" />
    </svg>
  );
}
