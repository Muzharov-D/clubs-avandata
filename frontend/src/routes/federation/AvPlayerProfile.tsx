import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { ratingColor } from './ratings';
import { PlayerAvatar } from './PlayerAvatar';
import { FedEmpty } from './FedState';
import { MatchDetail, type MatchBase } from './MatchDetail';
import { fmtDate, plMatch, lineOf, LINE_LABEL, topPctOf } from './utils';
import './federation.css';

interface PoolP { id: number; rating: number | null; birthYear: number | null; position: string | null }
interface Metric { id: string; title: string; short: string; category: string; count: number; points: number }
interface PMatch {
  id: number; date: string | null;
  home: { name: string; logo: string | null; score: number | null };
  away: { name: string; logo: string | null; score: number | null };
  playerSide: 'home' | 'away' | null; rating: number | null;
}
interface Profile {
  id: number; name: string; club: string | null; clubLogo: string | null; photo: string | null; position: string | null;
  birthDate: string | null; birthYear: number | null; rating: number | null;
  matches: number; totalEvents: number; metrics: Metric[]; recentMatches: PMatch[];
  /** Все записи ребёнка: новая заводится при каждом переходе между командами. */
  registrations?: number[];
}

/** Клубы, за которые игрок реально выходил, по порядку матчей (без повторов подряд). */
function clubPath(matches: PMatch[]): string[] {
  const seq = [...matches]
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    .map((m) => (m.playerSide === 'home' ? m.home.name : m.playerSide === 'away' ? m.away.name : null))
    .filter((n): n is string => !!n);
  return seq.filter((n, i) => n !== seq[i - 1]);
}

const toMatchBase = (m: PMatch): MatchBase => ({ id: m.id, age: '', division: '', date: m.date ?? '', home: m.home, away: m.away });

const catColor = (c: string) => (c === 'attack' ? 'var(--av-cat-attack)' : c === 'defense' ? 'var(--av-cat-defense)' : 'var(--av-cat-pass)');
const catLabel = (c: string) => (c === 'attack' ? 'Атака' : c === 'defense' ? 'Оборона' : 'Развитие');

/** Профиль игрока + перцентильная «пицца» на РЕАЛЬНЫХ событиях (37 метрик). */
export function FederationAvPlayerProfile() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'player', id],
    queryFn: () => api<Profile>(`/federation/av/players/${encodeURIComponent(id)}`),
  });

  return (
    <>
      <Link to="/federation/players" className="av-link av-rise" style={{ marginBottom: 4 }}>← К игрокам</Link>
      {isLoading && <div className="av-skeleton av-rise" style={{ height: 380 }} />}
      {error && <FedEmpty>Игрок не найден или вне региона.</FedEmpty>}
      {data && <Body p={data} />}
    </>
  );
}

