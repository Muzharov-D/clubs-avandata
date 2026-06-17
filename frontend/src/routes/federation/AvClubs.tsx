import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { useFedYear, yearQ } from './avYear';
import './avandata.css';

interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface DivStrength { division: string; clubs: number; avgRating: number | null; topRating: number | null; topClub: string | null }

const num = (n: number) => n.toLocaleString('ru-RU');

/** Сила клубов — пауэр-рейтинг школ по данным разборов + сила лиг. */
export function FederationAvClubs() {
  const { year } = useFedYear();
  const q = yearQ(year);
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });
  const ds = useQuery({ queryKey: ['av', 'divstr', year], queryFn: () => api<{ divisions: DivStrength[] }>(`/federation/av/division-strength${q}`) });
  const [div, setDiv] = useState<string>('all');

  const groups = cr.data?.groups ?? [];
  const divisions = groups.map((g) => g.division);
  const all = useMemo(() => groups.flatMap((g) => g.rows.map((r) => ({ ...r, division: g.division }))).sort((a, b) => b.rating - a.rating), [groups]);
  const shown = div === 'all' ? all : all.filter((r) => r.division === div);
  const max = Math.max(...shown.map((r) => Math.abs(r.rating)), 1);

  return (
    <>
      <header className="av-head av-rise">
        <div>
          <h1 className="av-title">Сила клубов</h1>
          <p className="av-sub">Пауэр-рейтинг школ по данным разборов · {year == null ? 'все возрасты' : `${year} г.р.`}</p>
        </div>
      </header>

      {/* сила лиг */}
      {ds.isLoading ? <div className="av-skeleton" style={{ height: 110 }} /> : (
        <div className="av-leagues av-rise">
          {(ds.data?.divisions ?? []).map((l, i) => (
            <div key={l.division} className={`av-surface av-league ${i === 0 ? 'av-surface--glow' : ''}`}>
              <div className="av-league__name">{l.division}</div>
              <div className="av-league__big" style={{ color: i === 0 ? 'var(--av-accent)' : 'var(--av-blue-glow)' }}>{l.avgRating != null ? num(l.avgRating) : '—'}</div>
              <div className="av-league__sub">средний рейтинг · {l.clubs} клубов</div>
            </div>
          ))}
        </div>
      )}

      {divisions.length > 1 && (
        <div className="av-tabs av-rise">
          <button onClick={() => setDiv('all')} className={`av-tab${div === 'all' ? ' av-tab--active' : ''}`}>все дивизионы</button>
          {divisions.map((dn) => <button key={dn} onClick={() => setDiv(dn)} className={`av-tab${div === dn ? ' av-tab--active' : ''}`}>{dn}</button>)}
        </div>
      )}

      {cr.error && <div className="av-note" style={{ color: 'var(--av-danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}
      {cr.isLoading ? <section className="av-surface av-pad"><div className="av-skeleton" style={{ height: 300 }} /></section> : (
        <section className="av-surface av-pad av-rise">
          <div className="av-row-list">
            {shown.map((r, i) => (
              <div key={r.id} className="av-row" style={{ gridTemplateColumns: '2rem 26px 1fr 90px 1fr 80px' }}>
                <span className="av-row__rank" style={{ color: i < 3 ? 'var(--av-accent)' : undefined, fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</span>
                <ClubShield name={r.name} logoUrl={r.logo} size={24} />
                <span className="av-row__name" title={r.name}>{r.name}</span>
                <span className="av-chip av-chip--accent" style={{ justifySelf: 'start' }}>{r.division}</span>
                <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(Math.abs(r.rating) / max) * 100}%`, background: r.rating < 0 ? 'var(--av-danger)' : i === 0 ? 'var(--av-accent)' : 'var(--av-blue-glow)' }} /></span>
                <span className="av-num" style={{ textAlign: 'right', fontWeight: 700, color: r.rating < 0 ? 'var(--av-danger)' : 'var(--av-accent)', fontSize: 14 }}>{num(r.rating)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
