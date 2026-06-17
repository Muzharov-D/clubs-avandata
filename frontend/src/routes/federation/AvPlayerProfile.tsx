import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import './avandata.css';

interface Metric { id: string; title: string; short: string; category: string; count: number; points: number }
interface Profile {
  id: number; name: string; club: string | null; clubLogo: string | null; position: string | null;
  birthDate: string | null; birthYear: number | null; rating: number | null;
  matches: number; totalEvents: number; metrics: Metric[];
}

const catColor = (c: string) => (c === 'attack' ? '#5EEBFC' : c === 'defense' ? '#FF0099' : '#3054FF');

/** Профиль игрока + перцентильная «пицца» на РЕАЛЬНЫХ событиях (37 метрик). */
export function FederationAvPlayerProfile() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'player', id],
    queryFn: () => api<Profile>(`/federation/av/players/${encodeURIComponent(id)}`),
  });

  return (
    <>
      <Link to="/federation/players" className="av-link" style={{ display: 'inline-block', marginBottom: 6 }}>← К игрокам</Link>
      {isLoading && <div className="av-skeleton" style={{ height: 360 }} />}
      {error && <div className="av-empty"><div className="av-empty__icon">🔍</div>Игрок не найден.</div>}
      {data && <Body p={data} />}
    </>
  );
}

function Body({ p }: { p: Profile }) {
  const top = p.metrics.slice(0, 16);
  return (
    <>
      <header className="av-surface av-pad av-rise" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={52} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="av-title" style={{ fontSize: 24 }}>{p.name}</h1>
          <p className="av-sub">
            {p.position ?? 'позиция —'} · {p.club ?? '—'}
            {p.birthYear ? ` · ${p.birthYear} г.р.` : ''} · {p.matches} матч(а) · {p.totalEvents} событий
          </p>
        </div>
        {p.rating != null && (
          <div style={{ textAlign: 'center' }}>
            <div className="av-dim" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Рейтинг</div>
            <div className="av-num" style={{ fontSize: 38, fontWeight: 700, color: p.rating < 0 ? 'var(--av-danger)' : 'var(--av-accent)', lineHeight: 1 }}>{p.rating}</div>
          </div>
        )}
      </header>

      <div className="av-cols av-rise">
        <section className="av-surface av-pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ alignSelf: 'flex-start', marginBottom: 6 }}>
            <h2 className="av-section-title">Профиль действий · «пицца»</h2>
            <p className="av-section-sub">Реальные события матчей · циан = атака, маджента = оборона</p>
          </div>
          {top.length >= 3 ? <Pizza metrics={top} /> : <div className="av-note">Мало событий для профиля.</div>}
        </section>

        <section className="av-surface av-pad">
          <h2 className="av-section-title" style={{ marginBottom: 10 }}>Разбор по метрикам</h2>
          <div className="av-row-list">
            {p.metrics.map((m) => {
              const max = Math.max(...p.metrics.map((x) => x.count), 1);
              return (
                <div key={m.id} className="av-row" style={{ gridTemplateColumns: '1fr 70px 44px' }}>
                  <span className="av-row__name" style={{ fontWeight: 500 }}>{m.title}</span>
                  <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(m.count / max) * 100}%`, background: catColor(m.category) }} /></span>
                  <span className="av-num" style={{ textAlign: 'right', fontWeight: 700, color: catColor(m.category) }}>{m.count}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function Pizza({ metrics }: { metrics: Metric[] }) {
  const size = 340, cx = size / 2, cy = size / 2, R = size / 2 - 58;
  const n = metrics.length;
  const max = Math.max(...metrics.map((m) => m.count), 1);
  const step = 360 / n, gap = Math.min(2, step * 0.1);
  const polar = (r: number, deg: number): [number, number] => { const a = ((deg - 90) * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const wedge = (r: number, a0: number, a1: number) => {
    const [x0, y0] = polar(r, a0); const [x1, y1] = polar(r, a1);
    return `M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ overflow: 'visible', display: 'block' }} role="img" aria-label="Профиль действий">
      {[0.25, 0.5, 0.75, 1].map((lv, i) => <circle key={i} cx={cx} cy={cy} r={R * lv} fill="none" stroke="rgba(94,235,252,0.12)" strokeWidth={1} opacity={i === 3 ? 0.8 : 0.5} />)}
      {metrics.map((m, i) => {
        const c = catColor(m.category);
        const frac = Math.max(0.04, m.count / max);
        const a0 = step * i + gap, a1 = step * (i + 1) - gap, center = step * i + step / 2;
        const [lx, ly] = polar(R + 20, center);
        const anchor = Math.abs(lx - cx) < 12 ? 'middle' : lx > cx ? 'start' : 'end';
        return (
          <g key={m.id}>
            <path d={wedge(R, a0, a1)} fill="rgba(255,255,255,0.03)" />
            <path d={wedge(R * frac, a0, a1)} fill={`${c}cc`} stroke={c} strokeWidth={1} strokeLinejoin="round" />
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: 9.5, fill: 'var(--av-text-2)', fontWeight: 600 }}>
              <tspan x={lx} dy="-0.3em">{m.short}</tspan>
              <tspan x={lx} dy="1.1em" style={{ fill: c, fontWeight: 700 }}>{m.count}</tspan>
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={2.5} fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}
