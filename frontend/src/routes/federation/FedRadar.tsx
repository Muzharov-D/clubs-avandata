/**
 * FedRadar — компактный N-осевой радар рейтинга (0–10) на токенах проекта.
 * Используется для профиля качества региона и профилей игроков/клубов.
 * Никаких хардкод-цветов: сетка — var(--border), заливка — от переданного color.
 */
export interface RadarAxis {
  label: string;
  value: number | null;
}

interface Props {
  data: RadarAxis[];
  size?: number;
  max?: number;
  /** Цвет линии/точек (токен). Заливка — он же через color-mix. */
  color?: string;
}

export function FedRadar({ data, size = 230, max = 10, color = 'var(--accent-cyan)' }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40; // запас под подписи
  const n = data.length;
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180;
  const at = (i: number, rad: number): [number, number] => [cx + Math.cos(ang(i)) * rad, cy + Math.sin(ang(i)) * rad];
  const poly = (rad: number) => data.map((_, i) => at(i, rad).map((v) => v.toFixed(1)).join(',')).join(' ');

  const levels = [0.25, 0.5, 0.75, 1];
  const dataPts = data.map((d, i) => at(i, (Math.max(0, Math.min(d.value ?? 0, max)) / max) * r));
  const dataPoly = dataPts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="fed-radar" role="img" aria-label="Профиль рейтинга">
      {levels.map((lv, idx) => (
        <polygon key={idx} points={poly(r * lv)} fill="none" stroke="var(--border)" strokeWidth={1} opacity={idx === levels.length - 1 ? 0.85 : 0.45} />
      ))}
      {data.map((_, i) => {
        const [x, y] = at(i, r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} opacity={0.45} />;
      })}
      <polygon points={dataPoly} fill={`color-mix(in srgb, ${color} 20%, transparent)`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={color} />
      ))}
      {data.map((d, i) => {
        const [x, y] = at(i, r + 20);
        const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fed-radar__lbl">
            {d.label} <tspan className="fed-radar__val">{d.value == null ? '—' : d.value.toFixed(1)}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