function Body({ p }: { p: Profile }) {
  const top = p.metrics.slice(0, 16);
  const metricMax = Math.max(...p.metrics.map((x) => x.count), 1);
  const pool = useQuery({ queryKey: ['av', 'players', null], queryFn: () => api<{ players: PoolP[] }>('/federation/av/players') });
  // Перцентиль-герой: положение игрока в регионе по рейтингу + срезы по возрасту и амплуа.
  // Знаменатель (весь пул региона) есть только у федерации — это и есть её «ров».
  const rank = useMemo(() => {
    const list = (pool.data?.players ?? []).filter((x): x is PoolP & { rating: number } => x.rating != null);
    if (p.rating == null || list.length < 5) return null;
    const my = p.rating;
    const all = list.map((x) => x.rating);
    const myLine = lineOf(p.position);
    const sameYear = p.birthYear != null ? list.filter((x) => x.birthYear === p.birthYear).map((x) => x.rating) : [];
    const sameLine = myLine ? list.filter((x) => lineOf(x.position) === myLine).map((x) => x.rating) : [];
    const place = [...all].sort((a, b) => b - a).findIndex((r) => r <= my) + 1; // ранг по строго-сильнейшим
    return {
      total: all.length,
      place: place > 0 ? place : all.length,
      region: topPctOf(my, all),
      year: p.birthYear != null ? topPctOf(my, sameYear, 4) : null,
      line: myLine ? topPctOf(my, sameLine, 4) : null,
      lineLabel: myLine ? LINE_LABEL[myLine] : null,
    };
  }, [pool.data, p.rating, p.position, p.birthYear]);
  const [selectedMatch, setSelectedMatch] = useState<PMatch | null>(null);

  return (
    <>
      <header className="av-surface av-surface--feature av-pad-lg av-phead av-rise">
        <div style={{ position: 'relative', flex: 'none' }}>
          <PlayerAvatar name={p.name} photoUrl={p.photo} size={64} ring />
          <span style={{ position: 'absolute', right: -4, bottom: -4 }}><ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={26} /></span>
        </div>
        <div className="av-phead__id">
          <h1 className="av-phead__name">{p.name}</h1>
          <p className="av-phead__meta">{p.position ?? 'позиция —'} · {p.club ?? '—'}{p.birthYear ? ` · ${p.birthYear} г.р.` : ''} · {p.matches} {plMatch(p.matches)} · {p.totalEvents} событий</p>
          <div className="av-phead__chips">
            {p.position && <span className="av-chip av-chip--dim">{p.position}</span>}
            {p.birthYear && <span className="av-chip av-chip--dim">{p.birthYear} г.р.</span>}
          </div>
          {/* Ребёнок заводится заново при каждом переходе — профиль собран из всех
              его записей, иначе карточка показывала бы кусок истории. */}
          {(p.registrations?.length ?? 0) > 1 && (
            <p className="av-phead__merged">
              Профиль собран из {p.registrations!.length} записей — ребёнок заводится заново при переходе между командами.
              {clubPath(p.recentMatches).length > 1 && (
                <> Играл за: {clubPath(p.recentMatches).join(' → ')}.</>
              )}
            </p>
          )}
        </div>
        {p.rating != null && (
          <div style={{ textAlign: 'center', marginLeft: 'auto', flex: 'none' }}>
            <div className="av-dim" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Рейтинг</div>
            <div className="av-num" style={{ fontSize: 44, fontWeight: 700, color: ratingColor(p.rating), lineHeight: 1, marginTop: 4 }}>{p.rating}</div>
          </div>
        )}
      </header>

      {/* Перцентиль-герой: где игрок в регионе — по рейтингу, в своём возрасте, среди амплуа */}
      {rank?.region != null && (
        <section className="av-pcthero av-rise">
          <div className="av-pcthero__main">
            <span className="av-pcthero__pct">топ&nbsp;{rank.region}%</span>
            <span className="av-pcthero__cap">региона по рейтингу</span>
          </div>
          <div className="av-pcthero__rest">
            <div className="av-pcthero__cell">
              <span className="av-pcthero__n">{rank.place}<i>&nbsp;/ {rank.total}</i></span>
              <span className="av-pcthero__l">место в регионе</span>
            </div>
            {rank.year != null && (
              <div className="av-pcthero__cell">
                <span className="av-pcthero__n">топ {rank.year}%</span>
                <span className="av-pcthero__l">среди {p.birthYear} г.р.</span>
              </div>
            )}
            {rank.line != null && rank.lineLabel && (
              <div className="av-pcthero__cell">
                <span className="av-pcthero__n">топ {rank.line}%</span>
                <span className="av-pcthero__l">среди {rank.lineLabel} региона</span>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="av-cols-2 av-rise">
        <section className="av-surface av-pad-lg" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="av-section" style={{ alignSelf: 'stretch' }}>
            <div>
              <h2 className="av-section-title">Профиль игрока</h2>
              <p className="av-section-sub">Реальные события матчей · длина луча = объём</p>
            </div>
          </div>
          {top.length >= 3 ? (
            <>
              <Pizza metrics={top} />
              <div className="av-pizza-legend">
                {['attack', 'defense', 'pass'].map((c) => <span key={c}><i style={{ background: catColor(c) }} />{catLabel(c)}</span>)}
              </div>
            </>
          ) : <div className="av-note">Мало событий для профиля.</div>}
        </section>

        <section className="av-surface av-pad-lg">
          <div className="av-section">
            <div>
              <h2 className="av-section-title">Действия за сезон</h2>
              <p className="av-section-sub">{p.metrics.length} показателей · по объёму событий</p>
            </div>
          </div>
          {p.metrics.map((m) => (
            <div key={m.id} className="av-metricbar">
              <div className="av-metricbar__l">
                <span className="av-metricbar__name" title={m.title}>{m.title}</span>
                <span className="av-metricbar__track"><span className="av-metricbar__fill" style={{ width: `${(m.count / metricMax) * 100}%`, background: catColor(m.category) }} /></span>
              </div>
              <span className="av-metricbar__val" style={{ color: catColor(m.category) }}>{m.count}</span>
            </div>
          ))}
        </section>
      </div>

      {p.recentMatches.length > 0 && (
        <section className="av-surface av-pad-lg av-rise">
          <div className="av-section">
            <div>
              <h2 className="av-section-title">История матчей</h2>
              <p className="av-section-sub">Рейтинг игрока в матче · клик → карточка матча</p>
            </div>
          </div>
          <div className="av-pmatches">
            {p.recentMatches.map((m, i) => (
              <button type="button" key={i} className="av-pmatch" onClick={() => setSelectedMatch(m)}>
                <span className="av-pmatch__date">{fmtDate(m.date)}</span>
                <span className={`av-pmatch__team av-pmatch__team--h${m.playerSide === 'home' ? ' av-pmatch__team--me' : ''}`}>
                  <span className="av-pmatch__name" title={m.home.name}>{m.home.name}</span>
                  <ClubShield name={m.home.name} logoUrl={m.home.logo} size={22} />
                </span>
                <span className="av-pmatch__score">{m.home.score ?? '–'}:{m.away.score ?? '–'}</span>
                <span className={`av-pmatch__team av-pmatch__team--a${m.playerSide === 'away' ? ' av-pmatch__team--me' : ''}`}>
                  <ClubShield name={m.away.name} logoUrl={m.away.logo} size={22} />
                  <span className="av-pmatch__name" title={m.away.name}>{m.away.name}</span>
                </span>
                {m.rating != null && <span className="av-pmatch__rate" title="рейтинг игрока в матче" style={{ color: ratingColor(m.rating) }}>{m.rating}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedMatch && <MatchDetail base={toMatchBase(selectedMatch)} onClose={() => setSelectedMatch(null)} />}
    </>
  );
}

function Pizza({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) return <div className="av-note">Нет событий для профиля.</div>;
  const size = 320, cx = size / 2, cy = size / 2, R = size / 2 - 56;
  const n = metrics.length;
  const max = Math.max(...metrics.map((m) => m.count), 1);
  const step = 360 / n, gap = Math.min(2, step * 0.1);
  const polar = (r: number, deg: number): [number, number] => { const a = ((deg - 90) * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const wedge = (r: number, a0: number, a1: number) => {
    const [x0, y0] = polar(r, a0); const [x1, y1] = polar(r, a1);
    return `M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="av-pizza" role="img" aria-label="Профиль действий">
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
