import './PlayerRadar.css';

type AnyObj = Record<string, any>;

interface Props {
  player: AnyObj;
  teamPlayers: AnyObj[];
  brand?: string;
}

const AXES: Array<{ key: string; label: string; getter: (s: AnyObj) => number }> = [
  { key: 'passing',   label: 'Пасы',         getter: (s) => Number(s?.passing?.tochnost_pasov ?? 0) },
  { key: 'attacking', label: 'Атака',        getter: (s) => Number(s?.attacking?.udary ?? 0) + Number(s?.attacking?.goal ?? 0) * 5 },
  { key: 'duels',     label: 'Единоборства', getter: (s) => Number(s?.duels?.vyigrannye_edinoborstva ?? s?.duels?.edinoborstva ?? 0) },
  { key: 'defending', label: 'Защита',       getter: (s) => Number(s?.defending?.otbory ?? 0) + Number(s?.defending?.perehvaty ?? 0) },
  { key: 'pressing',  label: 'Прессинг',     getter: (s) => Number(s?.pressing?.pressing ?? 0) + Number(s?.pressing?.kontrpressing ?? 0) },
  { key: 'dribbling', label: 'Дриблинг',     getter: (s) => Number(s?.dribbling?.udachnye_obvodki ?? s?.dribbling?.obvodki ?? 0) },
  { key: 'fitness',   label: 'Дистанция',    getter: (s) => Number(s?.fitness?.obschaya_distanciya ?? 0) },
  { key: 'setpieces', label: 'Стандарты',    getter: (s) => Number(s?.setpieces?.uglovye_s_udarom ?? 0) + Number(s?.setpieces?.shtrafnye_s_udarom ?? 0) },
];

export function PlayerRadar({ player, teamPlayers, brand = '#1FB6FF' }: Props) {
  const size = 240, cx = 120, cy = 120, radius = 84;
  const eligible = teamPlayers.filter((p) => (p.minutes ?? 0) > 0);
  const values = AXES.map((ax) => {
    const myVal = ax.getter(player.stats ?? {});
    const allVals = eligible.map((p) => ax.getter(p.stats ?? {})).filter((v) => Number.isFinite(v));
    const max = Math.max(1, ...allVals);
    const pct = max === 0 ? 0 : Math.min(100, (myVal / max) * 100);
    return { ax, myVal, pct };
  });
  const angle = (i: number) => (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
  const point = (i: number, p: number) => ({
    x: cx + (radius * p / 100) * Math.cos(angle(i)),
    y: cy + (radius * p / 100) * Math.sin(angle(i)),
  });
  const polyPoints = values.map((v, i) => { const p = point(i, v.pct); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  const rings = [25, 50, 75, 100];

  return (
    <div className="prdr">
      <svg viewBox={`0 0 ${size} ${size}`} className="prdr__svg">
        <defs>
          <radialGradient id={`prdr-grad-${player.playerId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={brand} stopOpacity="0.55" />
            <stop offset="100%" stopColor={brand} stopOpacity="0.05" />
          </radialGradient>
        </defs>
        {rings.map((r) => (
          <polygon key={r}
            points={AXES.map((_, i) => { const p = point(i, r); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ')}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={r === 100 ? 1 : 0.5}
          />
        ))}
        {AXES.map((_, i) => {
          const p = point(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />;
        })}
        <polygon points={polyPoints} fill={`url(#prdr-grad-${player.playerId})`} stroke={brand} strokeWidth={1.5} />
        {values.map((v, i) => { const p = point(i, v.pct); return <circle key={i} cx={p.x} cy={p.y} r="3" fill={brand} />; })}
        {AXES.map((ax, i) => {
          const ag = angle(i);
          const lx = cx + (radius + 16) * Math.cos(ag);
          const ly = cy + (radius + 16) * Math.sin(ag);
          const anchor = Math.cos(ag) > 0.5 ? 'start' : Math.cos(ag) < -0.5 ? 'end' : 'middle';
          return <text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="prdr__label">{ax.label}</text>;
        })}
      </svg>
      <div className="prdr__legend">
        {values.map((v) => (
          <div key={v.ax.key} className="prdr__lg-item">
            <span className="prdr__lg-dot" style={{ background: brand }} />
            <span className="prdr__lg-label">{v.ax.label}</span>
            <span className="prdr__lg-val">{v.myVal > 0 ? formatVal(v.ax.key, v.myVal) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatVal(key: string, v: number): string {
  if (key === 'fitness') return `${Math.round(v).toLocaleString('ru-RU')} м`;
  if (key === 'passing') return `${v.toFixed(0)}%`;
  return v.toFixed(v < 10 ? 1 : 0);
}
