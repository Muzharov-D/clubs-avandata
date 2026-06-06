import './StatCompareBar.css';

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return v.value ?? '—';
  return v;
}

// ourSide — какая сторона «наша» ('home' | 'away'). Красим НАШУ сторону
// бренд-акцентом, соперника — нейтрально-серым (раньше cyan жёстко вешался на
// home → на выездных матчах подсвечивался соперник, а наша команда блёкла).
export default function StatCompareBar({ label, home, away, suffix = '', ourSide = 'home' }) {
  const h = Number(typeof home === 'object' ? home?.value : home) || 0;
  const a = Number(typeof away === 'object' ? away?.value : away) || 0;
  const total = h + a;
  const homePct = total > 0 ? (h / total) * 100 : 50;
  const awayPct = 100 - homePct;
  const homeOurs = ourSide !== 'away';
  const homeCls = homeOurs ? 'is-ours' : 'is-opp';
  const awayCls = homeOurs ? 'is-opp' : 'is-ours';
  return (
    <div className="stat-compare">
      <div className="stat-compare__row">
        <div className={`stat-compare__home ${homeCls}`}>{fmt(home)}{suffix}</div>
        <div className="stat-compare__label">{label}</div>
        <div className={`stat-compare__away ${awayCls}`}>{fmt(away)}{suffix}</div>
      </div>
      <div className="stat-compare__bar">
        <div className={`stat-compare__bar-home ${homeCls}`} style={{ width: `${homePct}%` }} />
        <div className={`stat-compare__bar-away ${awayCls}`} style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}
