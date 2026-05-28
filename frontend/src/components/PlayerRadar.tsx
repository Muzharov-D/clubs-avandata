import './PlayerRadar.css';

type AnyObj = Record<string, any>;

interface Props {
  player: AnyObj;
  teamPlayers: AnyObj[];
  brand?: string;
}

/**
 * 8-осевая радар-диаграмма по SportVisor Performance Index (0-10).
 *
 * Источник — `player.radar` из rich PDF parser:
 *   forwardPlay, possession, dribbling, shooting       (attack)
 *   tackling, positioning, duels, pressing              (defence)
 *   fitnessRating/distance/intensity                    (fitness)
 *
 * Fallback: если radar пустой — собираем из stats.attack / stats.defence
 * (для исторических матчей до интеграции rich парсера).
 */
const AXES: Array<{ key: string; label: string; getter: (r: AnyObj, s: AnyObj) => number }> = [
  { key: 'forwardPlay', label: 'Атака',     getter: (r) => num(r.forwardPlay)  },
  { key: 'shooting',    label: 'Удары',     getter: (r) => num(r.shooting)     },
  { key: 'possession',  label: 'Владение',  getter: (r) => num(r.possession)   },
  { key: 'dribbling',   label: 'Дриблинг',  getter: (r) => num(r.dribbling)    },
  { key: 'tackling',    label: 'Отборы',    getter: (r) => num(r.tackling)     },
  { key: 'positioning', label: 'Позиция',   getter: (r) => num(r.positioning)  },
  { key: 'duels',       label: 'Дуэли',     getter: (r) => num(r.duels)        },
  { key: 'pressing',    label: 'Прессинг',  getter: (r) => num(r.pressing)     },
];

export function PlayerRadar({ player, teamPlayers, brand = '#1FB6FF' }: Props) {
  const size = 240, cx = 120, cy = 120, radius = 84;
  const eligible = teamPlayers.filter((p) => (p.minutes ?? 0) > 0);

  // Лимит шкалы — берём максимум по команде (но не меньше 10), чтобы один топ-игрок
  // не заполнял всю диаграмму, а слабые при этом были визуально заметны.
  const teamMax = AXES.map((ax) => {
    const all = eligible.map((p) => ax.getter(p.radar ?? {}, p.stats ?? {})).filter(Number.isFinite);
    return Math.max(10, ...all);
  });

  const values = AXES.map((ax, idx) => {
    const my = ax.getter(player.radar ?? {}, player.stats ?? {});
    const pct = my > 0 ? Math.min(100, (my / teamMax[idx]!) * 100) : 0;
    return { ax, my, pct };
  });

  const angle = (i: number) => (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
  const point = (i: number, p: number) => ({
    x: cx + (radius * p / 100) * Math.cos(angle(i)),
    y: cy + (radius * p / 100) * Math.sin(angle(i)),
  });
  const polyPoints = values.map((v, i) => { const p = point(i, v.pct); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  const rings = [25, 50, 75, 100];

  // Уникальный id для градиента (несколько радаров на одной странице)
  const gradId = `prdr-grad-${player.playerId ?? player.number ?? Math.random().toString(36).slice(2)}`;

  return (
    <div className="prdr">
      <svg viewBox={`0 0 ${size} ${size}`} className="prdr__svg">
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
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
        <polygon points={polyPoints} fill={`url(#${gradId})`} stroke={brand} strokeWidth={1.5} />
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
            <span className="prdr__lg-val">{v.my > 0 ? v.my.toFixed(1) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v && 'value' in v) return Number((v as AnyObj).value) || 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
