import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { MatchDetail, type MatchBase } from './MatchDetail';
import { FedError } from './FedState';
import { useFedYear } from './avYear';
import './avandata.css';

interface TRef { key: string; title: string; ageFrom: number; lastPlayedTour: number }
interface Agg {
  ref: TRef; teams: number; players: number; matches: number; analyzed: number; goals: number;
  goalsPerMatch: number | null; yellowPerMatch: number | null; avgRating: number | null;
}
type MK = 'goalsPerMatch' | 'avgRating' | 'goals' | 'players' | 'matches' | 'yellowPerMatch';
const METRICS: Array<{ k: MK; l: string; hint: string }> = [
  { k: 'goalsPerMatch', l: 'Голы на матч', hint: 'результативность' },
  { k: 'avgRating', l: 'Средний рейтинг игрока', hint: 'класс' },
  { k: 'goals', l: 'Голов всего', hint: 'объём' },
  { k: 'players', l: 'Игроков разобрано', hint: 'охват' },
  { k: 'matches', l: 'Матчей', hint: 'объём' },
  { k: 'yellowPerMatch', l: 'Жёлтых на матч', hint: 'жёсткость' },
];
const COLORS = ['var(--av-chart-1)', 'var(--av-chart-2)', 'var(--av-chart-3)', 'var(--av-chart-4)', 'var(--av-chart-5)', 'var(--av-chart-6)'];
const fmt = (v: number | null) => (v == null ? '—' : Number.isInteger(v) ? v.toLocaleString('ru-RU') : v.toFixed(2));

// Лента результатов («как идут турниры»): берём только то, что нужно карточке матча.
interface RTeam { name: string; logo: string | null; score: number | null }
interface RMatch { id: number; age: string; division: string; date: string; home: RTeam; away: RTeam }
const fmtDate = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '').toUpperCase(); } catch { return ''; } };
const toBase = (m: RMatch): MatchBase => ({ id: m.id, age: m.age, division: m.division, date: m.date, home: m.home, away: m.away });

