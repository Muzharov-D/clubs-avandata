import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { useFedYear, yearQ } from './avYear';
import './avandata.css';

interface Overview { divisions: string[]; tournaments: number; teams: number; players: number; matches: number; analyzed: number; goals: number }
interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface DivStrength { division: string; clubs: number; avgRating: number | null; topRating: number | null; topClub: string | null }

const num = (n: number) => n.toLocaleString('ru-RU');

export function FederationAvHome() {
  const { year } = useFedYear();
  const q = yearQ(year);
  const ov = useQuery({ queryKey: ['av', 'overview'], queryFn: () => api<Overview>('/federation/av/overview') });
  const ds = useQuery({ queryKey: ['av', 'divstr', year], queryFn: () => api<{ divisions: DivStrength[] }>(`/federation/av/division-strength${q}`) });
  const st = useQuery({ queryKey: ['av', 'standings', year], queryFn: () => api<{ groups: Group<StandRow>[] }>(`/federation/av/standings${q}`) });
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });
  const d = ov.data;

  return (
    <>
      <header className="av-head av-rise">
        <div>
          <h1 className="av-title">Обзор Первенства</h1>
          <p className="av-sub">Санкт-Петербург · сезон 2026 · {year == null ? 'все возрасты' : `${year} г.р.`}</p>
        </div>
      </header>

      {ov.error && <div className="av-note" style={{ color: 'var(--av-danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}

      {d && (
        <div className="av-kpis av-rise">
          <Kpi label="Турниры" value={d.tournaments} accent="accent" />
          <Kpi label="Команды" value={d.teams} accent="blue" />
          <Kpi label="Игроки" value={d.players} accent="magenta" />
          <Kpi label="Матчи" value={d.matches} extra={`${d.analyzed} разобрано`} accent="accent" />
          <Kpi label="Голы" value={d.goals} accent="success" />
        </div>
      )}

      {/* Сила лиг */}
      <section className="av-rise">
        <h2 className="av-section-title" style={{ marginBottom: 10 }}>Сила лиг {year != null && <span className="av-dim" style={{ fontWeight: 400 }}>· {year} г.р.</span>}</h2>
        {ds.isLoading ? <div className="av-skeleton" style={{ height: 120 }} /> : (
          <div className="av-leagues">
            {(ds.data?.divisions ?? []).map((l, i) => (
              <div key={l.division} className={`av-surface av-league ${i === 0 ? 'av-surface--glow' : ''}`}>
                <div className="av-league__name">{l.division}</div>
                <div className="av-league__big" style={{ color: i === 0 ? 'var(--av-accent)' : 'var(--av-blue-glow)' }}>{l.avgRating != null ? num(l.avgRating) : '—'}</div>
                <div className="av-league__sub">средний рейтинг · {l.clubs} клубов</div>
                {l.topClub && <div className="av-dim" style={{ fontSize: 11.5, marginTop: 8 }}>лидер: <b style={{ color: 'var(--av-text-2)' }}>{l.topClub}</b> {l.topRating != null ? num(l.topRating) : ''}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="av-cols av-rise">
        <section className="av-surface av-pad">
          <div style={{ marginBottom: 12 }}>
            <h2 className="av-section-title">Турнирные таблицы</h2>
            <p className="av-section-sub">Статистика «Наградион» по дивизионам</p>
          </div>
          {st.isLoading ? <Sk /> : (st.data?.groups ?? []).map((g) => <StandingsBlock key={g.division} g={g} />)}
        </section>

        <section className="av-surface av-pad">
          <div style={{ marginBottom: 12 }}>
            <h2 className="av-section-title">Рейтинг клубов · AvanData</h2>
            <p className="av-section-sub">Сила школ по данным разборов</p>
          </div>
          {cr.isLoading ? <Sk /> : (cr.data?.groups ?? []).map((g) => <RatingsBlock key={g.division} g={g} />)}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, extra, accent }: { label: string; value: number; extra?: string; accent: 'accent' | 'blue' | 'magenta' | 'success' }) {
  return (
    <div className={`av-surface av-kpi av-kpi--${accent}`}>
      <div className="av-kpi__label">{label}</div>
      <div className="av-kpi__value">{num(value)}</div>
      {extra && <div className="av-kpi__extra">{extra}</div>}
    </div>
  );
}
const Sk = () => <div className="av-skeleton" style={{ height: 220 }} />;
const pm = (n: number) => (n > 0 ? `+${n}` : String(n));

function StandingsBlock({ g }: { g: Group<StandRow> }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(94,235,252,0.14)', paddingBottom: 6, marginBottom: 6 }}>
        <span style={{ color: 'var(--av-accent)', fontWeight: 700, fontSize: 13 }}>{g.division}</span>
        <span className="av-dim av-num" style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'grid', gridTemplateColumns: 'repeat(6, 1.5rem)', textAlign: 'right' }}>
          <span>И</span><span>В</span><span>Н</span><span>П</span><span>±</span><span>ОЧ</span>
        </span>
      </div>
      {g.rows.map((r, i) => (
        <div key={r.id} className="av-row" style={{ gridTemplateColumns: '1.3rem 22px 1fr auto' }}>
          <span className="av-row__rank">{i + 1}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={20} />
          <span className="av-row__name" title={r.name}>{r.name}</span>
          <span className="av-num" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1.5rem)', textAlign: 'right', fontSize: 12.5 }}>
            <span className="av-dim">{r.played}</span><span>{r.won}</span><span>{r.drawn}</span><span>{r.lost}</span>
            <span style={{ color: r.goalDiff > 0 ? 'var(--av-success)' : r.goalDiff < 0 ? 'var(--av-danger)' : undefined }}>{pm(r.goalDiff)}</span>
            <span style={{ color: 'var(--av-accent)', fontWeight: 700 }}>{r.points}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RatingsBlock({ g }: { g: Group<RatingRow> }) {
  const max = Math.max(...g.rows.map((r) => Math.abs(r.rating)), 1);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(94,235,252,0.14)', paddingBottom: 6, marginBottom: 6 }}>
        <span style={{ color: 'var(--av-accent)', fontWeight: 700, fontSize: 13 }}>{g.division}</span>
        <span className="av-dim" style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Рейтинг</span>
      </div>
      {g.rows.map((r, i) => (
        <div key={r.id} className="av-row" style={{ gridTemplateColumns: '1.3rem 22px 1fr 70px 64px' }}>
          <span className="av-row__rank">{i + 1}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={20} />
          <span className="av-row__name" title={r.name}>{r.name}</span>
          <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(Math.abs(r.rating) / max) * 100}%`, background: r.rating < 0 ? 'var(--av-danger)' : 'var(--av-accent)' }} /></span>
          <span className="av-num" style={{ textAlign: 'right', color: r.rating < 0 ? 'var(--av-danger)' : 'var(--av-accent)', fontWeight: 700, fontSize: 13.5 }}>{num(r.rating)}</span>
        </div>
      ))}
    </div>
  );
}
