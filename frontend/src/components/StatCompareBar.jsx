import './StatCompareBar.css';

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return v.value ?? '—';
  return v;
}

export default function StatCompareBar({ label, home, away, suffix = '' }) {
  const h = Number(typeof home === 'object' ? home?.value : home) || 0;
  const a = Number(typeof away === 'object' ? away?.value : away) || 0;
  const total = h + a;
  const homePct = total > 0 ? (h / total) * 100 : 50;
  const awayPct = 100 - homePct;
  return (
    <div className="stat-compare">
      <div className="stat-compare__row">
        <div className="stat-compare__home">{fmt(home)}{suffix}</div>
        <div className="stat-compare__label">{label}</div>
        <div className="stat-compare__away">{fmt(away)}{suffix}</div>
      </div>
      <div className="stat-compare__bar">
        <div className="stat-compare__bar-home" style={{ width: `${homePct}%` }} />
        <div className="stat-compare__bar-away" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}