export function FederationAvCompare() {
  const { year } = useFedYear();
  const tq = useQuery({ queryKey: ['av', 'tournaments'], queryFn: () => api<{ tournaments: TRef[] }>('/federation/av/tournaments') });
  const refs = tq.data?.tournaments ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<RMatch | null>(null);
  // Свежие результаты по выбранному году (или все возрасты) — «как идут турниры».
  const rs = useQuery({ queryKey: ['av', 'results', year, 'all'], queryFn: () => api<{ results: RMatch[] }>(`/federation/av/results${year != null ? `?year=${year}` : ''}`) });
  const results = rs.data?.results ?? [];

  const sel = useMemo(() => {
    if (selected.length) return selected;
    if (year != null) { const yk = refs.filter((r) => r.ageFrom === year).map((r) => r.key); if (yk.length) return yk; }
    const wt = refs.filter((r) => r.lastPlayedTour > 1).slice(0, 4).map((r) => r.key);
    return wt.length >= 2 ? wt : refs.slice(0, 3).map((r) => r.key);
  }, [selected, refs, year]);

  const cq = useQuery({
    queryKey: ['av', 'compare', sel.join(',')],
    queryFn: () => api<{ items: Agg[] }>(`/federation/av/compare?keys=${encodeURIComponent(sel.join(','))}`),
    enabled: sel.length >= 1,
  });
  const items = cq.data?.items ?? [];
  const toggle = (key: string) => { const base = selected.length ? selected : sel; setSelected(base.includes(key) ? base.filter((k) => k !== key) : [...base, key]); };

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Турниры</h1>
          <p className="av-sub">Первенство СПб — результаты и сравнение дивизионов</p>
        </div>
      </header>

      <div className="av-section av-rise">
        <div>
          <h2 className="av-section-title">Сравнение турниров</h2>
          <p className="av-section-sub" style={{ margin: '2px 0 0' }}>Выбери турниры — ключевые показатели встанут рядом</p>
        </div>
      </div>

      {tq.isLoading ? <div className="av-skeleton" style={{ height: 44 }} /> : (
        <div className="av-pills av-rise">
          {refs.map((r) => <button key={r.key} onClick={() => toggle(r.key)} className={`av-pill${sel.includes(r.key) ? ' av-pill--active' : ''}`}>{r.title}</button>)}
        </div>
      )}
      {(tq.error || cq.error) && <FedError subject="Сравнение турниров" />}

      {/* легенда */}
      {items.length > 0 && (
        <div className="av-rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {items.map((it, i) => (
            <span key={it.ref.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--av-text-2)' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i % COLORS.length] }} />{it.ref.title}
            </span>
          ))}
        </div>
      )}

      {cq.isLoading ? <section className="av-surface av-pad"><div className="av-skeleton" style={{ height: 320 }} /></section> : items.length > 0 && (
        <div className="av-cols-2 av-rise" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
          {METRICS.map((m) => {
            const max = Math.max(...items.map((it) => Number(it[m.k] ?? 0)), 0.0001);
            return (
              <section key={m.k} className="av-surface av-pad">
                <div className="av-cmp__head">
                  <span className="av-cmp__name">{m.l}</span>
                  <span className="av-dim" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.hint}</span>
                </div>
                {items.map((it, i) => {
                  const v = Number(it[m.k] ?? 0);
                  return (
                    <div key={it.ref.key} className="av-cmp__row">
                      <span className="av-cmp__label">{it.ref.title}</span>
                      <span className="av-cmp__track"><span className="av-cmp__fill" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: COLORS[i % COLORS.length] }} /></span>
                      <span className="av-cmp__val" style={{ color: COLORS[i % COLORS.length] }}>{fmt(it[m.k])}</span>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
      <p className="av-dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        Голы/матчи — по всем турам; рейтинг/игроки — с разобранных матчей. Турнир «Вторая Лига» (коллеги) встанет колонкой здесь же после подключения их выгрузки PDF+CSV.
      </p>

      {/* Как идут турниры — свежие результаты, клик → детали матча */}
      {rs.isLoading ? <div className="av-skeleton av-rise" style={{ height: 160 }} /> : results.length > 0 && (
        <section className="av-rise">
          <div className="av-section">
            <div>
              <h2 className="av-section-title">Последние результаты</h2>
              <p className="av-section-sub" style={{ margin: '2px 0 0' }}>Как идут турниры{year != null ? ` · ${year} г.р.` : ' всех возрастов'} · клик → детали матча</p>
            </div>
            <span className="av-divtag">{results.length} матчей</span>
          </div>
          <div className="av-fixtures">
            {results.slice(0, 18).map((m) => {
              const hs = m.home.score ?? 0, as = m.away.score ?? 0;
              return (
                <button key={m.id} type="button" className="av-fixture av-fixture--link" onClick={() => setOpen(m)}>
                  <div className="av-fixture__top">
                    <span className="av-fixture__age">{m.age} · {m.division}</span>
                    <span className="av-fixture__date">{fmtDate(m.date)}</span>
                  </div>
                  <div className="av-fixture__body">
                    <span className="av-fixture__team">
                      <ClubShield name={m.home.name} logoUrl={m.home.logo} size={34} />
                      <span className="av-fixture__team-name" title={m.home.name}>{m.home.name}</span>
                    </span>
                    <span className="av-fixture__score">
                      <b className={hs >= as ? 'av-fixture__score-w' : 'av-fixture__score-l'}>{m.home.score ?? '–'}</b>
                      <span className="av-fixture__sep">:</span>
                      <b className={as >= hs ? 'av-fixture__score-w' : 'av-fixture__score-l'}>{m.away.score ?? '–'}</b>
                    </span>
                    <span className="av-fixture__team">
                      <ClubShield name={m.away.name} logoUrl={m.away.logo} size={34} />
                      <span className="av-fixture__team-name" title={m.away.name}>{m.away.name}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {open && <MatchDetail base={toBase(open)} onClose={() => setOpen(null)} />}
    </>
  );
}
