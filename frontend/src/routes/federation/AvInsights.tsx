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
        <div>
          <h1 className="av-title">Открытия региона</h1>
          <p className="av-sub">Диагнозы, видимые только над всеми клубами разом · {year == null ? 'все возрасты' : `${year} г.р.`}</p>
        </div>
      </header>

      {/* ВЫВОД 1 — Возрастная утечка (RAE) */}
      <section className="av-surface av-surface--glow av-pad av-rise">
        <span className="av-chip av-chip--magenta">⏳ Возрастная утечка</span>
        {ae.isLoading ? <div className="av-skeleton" style={{ height: 200, marginTop: 12 }} /> : ae.data && (
          <>
            <h2 className="av-verdict av-verdict--magenta">
              Регион теряет поздно-рождённых: в начале года рождается <b>{ae.data.skew ?? '—'}×</b> больше игроков, чем в конце
            </h2>
            <p className="av-why">
              На <b style={{ color: 'var(--av-text)' }}>{num(ae.data.total)}</b> игроках региона с известной датой. Эталон равномерности — 25% на квартал.
              Перекос к Q1 = смещение отбора в пользу тех, кто физически старше внутри возраста; поздних — тихо отсеивают. Видно только на агрегате региона.
            </p>
            <RaeBars quarters={ae.data.quarters} />
          </>
        )}
      </section>

      <div className="av-cols av-rise">
        {/* ВЫВОД 2 — Пропасть лиг */}
        <section className="av-surface av-pad">
          <span className="av-chip av-chip--accent">🪢 Пропасть лиг</span>
          {ds.isLoading ? <div className="av-skeleton" style={{ height: 160, marginTop: 12 }} /> : divs.length >= 2 && (
            <>
              <h2 className="av-verdict">Высшая Лига сильнее Первой в <b>{gap ?? '—'}×</b> по среднему рейтингу</h2>
              <div className="av-gap" style={{ marginTop: 14 }}>
                <div className="av-gap__cell">
                  <div className="av-gap__big" style={{ color: 'var(--av-accent)' }}>{num(divs[0].avgRating ?? 0)}</div>
                  <div className="av-gap__lbl">{divs[0].division}</div>
                </div>
                <span className="av-gap__x">×{gap}</span>
                <div className="av-gap__cell">
                  <div className="av-gap__big" style={{ color: 'var(--av-text-2)' }}>{num(divs[1].avgRating ?? 0)}</div>
                  <div className="av-gap__lbl">{divs[1].division}</div>
                </div>
              </div>
              <p className="av-why" style={{ marginTop: 12 }}>Талант сконцентрирован в верхнем дивизионе — разрыв между лигами огромный, середина проваливается.</p>
            </>
          )}
        </section>

        {/* ВЫВОД 3 — Монополия таланта */}
        <section className="av-surface av-pad">
          <span className="av-chip av-chip--magenta">🏰 Монополия таланта</span>
          {tc.isLoading ? <div className="av-skeleton" style={{ height: 160, marginTop: 12 }} /> : tc.data && (
            <>
              <h2 className="av-verdict av-verdict--magenta">3 клуба держат <b>{tc.data.top3Share}%</b> сильнейших талантов региона</h2>
              <div className="av-row-list" style={{ marginTop: 12 }}>
                {tc.data.clubs.slice(0, 6).map((c) => {
                  const max = Math.max(...tc.data!.clubs.map((x) => x.n), 1);
                  return (
                    <div key={c.club} className="av-row" style={{ gridTemplateColumns: '22px 1fr 70px 36px' }}>
                      <ClubShield name={c.club} logoUrl={c.logo} size={20} />
                      <span className="av-row__name">{c.club}</span>
                      <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(c.n / max) * 100}%`, background: 'var(--av-magenta)' }} /></span>
                      <span className="av-num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--av-magenta)' }}>{c.share}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ВЫВОД 4 — Невидимая середина */}
      <section className="av-surface av-pad av-rise">
        <span className="av-chip av-chip--success">🔦 Невидимая середина</span>
        <h2 className="av-verdict">Сильнейшие игроки региона — кто бы их ни воспитал</h2>
        {pq.isLoading ? <div className="av-skeleton" style={{ height: 180, marginTop: 10 }} /> : (
          <div className="av-row-list" style={{ marginTop: 8 }}>
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
    </>
  );
}

function RaeBars({ quarters }: { quarters: Quarter[] }) {
  const maxPct = Math.max(...quarters.map((q) => q.pct), 25);
  const scale = Math.ceil((maxPct * 1.12) / 5) * 5;
  return (
    <div style={{ marginTop: 16 }}>
      {quarters.map((qd) => {
        const over = qd.pct >= 25;
        return (
          <div key={qd.q} className="av-rae__row">
            <span className="av-rae__label">Q{qd.q} · {QLABEL[qd.q - 1]}</span>
            <span className="av-rae__track">
              <span className="av-rae__ref" style={{ left: `${(25 / scale) * 100}%` }} />
              <span className="av-rae__reflabel" style={{ left: `${(25 / scale) * 100}%` }}>эталон 25%</span>
              <span className="av-rae__fill" style={{ width: `${(qd.pct / scale) * 100}%`, background: over ? 'var(--av-magenta)' : 'var(--av-accent)', opacity: over ? 1 : 0.7 }} />
            </span>
            <span className="av-rae__val" style={{ color: over ? 'var(--av-magenta)' : 'var(--av-accent)' }}>{qd.pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
