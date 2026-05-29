import { ratingColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import './TwoWayScatter.css';

/**
 * Scatter «Атака vs Оборона» (player-role plot, в духе StatsBomb): X — рейтинг
 * атаки, Y — рейтинг обороны. Квадранты показывают роли: двусторонние (вправо-
 * вверх), атакующие, оборонительные. Цвет точки — общий рейтинг.
 */
export default function TwoWayScatter({ players }) {
  const pts = (players || [])
    .filter((p) => (p.minutes ?? 0) > 0 && ((p.ratings?.attack || 0) > 0 || (p.ratings?.defence || 0) > 0))
    .map((p) => ({ p, ax: Number(p.ratings?.attack) || 0, dx: Number(p.ratings?.defence) || 0, ov: Number(p.ratings?.overall) || 0 }));
  if (pts.length < 3) return null;

  const W = 440, H = 360, pad = 34;
  const vals = pts.flatMap((p) => [p.ax, p.dx]);
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 0.5));
  const hi = Math.min(10, Math.ceil(Math.max(...vals) + 0.5));
  const span = Math.max(1, hi - lo);
  const mid = (lo + hi) / 2;
  const sx = (v) => pad + ((v - lo) / span) * (W - pad * 2);
  const sy = (v) => (H - pad) - ((v - lo) / span) * (H - pad * 2);

  const ticks = [];
  for (let t = Math.ceil(lo); t <= hi; t += 1) ticks.push(t);

  return (
    <div className="tws-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="tws" role="img" aria-label="Скаттер атака против обороны по игрокам">
        {/* сетка */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sx(t)} y1={pad} x2={sx(t)} y2={H - pad} stroke="rgba(255,255,255,0.05)" />
            <line x1={pad} y1={sy(t)} x2={W - pad} y2={sy(t)} stroke="rgba(255,255,255,0.05)" />
            <text x={sx(t)} y={H - pad + 14} textAnchor="middle" className="tws__tick">{t}</text>
            <text x={pad - 8} y={sy(t) + 3} textAnchor="end" className="tws__tick">{t}</text>
          </g>
        ))}
        {/* квадранты */}
        <line x1={sx(mid)} y1={pad} x2={sx(mid)} y2={H - pad} stroke="var(--accent-cyan,#22d3ee)" strokeDasharray="3 3" opacity="0.5" />
        <line x1={pad} y1={sy(mid)} x2={W - pad} y2={sy(mid)} stroke="var(--accent-cyan,#22d3ee)" strokeDasharray="3 3" opacity="0.5" />
        <text x={W - pad - 4} y={pad + 12} textAnchor="end" className="tws__quad">двусторонние</text>
        <text x={W - pad - 4} y={H - pad - 6} textAnchor="end" className="tws__quad">атакующие</text>
        <text x={pad + 4} y={pad + 12} textAnchor="start" className="tws__quad">оборонительные</text>
        {/* оси */}
        <text x={W / 2} y={H - 4} textAnchor="middle" className="tws__axis">Атака →</text>
        <text x={10} y={H / 2} textAnchor="middle" className="tws__axis" transform={`rotate(-90 10 ${H / 2})`}>Оборона →</text>
        {/* точки */}
        {pts.map((q, i) => (
          <g key={i}>
            <circle cx={sx(q.ax)} cy={sy(q.dx)} r={6} fill={ratingColor(q.ov)} stroke="#0f1115" strokeWidth="1">
              <title>{`${shortNameFromPlayer(q.p)} — атака ${q.ax.toFixed(1)}, оборона ${q.dx.toFixed(1)}`}</title>
            </circle>
            <text x={sx(q.ax)} y={sy(q.dx) - 9} textAnchor="middle" className="tws__lbl">{shortNameFromPlayer(q.p)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
