import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import './avandata.css';

interface RPlayer { id: number; name: string; position: string | null; club: string | null; clubLogo: string | null; rating: number | null; birthYear: number | null }
interface Agg { ref: { key: string; title: string }; goals: number; goalsPerMatch: number | null }
interface Overview { byTournament: Agg[] }

/** Открытия региона — находки, видимые только над всеми клубами разом. */
export function FederationAvInsights() {
  const pq = useQuery({ queryKey: ['av', 'players'], queryFn: () => api<{ players: RPlayer[] }>('/federation/av/players') });
  const oq = useQuery({ queryKey: ['av', 'overview'], queryFn: () => api<Overview>('/federation/av/overview') });
  const players = pq.data?.players ?? [];

  const top = useMemo(() => players.filter((p) => p.rating != null).slice(0, 10), [players]);
  const forges = useMemo(() => {
    const top150 = players.slice(0, 150);
    const byClub = new Map<string, { club: string; logo: string | null; n: number; sum: number }>();
    for (const p of top150) { if (!p.club) continue; const e = byClub.get(p.club) ?? { club: p.club, logo: p.clubLogo, n: 0, sum: 0 }; e.n += 1; e.sum += p.rating ?? 0; byClub.set(p.club, e); }
    return [...byClub.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [players]);
  const goalLeaders = useMemo(() => [...(oq.data?.byTournament ?? [])].filter((t) => t.goalsPerMatch != null).sort((a, b) => (b.goalsPerMatch ?? 0) - (a.goalsPerMatch ?? 0)).slice(0, 6), [oq.data]);
  const maxGpm = Math.max(...goalLeaders.map((t) => t.goalsPerMatch ?? 0), 1);

  return (
    <>
      <header className="av-head av-rise">
        <div>
          <h1 className="av-title">Открытия региона</h1>
          <p className="av-sub">Картина, видимая только над всеми клубами разом</p>
        </div>
      </header>

      {/* Хедлайн — топ таланты */}
      <section className="av-surface av-surface--glow av-pad av-rise">
        <span className="av-chip av-chip--accent">🔦 Невидимая середина</span>
        <h2 className="av-title" style={{ fontSize: 19, margin: '10px 0 4px' }}>Топ-10 талантов Первенства по данным разборов</h2>
        <p className="av-section-sub" style={{ marginBottom: 12 }}>Сильнейшие игроки региона — независимо от того, в топ-клубе они или нет.</p>
        {pq.isLoading ? <div className="av-skeleton" style={{ height: 200 }} /> : (
          <div className="av-row-list">
            {top.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="av-row av-row--link" style={{ gridTemplateColumns: '1.6rem 24px 1fr auto', textDecoration: 'none', color: 'inherit' }}>
                <span className="av-row__rank" style={{ color: i < 3 ? 'var(--av-accent)' : undefined }}>{i + 1}</span>
                <ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={22} />
                <div style={{ minWidth: 0 }}><div className="av-row__name">{p.name}</div><div className="av-row__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}</div></div>
                <span className="av-rate">{p.rating}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="av-cols av-rise">
        {/* Кузницы таланта */}
        <section className="av-surface av-pad">
          <span className="av-chip av-chip--magenta">🏭 Кузницы таланта</span>
          <h2 className="av-title" style={{ fontSize: 17, margin: '10px 0 4px' }}>Кто производит сильнейших</h2>
          <p className="av-section-sub" style={{ marginBottom: 12 }}>Клубы по числу игроков в топ-150 региона.</p>
          {pq.isLoading ? <div className="av-skeleton" style={{ height: 180 }} /> : (
            <div className="av-row-list">
              {forges.map((f) => {
                const max = Math.max(...forges.map((x) => x.n), 1);
                return (
                  <div key={f.club} className="av-row" style={{ gridTemplateColumns: '24px 1fr 70px 28px' }}>
                    <ClubShield name={f.club} logoUrl={f.logo} size={22} />
                    <span className="av-row__name">{f.club}</span>
                    <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(f.n / max) * 100}%`, background: 'var(--av-magenta)' }} /></span>
                    <span className="av-num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--av-magenta)' }}>{f.n}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Где рождаются голы */}
        <section className="av-surface av-pad">
          <span className="av-chip av-chip--success">⚽ ДНК турниров</span>
          <h2 className="av-title" style={{ fontSize: 17, margin: '10px 0 4px' }}>Где рождаются голы</h2>
          <p className="av-section-sub" style={{ marginBottom: 12 }}>Голов на матч по турнирам — кто играет ярче.</p>
          {oq.isLoading ? <div className="av-skeleton" style={{ height: 180 }} /> : (
            <div className="av-row-list">
              {goalLeaders.map((t) => (
                <div key={t.ref.key} className="av-row" style={{ gridTemplateColumns: '1fr 90px 48px' }}>
                  <span className="av-row__name">{t.ref.title}</span>
                  <span className="av-meter"><span className="av-meter__fill" style={{ width: `${((t.goalsPerMatch ?? 0) / maxGpm) * 100}%`, background: 'var(--av-success)' }} /></span>
                  <span className="av-num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--av-success)' }}>{t.goalsPerMatch}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
