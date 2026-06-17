import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import './federation.css';

interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; rating: number | null }

/**
 * Игроки региона из РЕАЛЬНОЙ базы разборов (прокси /federation/av/players).
 * Только с разобранных матчей. Рейтинг — сырая шкала источника.
 */
export function FederationAvPlayers() {
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'players'], queryFn: () => api<{ players: RPlayer[] }>('/federation/av/players') });
  const players = data?.players ?? [];
  const [club, setClub] = useState<string>('all');
  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.club).filter(Boolean))).sort() as string[], [players]);
  const shown = useMemo(() => (club === 'all' ? players : players.filter((p) => p.club === club)), [players, club]);

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Игроки региона</h1>
          <p className="fed-sub">Первенство СПб · реальная база · {players.length} разобранных игроков</p>
        </div>
      </header>

      {clubs.length > 1 && (
        <div className="fed-tabs" style={{ marginBottom: 16 }}>
          <button onClick={() => setClub('all')} className={`fed-tab${club === 'all' ? ' fed-tab--active' : ''}`}>все клубы</button>
          {clubs.map((c) => (
            <button key={c} onClick={() => setClub(c)} className={`fed-tab${club === c ? ' fed-tab--active' : ''}`}>{c}</button>
          ))}
        </div>
      )}

      {isLoading && <section className="fed-card"><div className="fed-card__pad">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fed-skeleton" style={{ height: 40, marginBottom: 8 }} />)}</div></section>}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}
      {data && shown.length === 0 && <div className="fed-empty"><div className="fed-empty__icon">🎯</div>Нет разобранных игроков по фильтру.</div>}

      {shown.length > 0 && (
        <section className="fed-card fed-rise">
          <div className="fed-table" style={{ padding: '0 8px' }}>
            {shown.map((p, i) => (
              <div key={p.id} className="fed-row">
                <span className="fed-faint fed-num" style={{ width: 28, fontSize: 12 }}>{i + 1}</span>
                <span className="fed-rate" style={{ flex: 'none', background: 'var(--bg-surface-2)', color: 'var(--text)' }}>
                  {p.rating ?? '—'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fed-row__name">{p.name}</div>
                  <div className="fed-row__meta">
                    {p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear} г.р.` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
