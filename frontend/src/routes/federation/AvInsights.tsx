import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { ratingColor } from './ratings';
import { useFedYear, yearQ, fedQ } from './avYear';
import './avandata.css';

interface RPlayer { id: number; name: string; position: string | null; club: string | null; clubLogo: string | null; rating: number | null }
interface Quarter { q: number; n: number; pct: number }
interface AgeEffect { total: number; quarters: Quarter[]; q1pct: number; q4pct: number; skew: number | null }
interface DivStrength { division: string; clubs: number; avgRating: number | null; topClub: string | null }

const num = (n: number) => n.toLocaleString('ru-RU');
const QLABEL = ['янв–мар', 'апр–июн', 'июл–сен', 'окт–дек'];

/** Справедливость и утечка — диагнозы, видимые только над всеми клубами региона. */
export function FederationAvInsights() {
  const { year, division } = useFedYear();
  const q = yearQ(year);
  const fq = fedQ(year, division);
  // RAE и «сила дивизионов» — кросс-дивизионные диагнозы (реестр без дивизиона / сравнение лиг), без фильтра.
  const ae = useQuery({ queryKey: ['av', 'age', year], queryFn: () => api<AgeEffect>(`/federation/av/age-effect${q}`) });
  const ds = useQuery({ queryKey: ['av', 'divstr', year], queryFn: () => api<{ divisions: DivStrength[] }>(`/federation/av/division-strength${q}`) });
  // Лучшие — внутри выбранной лиги.
  const pq = useQuery({ queryKey: ['av', 'players', year, division], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fq}`) });

  const top = useMemo(() => (pq.data?.players ?? []).filter((p) => p.rating != null).slice(0, 8), [pq.data]);
  const divs = ds.data?.divisions ?? [];
  const gap = divs.length >= 2 && divs[1].avgRating ? Math.round(((divs[0].avgRating ?? 0) / (divs[1].avgRating || 1)) * 10) / 10 : null;

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Эффект возраста</h1>
          <p className="av-sub">Эффект возраста рождения и сила дивизионов</p>
        </div>
        <Link to="/federation/cohorts" className="av-link">Разбор по годам рождения →</Link>
      </header>

      {/* НАХОДКА 1 — Возрастная утечка (RAE), герой */}
      <section className="av-surface av-finding av-finding--hero av-pad-lg av-rise">
        <span className="av-finding__kicker">Эффект возраста рождения</span>
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

      {/* НАХОДКА 2 — Пропасть лиг (концентрация талантов переехала в «Клубы») */}
      <section className="av-surface av-finding av-finding--cyan av-pad-lg av-rise">
        <span className="av-finding__kicker">Сила дивизионов</span>
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
            <p className="av-why" style={{ marginTop: 16 }}>Талант сконцентрирован в верхнем дивизионе — разрыв между лигами огромный, середина проваливается. Кто именно производит топ-талант — в разделе «Клубы».</p>
          </>
        ) : <div className="av-note">Недостаточно дивизионов для сравнения.</div>}
      </section>

      {/* НАХОДКА 4 — Невидимая середина */}
      <section className="av-surface av-finding av-finding--cyan av-pad-lg av-rise">
        <span className="av-finding__kicker">Лучшие игроки региона</span>
        <h2 className="av-verdict">Сильнейшие региона — кто бы их ни воспитал</h2>
        <p className="av-why" style={{ marginBottom: 12 }}>Рейтинг талантов поверх клубных границ. Знаменатель есть только у федерации.</p>
        {pq.isLoading ? <div className="av-skeleton" style={{ height: 200 }} /> : (
          <div className="av-cols-2" style={{ gap: 8 }}>
            {top.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="av-trow t-board av-trow--link">
                <span className={`av-trow__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`}>{i + 1}</span>
                <ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={24} />
                <div style={{ minWidth: 0 }}><div className="av-trow__name">{p.name}</div><div className="av-trow__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}</div></div>
                <span className="av-rate" style={{ color: ratingColor(p.rating) }}>{p.rating}</span>
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
        const delta = Math.round((qd.pct - 25) * 10) / 10;
        return (
          <div key={qd.q} className="av-rae__row">
            <span className="av-rae__label">Q{qd.q} · {QLABEL[qd.q - 1]}</span>
            <span className="av-rae__track">
              <span className="av-rae__ref" style={{ left: `${(25 / scale) * 100}%` }} />
              <span className="av-rae__reflabel" style={{ left: `${(25 / scale) * 100}%` }}>эталон 25%</span>
              <span className="av-rae__fill" style={{ width: `${(qd.pct / scale) * 100}%`, background: over ? 'var(--av-magenta)' : 'var(--av-cyan)', opacity: over ? 1 : 0.7 }} />
            </span>
            <span className="av-rae__val" style={{ color: over ? 'var(--av-magenta)' : 'var(--av-cyan)' }}>{qd.pct}%</span>
            <span className="av-rae__delta" style={{ color: delta > 0 ? 'var(--av-magenta)' : delta < 0 ? 'var(--av-danger)' : 'var(--av-text-muted)' }}>{delta > 0 ? '+' : ''}{delta}<i>&nbsp;п.п.</i></span>
          </div>
        );
      })}
      <p className="av-rae__cap"><b style={{ color: 'var(--av-magenta)' }}>+п.п.</b> — отобрано БОЛЬШЕ эталона 25% (физически старшие), <b style={{ color: 'var(--av-danger)' }}>−п.п.</b> — недобор (теряем). Сумма отклонений = масштаб перекоса.</p>
    </div>
  );
}
