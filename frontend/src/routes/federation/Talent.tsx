import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ratingColor, tint, healthColor } from './fedColors';
import './federation.css';

interface PlayerRow {
  playerId: string;
  name: string | null;
  club: string;
  ageGroup: string;
  position: string | null;
  matches: number;
  minutes: number;
  rating: number | null;
  attack: number | null;
  defence: number | null;
  passing: number | null;
  fitness: number | null;
  creativity: number | null;
  goals: number;
}

const MIN_OPTIONS = [0, 90, 270, 450];
const DIMS: Array<{ k: keyof PlayerRow; l: string }> = [
  { k: 'attack', l: 'Атк' },
  { k: 'defence', l: 'Обр' },
  { k: 'passing', l: 'Пас' },
  { k: 'fitness', l: 'Физ' },
  { k: 'creativity', l: 'Крв' },
];

/** Бейдж перцентиля рейтинга внутри возраста по региону. */
function AgePct({ pct }: { pct?: number }) {
  if (pct == null) return null;
  return <span className="fed-dim" style={{ fontWeight: 600 }}>перц. возраста<b style={{ color: healthColor(pct), marginLeft: 3 }}>{pct}</b></span>;
}

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
  // Перцентиль рейтинга внутри возраста по региону (знаменатель — есть только у федерации).
  const pctByPlayer = useMemo(() => {
    const m = new Map<string, number>();
    const byAge = new Map<string, PlayerRow[]>();
    for (const p of players) {
      if (p.rating == null) continue;
      const arr = byAge.get(p.ageGroup);
      if (arr) arr.push(p); else byAge.set(p.ageGroup, [p]);
    }
    for (const cohort of byAge.values()) {
      if (cohort.length < 2) continue;
      for (const p of cohort) {
        const below = cohort.filter((x) => (x.rating ?? 0) < (p.rating ?? 0)).length;
        m.set(p.playerId, Math.round((below / (cohort.length - 1)) * 100));
      }
    }
    return m;
  }, [players]);

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
              <Link
                key={p.playerId}
                to={`/federation/players/${encodeURIComponent(p.playerId)}`}
                className="fed-row fed-row--link"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
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
                  <div className="fed-dims">
                    <AgePct pct={pctByPlayer.get(p.playerId)} />
                    {DIMS.map(({ k, l }) => {
                      const v = p[k] as number | null;
                      return v == null ? null : (
                        <span key={l} className="fed-dim">{l}<b style={{ color: ratingColor(v) }}>{v.toFixed(1)}</b></span>
                      );
                    })}
                    {p.goals > 0 && <span className="fed-dim">Голы<b style={{ color: 'var(--text)' }}>{p.goals}</b></span>}
                  </div>
                </div>
                <span className="fed-faint fed-num" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                  {p.matches} м · {p.minutes}′
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
