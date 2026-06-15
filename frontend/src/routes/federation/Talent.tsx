import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ratingColor, tint } from './fedColors';
import './federation.css';

interface PlayerRow {
  name: string | null;
  club: string;
  ageGroup: string;
  position: string | null;
  matches: number;
  minutes: number;
  rating: number | null;
}

const MIN_OPTIONS = [0, 90, 270, 450];

/**
 * Игроки региона / талант-пул (Эпик 5, FR18–19). Рейтинг по индексу
 * эффективности (0–10) из match_players, фильтры мин.минут и возраст. Имя — только
 * при согласии; без согласия игрок ранжируется обезличенно.
 */
export function FederationTalent() {
  const [minMinutes, setMinMinutes] = useState(0);
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'talent', minMinutes],
    queryFn: () => api<{ players: PlayerRow[] }>(`/federation/talent?minMinutes=${minMinutes}`),
  });
  const players = data?.players ?? [];
  const ages = useMemo(() => Array.from(new Set(players.map((p) => p.ageGroup))).sort(), [players]);
  const shown = useMemo(
    () => (ageFilter === 'all' ? players : players.filter((p) => p.ageGroup === ageFilter)),
    [players, ageFilter],
  );

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Игроки региона</h1>
          <p className="fed-sub">Рейтинг по индексу эффективности · против всего пула региона</p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <span className="fed-faint" style={{ fontSize: 12 }}>Мин. минут:</span>
        <div className="fed-tabs">
          {MIN_OPTIONS.map((m) => (
            <button key={m} onClick={() => setMinMinutes(m)} className={`fed-tab${minMinutes === m ? ' fed-tab--active' : ''}`}>
              {m === 0 ? 'все' : m}
            </button>
          ))}
        </div>
        {ages.length > 1 && (
          <>
            <span className="fed-faint" style={{ fontSize: 12, marginLeft: 6 }}>Возраст:</span>
            <div className="fed-tabs">
              <button onClick={() => setAgeFilter('all')} className={`fed-tab${ageFilter === 'all' ? ' fed-tab--active' : ''}`}>все</button>
              {ages.map((a) => (
                <button key={a} onClick={() => setAgeFilter(a)} className={`fed-tab${ageFilter === a ? ' fed-tab--active' : ''}`}>{a}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {isLoading && (
        <section className="fed-card"><div className="fed-card__pad">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="fed-skeleton" style={{ height: 38, marginBottom: 8 }} />)}
        </div></section>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && shown.length === 0 && (
        <div className="fed-empty"><div className="fed-empty__icon">🎯</div>Нет игроков с рейтингом по этим фильтрам.</div>
      )}

      {shown.length > 0 && (
        <section className="fed-card fed-rise">
          <div className="fed-table" style={{ padding: '0 8px' }}>
            {shown.map((p, i) => (
              <div key={i} className="fed-row">
                <span className="fed-faint fed-num" style={{ width: 26, fontSize: 12 }}>{i + 1}</span>
                <span
                  className="fed-rate"
                  style={{
                    flex: 'none',
                    color: p.rating == null ? 'var(--text-faint)' : ratingColor(p.rating),
                    background: p.rating == null ? 'var(--bg-surface-2)' : tint(ratingColor(p.rating)),
                    borderColor: p.rating == null ? 'transparent' : tint(ratingColor(p.rating), 38),
                  }}
                >
                  {p.rating == null ? '—' : p.rating.toFixed(1)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fed-row__name">
                    {p.name ?? <span className="fed-faint" style={{ fontStyle: 'italic' }}>без согласия</span>}
                  </div>
                  <div className="fed-row__meta">
                    {p.club} · {p.ageGroup}{p.position ? ` · ${p.position}` : ''}
                  </div>
                </div>
                <span className="fed-faint fed-num" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                  {p.matches} м · {p.minutes}′
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
