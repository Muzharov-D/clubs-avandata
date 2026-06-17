import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import './avandata.css';

interface Agg { ref: { key: string; title: string }; teams: number; players: number; matches: number; analyzed: number; goals: number; goalsPerMatch: number | null }
interface Overview { divisions: string[]; tournaments: number; teams: number; players: number; matches: number; analyzed: number; goals: number; byTournament: Agg[] }
interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }

const num = (n: number) => n.toLocaleString('ru-RU');

/** Обзор Первенства — сигнатурный экран: KPI + таблицы + рейтинг клубов AvanData. */
export function FederationAvHome() {
  const ov = useQuery({ queryKey: ['av', 'overview'], queryFn: () => api<Overview>('/federation/av/overview') });
  const st = useQuery({ queryKey: ['av', 'standings'], queryFn: () => api<{ groups: Group<StandRow>[] }>('/federation/av/standings') });
  const cr = useQuery({ queryKey: ['av', 'club-ratings'], queryFn: () => api<{ groups: Group<RatingRow>[] }>('/federation/av/club-ratings') });

  const d = ov.data;
  return (
    <>
      <header className="av-head av-rise">
        <div>
          <h1 className="av-title">Обзор Первенства</h1>
          <p className="av-sub">Санкт-Петербург · сезон 2026{d ? ` · ${d.divisions.join(' + ')}` : ''}</p>
        </div>
      </header>

      {ov.isLoading && <div className="av-kpis">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="av-skeleton" style={{ height: 96 }} />)}</div>}
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

      <div className="av-cols av-rise">
        <section className="av-surface av-pad">
          <div style={{ marginBottom: 12 }}>
            <h2 className="av-section-title">Статистика · Наградион</h2>
            <p className="av-section-sub">Турнирные таблицы по дивизионам</p>
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

const Sk = () => <div className="av-skeleton" style={{ height: 200 }} />;
const plusMinus = (n: number) => (n > 0 ? `+${n}` : String(n));

function StandingsBlock({ g }: { g: Group<StandRow> }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(94,235,252,0.14)', paddingBottom: 6, marginBottom: 6 }}>
        <span style={{ color: 'var(--av-accent)', fontWeight: 700, fontSize: 13 }}>{g.division}</span>
        <span className="av-dim" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'grid', gridTemplateColumns: 'repeat(6, 1.6rem)', textAlign: 'right' }}>
          <span>И</span><span>В</span><span>Н</span><span>П</span><span>±</span><span>ОЧ</span>
        </span>
      </div>
      {g.rows.map((r, i) => (
        <div key={r.id} className="av-row" style={{ gridTemplateColumns: '1.4rem 22px 1fr auto' }}>
          <span className="av-row__rank">{i + 1}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={20} />
          <span className="av-row__name" title={r.name}>{r.name}</span>
          <span className="av-num" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1.6rem)', textAlign: 'right', fontSize: 12.5 }}>
            <span className="av-dim">{r.played}</span><span>{r.won}</span><span>{r.drawn}</span><span>{r.lost}</span>
            <span style={{ color: r.goalDiff > 0 ? 'var(--av-success)' : r.goalDiff < 0 ? 'var(--av-danger)' : undefined }}>{plusMinus(r.goalDiff)}</span>
            <span style={{ color: 'var(--av-accent)', fontWeight: 700 }}>{r.points}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RatingsBlock({ g }: { g: Group<RatingRow> }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(94,235,252,0.14)', paddingBottom: 6, marginBottom: 6 }}>
        <span style={{ color: 'var(--av-accent)', fontWeight: 700, fontSize: 13 }}>{g.division}</span>
        <span className="av-dim" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Рейтинг</span>
      </div>
      {g.rows.map((r, i) => (
        <div key={r.id} className="av-row" style={{ gridTemplateColumns: '1.4rem 22px 1fr auto' }}>
          <span className="av-row__rank">{i + 1}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={20} />
          <span className="av-row__name" title={r.name}>{r.name}</span>
          <span className="av-num" style={{ color: r.rating < 0 ? 'var(--av-danger)' : 'var(--av-accent)', fontWeight: 700, fontSize: 14 }}>{num(r.rating)}</span>
        </div>
      ))}
    </div>
  );
}
