import './DonutComparisonCard.css';

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return v.value ?? '—';
  return v;
}

export default function DonutComparisonCard({ label, home, away }) {
  const h = Number(typeof home === 'object' ? home?.value : home) || 0;
  const a = Number(typeof away === 'object' ? away?.value : away) || 0;
  const total = h + a || 1;
  const homePct = (h / total) * 100;

  // Build donut stroke
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const homeArc = (homePct / 100) * circumference;

  return (
    <div className="donut-card">
      <div className="donut-card__label">{label}</div>
      <div className="donut-card__donut">
        <svg viewBox="0 0 100 100" width="120" height="120">
          <circle cx="50" cy="50" r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="10" fill="none"/>
          <circle
            cx="50" cy="50" r={radius}
            stroke="#22d3ee"
            strokeWidth="10"
            fill="none"
            strokeDasharray={`${homeArc} ${circumference - homeArc}`}
            strokeDashoffset={circumference / 4}
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="48" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">
            {fmt(home)}
          </text>
          <text x="50" y="62" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">
            из {h + a}
          </text>
        </svg>
      </div>
      <div className="donut-card__compare">
        <span className="donut-card__home"><b>{fmt(home)}</b> наши</span>
        <span className="donut-card__away">{fmt(away)} соперник</span>
      </div>
    </div>
  );
}
