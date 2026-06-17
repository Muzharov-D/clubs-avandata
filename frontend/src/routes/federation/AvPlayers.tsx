import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import './avandata.css';

interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; rating: number | null }

/** Игроки региона — реальный реестр Первенства, клик → профиль с «пиццей». */
export function FederationAvPlayers() {
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'players'], queryFn: () => api<{ players: RPlayer[] }>('/federation/av/players') });
  const players = data?.players ?? [];
  const [club, setClub] = useState('all');
  const [qStr, setQStr] = useState('');

  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.club).filter(Boolean))).sort() as string[], [players]);
  const shown = useMemo(() => {
    let list = players;
    if (club !== 'all') list = list.filter((p) => p.club === club);
    if (qStr.trim()) { const q = qStr.toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(q)); }
    return list.slice(0, 250);
  }, [players, club, qStr]);

  return (
    <>
      <header className="av-head av-rise">
        <div>
          <h1 className="av-title">Игроки региона</h1>
          <p className="av-sub">Первенство СПб · {players.length.toLocaleString('ru-RU')} разобранных игроков · клик → профиль</p>
        </div>
        <input className="av-search" placeholder="Поиск по имени…" value={qStr} onChange={(e) => setQStr(e.target.value)} />
      </header>

      {clubs.length > 1 && (
        <div className="av-tabs av-rise" style={{ marginBottom: 4 }}>
          <button onClick={() => setClub('all')} className={`av-tab${club === 'all' ? ' av-tab--active' : ''}`}>все клубы</button>
          {clubs.slice(0, 24).map((c) => <button key={c} onClick={() => setClub(c)} className={`av-tab${club === c ? ' av-tab--active' : ''}`}>{c}</button>)}
        </div>
      )}

      {isLoading && <section className="av-surface av-pad">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="av-skeleton" style={{ height: 40, marginBottom: 8 }} />)}</section>}
      {error && <div className="av-note" style={{ color: 'var(--av-danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}
      {data && shown.length === 0 && <div className="av-empty"><div className="av-empty__icon">🎯</div>Никого не нашли по фильтру.</div>}

      {shown.length > 0 && (
        <section className="av-surface av-pad av-rise">
          <div className="av-row-list">
            {shown.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="av-row av-row--link" style={{ gridTemplateColumns: '2rem 26px 1fr auto', textDecoration: 'none', color: 'inherit' }}>
                <span className="av-row__rank">{i + 1}</span>
                <ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={24} />
                <div style={{ minWidth: 0 }}>
                  <div className="av-row__name">{p.name}</div>
                  <div className="av-row__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                </div>
                <span className={`av-rate${p.rating != null && p.rating < 0 ? ' av-rate--neg' : ''}`}>{p.rating ?? '—'}</span>
              </Link>
            ))}
          </div>
          {players.length > shown.length && <p className="av-dim" style={{ fontSize: 11.5, marginTop: 10 }}>Показаны топ-{shown.length} из {players.length.toLocaleString('ru-RU')} по рейтингу. Уточни клубом или поиском.</p>}
        </section>
      )}
    </>
  );
}
