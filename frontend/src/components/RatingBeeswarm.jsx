import { ratingColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import './RatingBeeswarm.css';

/**
 * Beeswarm рейтингов состава (в духе StatsBomb): каждый игрок — точка на шкале
 * 0–10, цвет по оценке, вертикальный джиттер против наложения. Сразу видно
 * «кто горит, кто просел» и насколько плотная команда.
 */
export default function RatingBeeswarm({ players }) {
  const pts = (players || [])
    .filter((p) => (p.minutes ?? 0) > 0 && (p.ratings?.overall ?? 0) > 0)
    .map((p) => ({ p, v: Number(p.ratings.overall) }));
  if (pts.length < 3) return null;

  const W = 560, H = 132, padL = 26, padR = 14, padT = 26, padB = 26;
  const R = 6, gap = 13;
  const x = (v) => padL + (Math.max(0, Math.min(10, v)) / 10) * (W - padL - padR);
  const cy = (padT + (H - padB)) / 2;
  const laneOrder = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];

  const placed = [];
  for (const pt of [...pts].sort((a, b) => a.v - b.v)) {
    const px = x(pt.v);
    let lane = laneOrder.find((l) => !placed.some((q) => q.lane === l && Math.abs(q.px - px) < R * 2 + 1));
    if (lane === undefined) lane = 0;
    placed.push({ ...pt, px, lane, py: cy + lane * gap });
  }
  const top = placed.reduce((a, b) => (b.v > a.v ? b : a));
  const avg = pts.reduce((s, p) => s + p.v, 0) / pts.length;

  return (
    <div className="bsw-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="bsw" role="img" aria-label={`Рейтинги состава: ${pts.length} игроков, средний ${avg.toFixed(1)}`}>
        {[0, 2, 4, 6, 8, 10].map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={padT} x2={x(t)} y2={H - padB} stroke="rgba(255,255,255,0.06)" />
            <text x={x(t)} y={H - 8} textAnchor="middle" className="bsw__tick">{t}</text>
          </g>
        ))}
        {/* среднее по команде */}
        <line x1={x(avg)} y1={padT - 4} x2={x(avg)} y2={H - padB} stroke="var(--accent-cyan,#22d3ee)" strokeDasharray="3 3" strokeWidth="1" />
        <text x={x(avg)} y={padT - 8} textAnchor="middle" className="bsw__avg">ср {avg.toFixed(1)}</text>
        {placed.map((q, i) => (
          <circle key={i} cx={q.px} cy={q.py} r={R} fill={ratingColor(q.v)} stroke="#0f1115" strokeWidth="1">
            <title>{`${shortNameFromPlayer(q.p)} — ${q.v.toFixed(1)}`}</title>
          </circle>
        ))}
        <text x={top.px} y={top.py - R - 4} textAnchor="middle" className="bsw__top">
          {shortNameFromPlayer(top.p)} {top.v.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}
