import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import './federation.css';

interface TRef { key: string; title: string; fullTitle: string; category: string; divisionTitle: string; lastPlayedTour: number }
interface Agg {
  ref: TRef;
  teams: number; players: number; matches: number; analyzed: number; goals: number;
  goalsPerMatch: number | null; yellowPerMatch: number | null; avgRating: number | null;
}

type MetricKey = 'teams' | 'players' | 'matches' | 'analyzed' | 'goals' | 'goalsPerMatch' | 'yellowPerMatch' | 'avgRating';
const METRICS: Array<{ k: MetricKey; l: string; dim?: boolean }> = [
  { k: 'teams', l: 'Команды' },
  { k: 'matches', l: 'Матчей' },
  { k: 'analyzed', l: 'Разобрано' },
  { k: 'goals', l: 'Голы' },
  { k: 'goalsPerMatch', l: 'Голы / матч' },
  { k: 'yellowPerMatch', l: 'Жёлтые / матч' },
  { k: 'players', l: 'Игроки (разобр.)' },
  { k: 'avgRating', l: 'Ср. рейтинг', dim: true },
];

const fmt = (v: number | null) => (v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(2));

/**
 * Сравнение турниров между собой (реальная база Первенства). Выбираешь N
 * турниров×дивизионов — выровненные метрики бок о бок. Колонка под Вторую Лигу
 * (коллеги, PDF+CSV) встанет сюда же позже. Данные — прокси /federation/av/*.
 */
export function FederationAvCompare() {
  const tq = useQuery({ queryKey: ['av', 'tournaments'], queryFn: () => api<{ tournaments: TRef[] }>('/federation/av/tournaments') });
  const refs = tq.data?.tournaments ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  // дефолт — два первых турнира с сыгранными турами
  const sel = useMemo(() => {
    if (selected.length) return selected;
    const withTours = refs.filter((r) => r.lastPlayedTour > 1).slice(0, 2).map((r) => r.key);
    return withTours.length >= 2 ? withTours : refs.slice(0, 2).map((r) => r.key);
  }, [selected, refs]);

  const cq = useQuery({
    queryKey: ['av', 'compare', sel.join(',')],
    queryFn: () => api<{ items: Agg[] }>(`/federation/av/compare?keys=${encodeURIComponent(sel.join(','))}`),
    enabled: sel.length >= 1,
  });
  const items = cq.data?.items ?? [];

  function toggle(key: string) {
    const base = selected.length ? selected : sel;
    setSelected(base.includes(key) ? base.filter((k) => k !== key) : [...base, key]);
  }

  // лучший в строке (макс), для жёлтых меньше = лучше — но просто подсветим макс нейтрально
  const bestIdx = (k: MetricKey): number => {
    let bi = -1, bv = -Infinity;
    items.forEach((it, i) => { const v = it[k]; if (v != null && v > bv) { bv = v; bi = i; } });
    return bi;
  };

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Сравнение турниров</h1>
          <p className="fed-sub">Первенство СПб · реальная база разборов · выбери турниры для сравнения</p>
        </div>
      </header>

      {/* выбор турниров */}
      {tq.isLoading ? <div className="fed-skeleton" style={{ height: 44, marginBottom: 16 }} /> : (
        <div className="fed-tabs" style={{ marginBottom: 18 }}>
          {refs.map((r) => (
            <button key={r.key} onClick={() => toggle(r.key)} className={`fed-tab${sel.includes(r.key) ? ' fed-tab--active' : ''}`}>
              {r.title}
            </button>
          ))}
        </div>
      )}

      {tq.error && <div className="fed-note" style={{ color: 'var(--danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}

      {sel.length < 1 ? (
        <div className="fed-empty"><div className="fed-empty__icon">⚖️</div>Выбери хотя бы один турнир.</div>
      ) : cq.isLoading ? (
        <section className="fed-card"><div className="fed-card__pad"><div className="fed-skeleton" style={{ height: 260 }} /></div></section>
      ) : (
        <section className="fed-card fed-rise">
          <div className="fed-table__scroll">
            <table className="fed-dt">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Показатель</th>
                  {items.map((it) => <th key={it.ref.key} style={{ textAlign: 'right' }}>{it.ref.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const bi = bestIdx(m.k);
                  return (
                    <tr key={m.k}>
                      <td style={{ color: m.dim ? 'var(--text-muted)' : 'var(--text)' }}>{m.l}</td>
                      {items.map((it, i) => (
                        <td key={it.ref.key} style={{ textAlign: 'right', fontWeight: i === bi ? 700 : 400, color: i === bi ? 'var(--accent-cyan)' : undefined }}>
                          {fmt(it[m.k])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="fed-card__pad" style={{ paddingTop: 10 }}>
            <p className="fed-faint" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
              Голы/матчи/карточки — по всем турам; игроки и рейтинг — только с разобранных матчей (наполняются по мере разбора).
              Турнир «Вторая Лига» (коллеги) встанет колонкой здесь же после подключения их выгрузки.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
