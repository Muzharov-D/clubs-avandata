import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import './avandata.css';

interface TRef { key: string; title: string; lastPlayedTour: number }
interface Agg {
  ref: TRef; teams: number; players: number; matches: number; analyzed: number; goals: number;
  goalsPerMatch: number | null; yellowPerMatch: number | null; avgRating: number | null;
}
type MK = 'teams' | 'matches' | 'analyzed' | 'goals' | 'goalsPerMatch' | 'yellowPerMatch' | 'players' | 'avgRating';
const METRICS: Array<{ k: MK; l: string }> = [
  { k: 'teams', l: 'Команды' }, { k: 'matches', l: 'Матчей' }, { k: 'analyzed', l: 'Разобрано' },
  { k: 'goals', l: 'Голы' }, { k: 'goalsPerMatch', l: 'Голы / матч' }, { k: 'yellowPerMatch', l: 'Жёлтые / матч' },
  { k: 'players', l: 'Игроки' }, { k: 'avgRating', l: 'Ср. рейтинг' },
];
const fmt = (v: number | null) => (v == null ? '—' : Number.isInteger(v) ? v.toLocaleString('ru-RU') : v.toFixed(2));

/** Сравнение турниров между собой — реальное Первенство, бок о бок. */
export function FederationAvCompare() {
  const tq = useQuery({ queryKey: ['av', 'tournaments'], queryFn: () => api<{ tournaments: TRef[] }>('/federation/av/tournaments') });
  const refs = tq.data?.tournaments ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const sel = useMemo(() => {
    if (selected.length) return selected;
    const wt = refs.filter((r) => r.lastPlayedTour > 1).slice(0, 3).map((r) => r.key);
    return wt.length >= 2 ? wt : refs.slice(0, 2).map((r) => r.key);
  }, [selected, refs]);

  const cq = useQuery({
    queryKey: ['av', 'compare', sel.join(',')],
    queryFn: () => api<{ items: Agg[] }>(`/federation/av/compare?keys=${encodeURIComponent(sel.join(','))}`),
    enabled: sel.length >= 1,
  });
  const items = cq.data?.items ?? [];
  const toggle = (key: string) => { const base = selected.length ? selected : sel; setSelected(base.includes(key) ? base.filter((k) => k !== key) : [...base, key]); };
  const bestIdx = (k: MK) => { let bi = -1, bv = -Infinity; items.forEach((it, i) => { const v = it[k]; if (v != null && v > bv) { bv = v; bi = i; } }); return bi; };

  return (
    <>
      <header className="av-head av-rise">
        <div>
          <h1 className="av-title">Сравнение турниров</h1>
          <p className="av-sub">Первенство СПб · выбери турниры — метрики бок о бок</p>
        </div>
      </header>

      {tq.isLoading ? <div className="av-skeleton" style={{ height: 44 }} /> : (
        <div className="av-tabs av-rise">
          {refs.map((r) => <button key={r.key} onClick={() => toggle(r.key)} className={`av-tab${sel.includes(r.key) ? ' av-tab--active' : ''}`}>{r.title}</button>)}
        </div>
      )}
      {tq.error && <div className="av-note" style={{ color: 'var(--av-danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}

      {cq.isLoading ? <section className="av-surface av-pad"><div className="av-skeleton" style={{ height: 260 }} /></section> : items.length > 0 && (
        <section className="av-surface av-pad av-rise">
          <div style={{ overflowX: 'auto' }}>
            <table className="av-dt">
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Показатель</th>
                  {items.map((it) => <th key={it.ref.key}>{it.ref.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const bi = bestIdx(m.k);
                  return (
                    <tr key={m.k}>
                      <td className="av-muted">{m.l}</td>
                      {items.map((it, i) => (
                        <td key={it.ref.key} className={i === bi ? 'av-dt__best av-num' : 'av-num'}>{fmt(it[m.k])}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="av-dim" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
            Голы/матчи/карточки — по всем турам; игроки и рейтинг — с разобранных матчей. Турнир «Вторая Лига» (коллеги) встанет колонкой здесь же после подключения их выгрузки PDF+CSV.
          </p>
        </section>
      )}
    </>
  );
}
