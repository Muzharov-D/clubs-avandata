/**
 * Sparkline — лёгкий SVG line-chart для тренда рейтинга / xG / любых метрик
 * по последним N матчам. Безз зависимостей.
 *
 * Props:
 *   values  — массив чисел (от старого к новому)
 *   width / height — pixel sizing (дефолт 100×28)
 *   color   — цвет линии
 *   fill    — флаг рисовать заливку под линией
 *   showLast — выводить ли последнюю точку маркером
 */
import { useId } from 'react';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  showLast?: boolean;
}

export function Sparkline({
  values,
  width = 100,
  height = 28,
  color = 'var(--brand-primary)',
  fill = true,
  showLast = true,
}: Props) {
  // Стабильный id градиента (хук — до любых return): иначе Math.random в рендере
  // плодил новый id каждый кадр → утечка <defs> и фликер заливки.
  const reactId = useId();
  if (!values || values.length === 0) return null;
  const xs = values.length;
  if (xs === 1) {
    // Один матч — рисуем точку
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <circle cx={width / 2} cy={height / 2} r={3} fill={color} />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.001, max - min);
  const stepX = width / (xs - 1);
  const padY = 3;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const fillPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1]!;

  const gradId = `sl-grad-${reactId}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={fillPath} fill={`url(#${gradId})`} />}
      <path d={linePath} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {showLast && <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />}
    </svg>
  );
}
