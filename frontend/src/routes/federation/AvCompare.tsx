import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
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
const COLORS = ['#5EEBFC', '#FF0099', '#3054FF', '#34d399', '#fbbf24', '#a78bfa'];
const fmt = (v: number | null) => (v == null ? '—' : Number.isInteger(v) ? v.toLocaleString('ru-RU') : v.toFixed(2));

export function FederationAvCompare() {
  const { year } = useFedYear();
  const tq = useQuery({ queryKey: ['av', 'tournaments'], queryFn: () => api<{ tournaments: TRef[] }>('/federation/av/tournaments') });
  const refs = tq.data?.tournaments ?? [];
  const [selected, setSelected] = useState<string[]>([]);

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
          <span className="av-kicker">Первенство СПб</span>
          <h1 className="av-title">Сравнение турниров</h1>
          <p className="av-sub">Выбери турниры — сила бок о бок</p>
        </div>
      </header>

      {tq.isLoading ? <div className="av-skeleton" style={{ height: 44 }} /> : (
        <div className="av-pills av-rise">
          {refs.map((r) => <button key={r.key} onClick={() => toggle(r.key)} className={`av-pill${sel.includes(r.key) ? ' av-pill--active' : ''}`}>{r.title}</button>)}
        </div>
      )}
      {tq.error && <FedError />}

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
    </>
  );
}
