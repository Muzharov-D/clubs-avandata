import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { useFedYear, yearQ } from './avYear';
import './avandata.css';

interface RPlayer { id: number; name: string; position: string | null; club: string | null; clubLogo: string | null; rating: number | null }
interface Quarter { q: number; n: number; pct: number }
interface AgeEffect { total: number; quarters: Quarter[]; q1pct: number; q4pct: number; skew: number | null }
interface DivStrength { division: string; clubs: number; avgRating: number | null; topClub: string | null }
interface Concentration { topPool: number; totalClubs: number; top3Share: number; top5Share: number; clubs: Array<{ club: string; logo: string | null; n: number; share: number }> }

const num = (n: number) => n.toLocaleString('ru-RU');
const QLABEL = ['янв–мар', 'апр–июн', 'июл–сен', 'окт–дек'];

/** Справедливость и утечка — диагнозы, видимые только над всеми клубами региона. */
export function FederationAvInsights() {
  const { year } = useFedYear();
  const q = yearQ(year);
  const ae = useQuery({ queryKey: ['av', 'age', year], queryFn: () => api<AgeEffect>(`/federation/av/age-effect${q}`) });
  const ds = useQuery({ queryKey: ['av', 'divstr', year], queryFn: () => api<{ divisions: DivStrength[] }>(`/federation/av/division-strength${q}`) });
  const tc = useQuery({ queryKey: ['av', 'conc', year], queryFn: () => api<Concentration>(`/federation/av/concentration${q}`) });
  const pq = useQuery({ queryKey: ['av', 'players', year], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${q}`) });

  const top = useMemo(() => (pq.data?.players ?? []).filter((p) => p.rating != null).slice(0, 8), [pq.data]);
  const divs = ds.data?.divisions ?? [];
  const gap = divs.length >= 2 && divs[1].avgRating ? Math.round(((divs[0].avgRating ?? 0) / (divs[1].avgRating || 1)) * 10) / 10 : null;

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <span className="av-kicker">Диагностика региона</span>
          <h1 className="av-title">Справедливость и утечка</h1>
          <p className="av-sub">Кого регион теряет — видно только над всеми клубами сразу · {year == null ? 'все возрасты' : `${year} г.р.`}</p>
        </div>
        <Link to="/federation/cohorts" className="av-link">По когортам →</Link>
      </header>

      {/* НАХОДКА 1 — Возрастная утечка (RAE), герой */}
      <section className="av-surface av-finding av-finding--hero av-pad-lg av-rise">
        <span className="av-finding__kicker">⏳ Возрастная утечка · RAE</span>
        {ae.isLoading ? <div className="av-skeleton" style={{ height: 240, marginTop: 14 }} /> : ae.data && (() => {
          const lost = ae.data.q4pct < 25 ? Math.round((ae.data.total * (25 - ae.data.q4pct)) / 100) : 0;
          return (
            <>
              <div className="av-finding__top">
                <div className="av-hero-fig">
                  <span className="av-hero-fig__n">×{ae.data.skew ?? '—'}</span>
                  <span className="av-hero-fig__l">перекос Q1 ⁄ Q4</span>
                </div>
                <div>
                  <h2 className="av-verdict" style={{ marginTop: 0 }}>Регион тихо теряет поздно-рождённых: в начале года отбирают в <b>{ae.data.skew ?? '—'}×</b> больше игроков, чем в конце</h2>
                  <p className="av-why">На <b style={{ color: 'var(--av-text)' }}>{num(ae.data.total)}</b> игроках с известной датой рождения. Эталон равномерности — 25% на квартал. Перекос к Q1 = отбор в пользу физически старших внутри возраста; поздних отсеивают, не замечая.</p>
                  {lost > 0 && <p className="av-stakes">Ставка: ≈ <b>{num(lost)}</b> игроков поздних кварталов недосчитались относительно равномерности — отсеяны не по способностям, а по месяцу рождения.</p>}
                </div>
              </div>
              <RaeBars quarters={ae.data.quarters} />
            </>
          );
        })()}
      </section>

      <div className="av-cols-2 av-rise">
        {/* НАХОДКА 2 — Пропасть лиг */}
        <section className="av-surface av-finding av-finding--cyan av-pad-lg">
          <span className="av-finding__kicker">🪢 Пропасть лиг</span>
          {ds.isLoading ? <div className="av-skeleton" style={{ height: 170, marginTop: 14 }} /> : divs.length >= 2 ? (
            <>
              <h2 className="av-verdict">{divs[0].division} сильнее {divs[1].division} в <b>{gap ?? '—'}×</b> по среднему рейтингу</h2>
              <div className="av-gap" style={{ marginTop: 16 }}>
                <div className="av-gap__cell">
                  <div className="av-gap__big" style={{ color: 'var(--av-cyan)' }}>{num(divs[0].avgRating ?? 0)}</div>
                  <div className="av-gap__lbl">{divs[0].division}</div>
                </div>
                <span className="av-gap__x">×{gap}</span>
                <div className="av-gap__cell">
                  <div className="av-gap__big" style={{ color: 'var(--av-text-2)' }}>{num(divs[1].avgRating ?? 0)}</div>
                  <div className="av-gap__lbl">{divs[1].division}</div>
                </div>
              </div>
              <p className="av-why" style={{ marginTop: 16 }}>Талант сконцентрирован в верхнем дивизионе — разрыв между лигами огромный, середина проваливается.</p>
            </>
          ) : <div className="av-note">Недостаточно дивизионов для сравнения.</div>}
        </section>

        {/* НАХОДКА 3 — Монополия таланта */}
        <section className="av-surface av-finding av-pad-lg">
          <span className="av-finding__kicker">🏰 Монополия таланта</span>
          {tc.isLoading ? <div className="av-skeleton" style={{ height: 170, marginTop: 14 }} /> : tc.data && (
            <>
              <h2 className="av-verdict">3 клуба держат <b>{tc.data.top3Share}%</b> сильнейших талантов региона</h2>
              <p className="av-why" style={{ marginBottom: 12 }}>Пул — топ-30 игроков каждого возраста ({tc.data.topPool} талантов), клубы схлопнуты в реальные школы (без года команды).</p>
              {tc.data.clubs.slice(0, 6).map((c) => {
                const max = Math.max(...tc.data!.clubs.map((x) => x.n), 1);
                return (
                  <div key={c.club} className="av-trow t-mono">
                    <ClubShield name={c.club} logoUrl={c.logo} size={22} />
                    <span className="av-trow__name">{c.club}</span>
                    <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(c.n / max) * 100}%`, background: 'var(--av-magenta)' }} /></span>
                    <span className="av-num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--av-magenta)' }}>{c.share}%</span>
                  </div>
                );
              })}
            </>
          )}
        </section>
      </div>

      {/* НАХОДКА 4 — Невидимая середина */}
      <section className="av-surface av-finding av-finding--cyan av-pad-lg av-rise">
        <span className="av-finding__kicker">🔦 Невидимая середина</span>
        <h2 className="av-verdict">Сильнейшие региона — кто бы их ни воспитал</h2>
        <p className="av-why" style={{ marginBottom: 12 }}>Рейтинг талантов поверх клубных границ. Знаменатель есть только у федерации.</p>
        {pq.isLoading ? <div className="av-skeleton" style={{ height: 200 }} /> : (
          <div className="av-cols-2" style={{ gap: 8 }}>
            {top.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="av-trow t-board av-trow--link">
                <span className={`av-trow__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`}>{i + 1}</span>
                <ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={24} />
                <div style={{ minWidth: 0 }}><div className="av-trow__name">{p.name}</div><div className="av-trow__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}</div></div>
                <span className="av-rate">{p.rating}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function RaeBars({ quarters }: { quarters: Quarter[] }) {
  const maxPct = Math.max(...quarters.map((q) => q.pct), 25);
  const scale = Math.ceil((maxPct * 1.12) / 5) * 5;
  return (
    <div style={{ marginTop: 18 }}>
      {quarters.map((qd) => {
        const over = qd.pct >= 25;
        return (
          <div key={qd.q} className="av-rae__row">
            <span className="av-rae__label">Q{qd.q} · {QLABEL[qd.q - 1]}</span>
            <span className="av-rae__track">
              <span className="av-rae__ref" style={{ left: `${(25 / scale) * 100}%` }} />
              <span className="av-rae__reflabel" style={{ left: `${(25 / scale) * 100}%` }}>эталон 25%</span>
              <span className="av-rae__fill" style={{ width: `${(qd.pct / scale) * 100}%`, background: over ? 'var(--av-magenta)' : 'var(--av-cyan)', opacity: over ? 1 : 0.7 }} />
            </span>
            <span className="av-rae__val" style={{ color: over ? 'var(--av-magenta)' : 'var(--av-cyan)' }}>{qd.pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
