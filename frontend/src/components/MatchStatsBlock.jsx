import './MatchStatsBlock.css';

function pick(obj, path) {
  if (!obj) return null;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return null;
    cur = cur[p];
  }
  if (cur === null || cur === undefined) return null;
  if (typeof cur === 'object') {
    if (cur.value !== undefined) return Number(cur.value);
    if (cur.pct !== undefined) return Number(cur.pct);
    return null;
  }
  const n = Number(cur);
  return Number.isFinite(n) ? n : null;
}

function fmt(v, isPct) {
  if (v === null || v === undefined) return '—';
  if (isPct) return Math.round(v) + '%';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

const METRICS = [
  { key: 'possessionPct',    label: 'Владение',         isPct: true },
  { key: 'shots.total',      label: 'Удары всего' },
  { key: 'shots.onTarget',   label: 'Удары в створ' },
  { key: 'expectedGoals',    label: 'xG' },
  { key: 'passes.total',     label: 'Передачи' },
  { key: 'passes.accuracy',  label: 'Точные передачи',  isPct: true },
  { key: 'corners.total',    label: 'Угловые' },
  { key: 'freeKickShots',    label: 'Штрафные удары' },
  { key: 'fouls',            label: 'Нарушения' },
  { key: 'offsides',         label: 'Офсайды' },
];

export default function MatchStatsBlock({ home, away, hostName, guestName, homeIsUs = true }) {
  // Класс на корне переключает который из host/guest = Легирус (красный),
  // соперник окрашивается в белый.
  const usClass = homeIsUs ? 'mds-stats--us-home' : 'mds-stats--us-away';
  return (
    <div className={`mds-stats ${usClass}`}>
      <div className="mds-stats__header">
        <span className="mds-stats__team mds-stats__team--home">{hostName || 'Хозяева'}</span>
        <span className="mds-stats__team mds-stats__team--away">{guestName || 'Гости'}</span>
      </div>

      {METRICS.map((m) => {
        const h = pick(home, m.key);
        const a = pick(away, m.key);
        if (h === null && a === null) return null;
        const hN = h ?? 0;
        const aN = a ?? 0;
        const total = hN + aN;
        const hPct = total > 0 ? (hN / total) * 100 : 50;
        const aPct = 100 - hPct;

        return (
          <div className="mds-stats__row" key={m.key}>
            <div className="mds-stats__values">
              <span className="mds-stats__val mds-stats__val--home">{fmt(h, m.isPct)}</span>
              <span className="mds-stats__label">{m.label}</span>
              <span className="mds-stats__val mds-stats__val--away">{fmt(a, m.isPct)}</span>
            </div>
            <div className="mds-stats__bar">
              <div className="mds-stats__bar-home" style={{ width: hPct + '%' }} />
              <div className="mds-stats__bar-away" style={{ width: aPct + '%' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
