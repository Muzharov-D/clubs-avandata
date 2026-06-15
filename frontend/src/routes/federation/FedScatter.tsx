/**
 * FedScatter — квадрант-диаграмма на токенах. Ось X = результат, ось Y = развитие;
 * делители в (xMid,yMid) режут поле на 4 зоны с подписями. Точки красятся по зоне.
 * Рисует только точки с числовыми x/y (клубы без данных фильтрует вызывающий).
 */
export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
}

interface Props {
  points: ScatterPoint[];
  xMax: number;
  yMax: number;
  xMid: number;
  yMid: number;
  xLabel: string;
  yLabel: string;
  /** Подписи зон: tr=верх-право, tl=верх-лево, br=низ-право, bl=низ-лево. */
  quad: { tr: string; tl: string; br: string; bl: string };
}

const QUAD_COLOR = {
  tr: 'var(--success)',
  tl: 'var(--accent-cyan)',
  br: 'var(--warning)',
  bl: 'var(--text-faint)',
} as const;

export function FedScatter({ points, xMax, yMax, xMid, yMid, xLabel, yLabel, quad }: Props) {
  const W = 460;
  const H = 320;
  const padL = 44;
  const padR = 16;
  const padT = 26;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const px = (x: number) => padL + (Math.max(0, Math.min(x, xMax)) / xMax) * plotW;
  const py = (y: number) => padT + plotH - (Math.max(0, Math.min(y, yMax)) / yMax) * plotH;
  const zoneOf = (x: number, y: number): keyof typeof QUAD_COLOR =>
    x >= xMid ? (y >= yMid ? 'tr' : 'br') : (y >= yMid ? 'tl' : 'bl');

  const midX = px(xMid);
  const midY = py(yMid);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} className="fed-scatter" role="img" aria-label="Матрица победа против развития">
      {/* рамка поля */}
      <rect x={padL} y={padT} width={plotW} height={plotH} fill="var(--bg-surface-2)" rx="8" />
      {/* делители квадрантов */}
      <line x1={midX} y1={padT} x2={midX} y2={padT + plotH} stroke="var(--border-strong)" strokeDasharray="3 3" />
      <line x1={padL} y1={midY} x2={padL + plotW} y2={midY} stroke="var(--border-strong)" strokeDasharray="3 3" />
      {/* подписи зон */}
      <text x={padL + plotW - 8} y={padT + 16} textAnchor="end" className="fed-scatter__zone" fill={QUAD_COLOR.tr}>{quad.tr}</text>
      <text x={padL + 8} y={padT + 16} textAnchor="start" className="fed-scatter__zone" fill={QUAD_COLOR.tl}>{quad.tl}</text>
      <text x={padL + plotW - 8} y={padT + plotH - 8} textAnchor="end" className="fed-scatter__zone" fill={QUAD_COLOR.br}>{quad.br}</text>
      <text x={padL + 8} y={padT + plotH - 8} textAnchor="start" className="fed-scatter__zone" fill={QUAD_COLOR.bl}>{quad.bl}</text>
      {/* оси */}
      <text x={padL + plotW / 2} y={H - 8} textAnchor="middle" className="fed-scatter__axis">{xLabel} →</text>
      <text x={14} y={padT + plotH / 2} textAnchor="middle" className="fed-scatter__axis" transform={`rotate(-90 14 ${padT + plotH / 2})`}>{yLabel} →</text>
      {/* точки */}
      {points.map((p, i) => {
        const c = QUAD_COLOR[zoneOf(p.x, p.y)];
        const cx = px(p.x);
        const cy = py(p.y);
        const anchor = cx > padL + plotW - 70 ? 'end' : 'start';
        const dx = anchor === 'end' ? -9 : 9;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={6} fill={c} stroke="var(--bg-surface)" strokeWidth={1.5} />
            <text x={cx + dx} y={cy + 4} textAnchor={anchor} className="fed-scatter__pt">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
