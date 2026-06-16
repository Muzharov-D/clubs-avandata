import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { StatTile } from '../../components/StatTile';
import { Sparkline } from '../../components/Sparkline';
import { api } from '../../api/client';
import { FedRadar, type RadarAxis } from './FedRadar';
import { ratingColor, tint } from './fedColors';
import './federation.css';

interface Profile {
  playerId: string;
  name: string | null;
  club: string;
  ageGroup: string;
  position: string | null;
  positionFull: string | null;
  birthYear: number | null;
  matches: number;
  minutes: number;
  ratings: { overall: number | null; attack: number | null; defence: number | null; passing: number | null; fitness: number | null; creativity: number | null };
  totals: {
    goals: number; shots: number; dribbles: number; progressivePasses: number;
    tackles: number; interceptions: number;
  };
  trend: Array<{ date: string | null; overall: number }>;
  splits: { first: number | null; second: number | null } | null;
}

const METRICS: Array<{ k: keyof Profile['totals']; l: string; accent: 'gold' | 'cyan' | 'violet' | 'green' | 'muted' }> = [
  { k: 'goals', l: 'Голы', accent: 'gold' },
  { k: 'progressivePasses', l: 'Прогрессивные пасы', accent: 'cyan' },
  { k: 'shots', l: 'Удары', accent: 'violet' },
  { k: 'dribbles', l: 'Обводки', accent: 'violet' },
  { k: 'tackles', l: 'Отборы', accent: 'green' },
  { k: 'interceptions', l: 'Перехваты', accent: 'green' },
];

/** Профиль игрока (дриллдаун из талант-пула). Реальная скаут-карточка. */
export function FederationPlayerProfile() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'player', id],
    queryFn: () => api<Profile>(`/federation/players/${encodeURIComponent(id)}`),
  });

  return (
    <div>
      <Link to="/federation/talent" className="fed-link" style={{ display: 'inline-block', marginBottom: 14 }}>← К игрокам</Link>

      {isLoading && <div className="fed-skeleton" style={{ height: 320 }} />}
      {error && <div className="fed-empty"><div className="fed-empty__icon">🔍</div>Игрок не найден или вне федерации.</div>}

      {data && <ProfileBody p={data} />}
    </div>
  );
}

function ProfileBody({ p }: { p: Profile }) {
  const axes = ([
    { label: 'Общий', value: p.ratings.overall },
    { label: 'Атака', value: p.ratings.attack },
    { label: 'Оборона', value: p.ratings.defence },
    { label: 'Пас', value: p.ratings.passing },
    { label: 'Физика', value: p.ratings.fitness },
    { label: 'Креатив', value: p.ratings.creativity },
  ] as RadarAxis[]).filter((a) => a.value != null);
  const trend = p.trend.map((t) => t.overall);
  const per90 = (total: number) => (p.minutes > 0 ? Math.round((total / p.minutes) * 90 * 100) / 100 : null);
  const tiles = METRICS.filter((m) => p.totals[m.k] > 0);

  return (
    <>
      <header className="fed-head fed-rise">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          {p.ratings.overall != null && (
            <span
              className="fed-rate"
              style={{ fontSize: 22, minWidth: 64, padding: '10px 0', color: ratingColor(p.ratings.overall), background: tint(ratingColor(p.ratings.overall)), borderColor: tint(ratingColor(p.ratings.overall), 38) }}
            >
              {p.ratings.overall.toFixed(1)}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="fed-title" style={{ fontSize: 23 }}>
              {p.name ?? <span className="fed-faint" style={{ fontStyle: 'italic' }}>Без согласия</span>}
            </h1>
            <p className="fed-sub">
              {p.club} · {p.positionFull || p.position || '—'} · {p.ageGroup}
              {p.birthYear ? ` (${p.birthYear})` : ''} · {p.matches} матчей · {p.minutes}′
            </p>
          </div>
        </div>
      </header>

      <div className="fed-profile fed-rise" style={{ marginBottom: 16 }}>
        {axes.length >= 3 ? <FedRadar data={axes} /> : <div className="fed-note">Недостаточно измерений рейтинга</div>}
        <div>
          {trend.length >= 2 && (
            <section className="fed-card" style={{ marginBottom: 12 }}>
              <div className="fed-card__pad">
                <div className="fed-card__title">Индекс по матчам</div>
                <Sparkline values={trend} width={320} height={56} color="var(--accent-cyan)" />
                <div className="fed-faint" style={{ fontSize: 11.5, marginTop: 6 }}>
                  от {Math.min(...trend).toFixed(1)} до {Math.max(...trend).toFixed(1)} за {trend.length} матчей
                </div>
              </div>
            </section>
          )}
          {p.splits && (p.splits.first != null || p.splits.second != null) && (
            <section className="fed-card">
              <div className="fed-card__pad">
                <div className="fed-card__title">Индекс по таймам</div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <SplitVal label="1-й тайм" v={p.splits.first} />
                  <SplitVal label="2-й тайм" v={p.splits.second} />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {tiles.length > 0 && (
        <section className="fed-card fed-rise">
          <div className="fed-card__pad">
            <div className="fed-card__title">Вклад за период · всего (и за 90 минут)</div>
            <div className="fed-kpis">
              {tiles.map((m) => {
                const total = p.totals[m.k];
                const p90 = per90(total);
                return <StatTile key={m.k} label={m.l} value={total} extra={p90 != null ? `${p90} за 90` : undefined} accent={m.accent} />;
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function SplitVal({ label, v }: { label: string; v: number | null }) {
  return (
    <div>
      <div className="fed-faint" style={{ fontSize: 11.5, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: v == null ? 'var(--text-faint)' : ratingColor(v) }}>
        {v == null ? '—' : v.toFixed(1)}
      </div>
    </div>
  );
}
