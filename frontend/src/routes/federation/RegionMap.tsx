import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useFedYear, inDivision, type Division } from './avYear';
import { num } from './utils';
import './federation.css';

interface Registry {
  coaches: number | null;
  referees: number | null;
  participants: number | null;
  source: string;
  period: string;
}
interface PyramidLeague {
  league: string;
  teams: number;
  clubs: number;
  players: number;
  q1pct: number;
  q4pct: number;
  skew: number | null;
}
interface PyramidPayload {
  season: string;
  leagues: PyramidLeague[];
  totals: {
    playersDistinct: number;
    teamsTotal: number;
    clubsDistinct: number;
    matches: number;
    q1pct: number;
    q4pct: number;
  };
  capturedAt?: string | null;
}
interface RegionMapData {
  players: number;
  clubs: { total: number; paid: number; free: number };
  teams: number;
  competitions: number;
  leagues: number;
  matches: number;
  goals: number;
  pyramid: PyramidPayload | null;
  registry: Registry | null;
}

export function RegionCensusBody() {
  const { year, division } = useFedYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'region-map'],
    queryFn: () => api<RegionMapData>('/federation/region-map'),
  });

  if (isLoading) {
    return (
      <div className="fed-grid fed-grid--4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="fed-skeleton" style={{ height: 160 }} />
        ))}
      </div>
    );
  }
  if (error) return <div className="fed-empty">Не удалось загрузить данные региона</div>;
  if (!data) return null;

  const d = data;
  const p = d.pyramid;
  const players = p ? p.totals.playersDistinct : d.players;
  const teams = p ? p.totals.teamsTotal : d.teams;
  const matches = p ? p.totals.matches : d.matches;
  const clubsTotal = p ? p.totals.clubsDistinct : d.clubs.total;
  const leaguesCount = p ? p.leagues.length : d.leagues;

  return (
    <div>
      {/* ---- Hero Metrics ---- */}
      <div className="fed-grid fed-grid--4" style={{ marginBottom: 48 }}>
        <div className="fed-metric">
          <div className="fed-metric__label">Футболисты</div>
          <div className="fed-metric__value">{num(players)}</div>
          <div className="fed-metric__extra">{p ? 'в пирамиде FFSPB' : 'в базе'}</div>
        </div>
        <div className="fed-metric">
          <div className="fed-metric__label">Клубы</div>
          <div className="fed-metric__value fed-metric__value--accent">{num(clubsTotal)}</div>
          <div className="fed-metric__extra">{p ? `${p.leagues.length} лиг` : `${d.clubs.paid} глубина · ${d.clubs.free} база`}</div>
        </div>
        <div className="fed-metric">
          <div className="fed-metric__label">Команды</div>
          <div className="fed-metric__value">{num(teams)}</div>
        </div>
        <div className="fed-metric">
          <div className="fed-metric__label">Матчи</div>
          <div className="fed-metric__value">{num(matches)}</div>
        </div>
      </div>

      {/* ---- Pyramid Leagues ---- */}
      {p && p.leagues.length > 0 && (
        <div className="fed-card" style={{ marginBottom: 48 }}>
          <div className="fed-card__title">По лигам</div>
          <div className="fed-card__sub">сезон {p.season} · пирамида FFSPB{p.capturedAt ? ` · данные с ${new Date(p.capturedAt).toLocaleDateString('ru-RU')}` : ''}</div>
          <table className="fed-table">
            <thead>
              <tr>
                <th>Лига</th>
                <th>Команды</th>
                <th>Клубы</th>
                <th>Игроки</th>
                <th>Q4 доля</th>
                <th>Перекос Q1÷Q4</th>
              </tr>
            </thead>
            <tbody>
              {p.leagues.map((l) => {
                const sel = inDivision(l.league, division);
                return (
                  <tr key={l.league} style={sel ? { background: 'var(--accent-soft)' } : undefined}>
                    <td style={sel ? { color: 'var(--accent)', fontWeight: 600 } : undefined}>{l.league}</td>
                    <td className="fed-table__num">{l.teams}</td>
                    <td className="fed-table__num">{l.clubs}</td>
                    <td className="fed-table__num">{l.players}</td>
                    <td className="fed-table__num">{l.q4pct}%</td>
                    <td>
                      <div className="fed-track" style={{ maxWidth: 200 }}>
                        <div
                          className="fed-fill"
                          style={{ width: `${l.skew != null ? Math.min(100, (l.skew / Math.max(1, ...p.leagues.map((x) => x.skew ?? 0))) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="fed-table__muted" style={{ marginLeft: 8 }}>{l.skew != null ? `${l.skew}×` : '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="fed-note" style={{ marginTop: 16 }}>
            Перекос Q1÷Q4 — во сколько раз больше игроков рождено в начале года (январь–март), чем в конце (октябрь–декабрь).
          </p>
        </div>
      )}

      {/* ---- Registry ---- */}
      <div className="fed-card">
        <div className="fed-card__title">Кадры региона</div>
        <div className="fed-card__sub">{d.registry ? `${d.registry.source} · ${d.registry.period}` : 'Реестр не задан'}</div>
        {d.registry ? (
          <div className="fed-grid fed-grid--3">
            <div>
              <div className="fed-metric__label">Тренеры</div>
              <div className="fed-metric__value" style={{ fontSize: 36 }}>{num(d.registry.coaches ?? 0)}</div>
            </div>
            <div>
              <div className="fed-metric__label">Судьи</div>
              <div className="fed-metric__value" style={{ fontSize: 36 }}>{num(d.registry.referees ?? 0)}</div>
            </div>
            {d.registry.participants != null && (
              <div>
                <div className="fed-metric__label">Всего занимающихся</div>
                <div className="fed-metric__value" style={{ fontSize: 36 }}>{num(d.registry.participants)}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="fed-empty">Реестр кадров не задан для этого региона.</div>
        )}
      </div>

      {/* ---- Scope Note ---- */}
      <p className="fed-note" style={{ marginTop: 24 }}>
        Перепись региона — по всем лигам и всем когортам.
        {year != null
          ? ` Срез по году рождения (${year}) применяется на экранах «Таланты» и «Клубы».`
          : ' Срез по году рождения доступен на экранах «Таланты» и «Клубы».'}
      </p>
    </div>
  );
}
