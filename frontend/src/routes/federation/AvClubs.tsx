import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { FedError } from './FedState';
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
        <div className="av-head__l">
          <h1 className="av-title">Клубы региона</h1>
          <p className="av-sub">Рейтинг клубов по очкам · по дивизионам</p>
        </div>
      </header>

      {/* Сила лиг */}
      {ds.isLoading ? <div className="av-skeleton av-rise" style={{ height: 116 }} /> : (
        <div className="av-leagues av-rise">
          {(ds.data?.divisions ?? []).map((l, i) => (
            <div key={l.division} className={`av-surface av-league${i === 0 ? ' av-surface-glow' : ''}`}>
              <div className="av-league__name">{l.division}</div>
              <div className="av-league__big" style={{ color: i === 0 ? 'var(--av-cyan)' : 'var(--av-blue-glow)' }}>{l.avgRating != null ? num(l.avgRating) : '—'}</div>
              <div className="av-league__sub">средний рейтинг · {l.clubs} клубов{l.topClub ? ` · лидер ${l.topClub}` : ''}</div>
            </div>
          ))}
        </div>
      )}

      {divisions.length > 1 && (
        <div className="av-pills av-rise">
          <button onClick={() => setDiv('all')} className={`av-pill${div === 'all' ? ' av-pill--active' : ''}`}>все дивизионы</button>
          {divisions.map((dn) => <button key={dn} onClick={() => setDiv(dn)} className={`av-pill${div === dn ? ' av-pill--active' : ''}`}>{dn}</button>)}
        </div>
      )}

      {cr.error && <FedError />}
      {cr.isLoading ? <section className="av-surface av-pad-lg av-rise"><div className="av-skeleton" style={{ height: 320 }} /></section> : (
        <section className="av-surface av-pad-lg av-rise">
          <div className="av-section"><h2 className="av-section-title">Рейтинг клубов</h2></div>
          {shown.map((r, i) => (
            <div key={`${r.id}-${r.division}`} className={`av-trow t-pow${i === 0 ? ' av-trow--lead' : ''}`}>
              <span className={`av-trow__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`}>{i + 1}</span>
              <ClubShield name={r.name} logoUrl={r.logo} size={26} />
              <span className="av-trow__name" title={r.name}>{r.name}</span>
              <span className="av-chip av-chip--cyan" style={{ justifySelf: 'start' }}>{r.division}</span>
              <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(Math.abs(r.rating) / max) * 100}%`, background: r.rating < 0 ? 'var(--av-danger)' : i === 0 ? 'var(--av-cyan)' : 'var(--av-blue-glow)' }} /></span>
              <span className={`av-rate${r.rating < 0 ? ' av-rate--neg' : ''}`}>{num(r.rating)}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
