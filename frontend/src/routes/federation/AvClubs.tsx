import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { ClubCard } from './ClubCard';
import { FedError } from './FedState';
import { useFedYear, yearQ, fedQ, inDivision } from './avYear';
import './avandata.css';

interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface DivStrength { division: string; clubs: number; avgRating: number | null; topRating: number | null; topClub: string | null }
interface Concentration { topPool: number; totalClubs: number; top3Share: number; top5Share: number; clubs: Array<{ club: string; logo: string | null; n: number; share: number }> }

const num = (n: number) => n.toLocaleString('ru-RU');

/** Клубы региона — рейтинг школ по данным + сила лиг + кто производит талант. */
export function FederationAvClubs() {
  const { division } = useFedYear();
  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Клубы региона</h1>
          <p className="av-sub">Рейтинг клубов по очкам · {division} лига</p>
        </div>
      </header>
      <ClubsBody />
    </>
  );
}

/**
 * Тело «Клубов региона» — сила лиг + кто производит талант + рейтинг клубов.
 * Когорта/лига: server-side через yearQ/fedQ из глобального useFedYear (год +
 * дивизион фильтруют данные на бэке). Самонесущее, без шапки экрана.
 */
export function ClubsBody() {
  const { year, division } = useFedYear();
  const q = yearQ(year);
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });
  const ds = useQuery({ queryKey: ['av', 'divstr', year], queryFn: () => api<{ divisions: DivStrength[] }>(`/federation/av/division-strength${q}`) });
  const tc = useQuery({ queryKey: ['av', 'conc', year, division], queryFn: () => api<Concentration>(`/federation/av/concentration${fedQ(year, division)}`) });

  const [selectedClub, setSelectedClub] = useState<number | null>(null);
  const groups = cr.data?.groups ?? [];
  const all = useMemo(() => groups.flatMap((g) => g.rows.map((r) => ({ ...r, division: g.division }))).sort((a, b) => b.rating - a.rating), [groups]);
  const shown = all.filter((r) => inDivision(r.division, division));
  const max = Math.max(...shown.map((r) => Math.abs(r.rating)), 1);

  return (
    <>
      {/* Сила лиг — прямое сравнение дивизионов (обе лиги рядом); выбранная подсвечена */}
      {ds.isLoading ? <div className="av-skeleton av-rise" style={{ height: 116 }} /> : (
        <div className="av-leagues av-rise">
          {(ds.data?.divisions ?? []).map((l) => {
            const sel = inDivision(l.division, division);
            return (
              <div key={l.division} className={`av-surface av-league${sel ? ' av-surface-glow' : ''}`}>
                <div className="av-league__name">{l.division}</div>
                <div className="av-league__big" style={{ color: sel ? 'var(--av-cyan)' : 'var(--av-blue-glow)' }}>{l.avgRating != null ? num(l.avgRating) : '—'}</div>
                <div className="av-league__sub">средний рейтинг · {l.clubs} клубов{l.topClub ? ` · лидер ${l.topClub}` : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Кто производит талант — концентрация сильнейших игроков лиги по школам */}
      <section className="av-surface av-pad-lg av-rise">
        <div className="av-section">
          <h2 className="av-section-title">Кто производит талант</h2>
          <span className="av-section-sub" style={{ margin: 0 }}>Доля сильнейших игроков {division} лиги по школам</span>
        </div>
        {tc.isLoading ? <div className="av-skeleton" style={{ height: 240 }} /> : tc.data && tc.data.clubs.length > 0 ? (() => {
          const d = tc.data;
          const maxN = Math.max(...d.clubs.map((c) => c.n), 1);
          return (
            <>
              <h3 className="av-verdict" style={{ marginTop: 0 }}>3 клуба держат <b style={{ color: 'var(--av-warning)' }}>{d.top3Share}%</b> сильнейших талантов лиги</h3>
              <p className="av-why" style={{ marginBottom: 14 }}>Пул — топ-30 игроков каждого возраста ({d.topPool} талантов из {d.totalClubs} школ); клубы схлопнуты в реальные школы (без года команды). Топ-5 школ — <b style={{ color: 'var(--av-text)' }}>{d.top5Share}%</b>.</p>
              {d.clubs.slice(0, 10).map((c) => (
                <div key={c.club} className="av-trow t-mono">
                  <ClubShield name={c.club} logoUrl={c.logo} size={24} />
                  <span className="av-trow__name" title={c.club}>{c.club}</span>
                  <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(c.n / maxN) * 100}%`, background: 'var(--av-warning)' }} /></span>
                  <span className="av-num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--av-warning)' }}>{c.share}%</span>
                </div>
              ))}
              {d.totalClubs > d.clubs.slice(0, 10).length && <p className="av-cap">Показаны 10 школ-производителей из {d.totalClubs}.</p>}
            </>
          );
        })() : <div className="av-note">Недостаточно разобранных игроков для оценки.</div>}
      </section>

      {cr.error && <FedError />}
      {cr.isLoading ? <section className="av-surface av-pad-lg av-rise"><div className="av-skeleton" style={{ height: 320 }} /></section> : (
        <section className="av-surface av-pad-lg av-rise">
          <div className="av-section"><h2 className="av-section-title">Рейтинг клубов</h2></div>
          {shown.map((r, i) => (
            <button type="button" key={`${r.id}-${r.division}`} onClick={() => setSelectedClub(r.id)} className={`av-trow t-pow av-trow--btn${i === 0 ? ' av-trow--lead' : ''}`}>
              <span className={`av-trow__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`}>{i + 1}</span>
              <ClubShield name={r.name} logoUrl={r.logo} size={26} />
              <span className="av-trow__name" title={r.name}>{r.name}</span>
              <span className="av-chip av-chip--cyan" style={{ justifySelf: 'start' }}>{r.division}</span>
              <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(Math.abs(r.rating) / max) * 100}%`, background: r.rating < 0 ? 'var(--av-danger)' : i === 0 ? 'var(--av-cyan)' : 'var(--av-blue-glow)' }} /></span>
              <span className={`av-rate${r.rating < 0 ? ' av-rate--neg' : ''}`}>{num(r.rating)}</span>
            </button>
          ))}
        </section>
      )}

      {selectedClub != null && <ClubCard clubId={selectedClub} onClose={() => setSelectedClub(null)} />}
    </>
  );
}
