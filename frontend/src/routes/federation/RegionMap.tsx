import { useQuery } from '@tanstack/react-query';
import { StatTile } from '../../components/StatTile';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './federation.css';

interface Registry {
  coaches: number | null;
  referees: number | null;
  participants: number | null;
  source: string;
  period: string;
}
interface RegionMapData {
  players: number;
  clubs: { total: number; paid: number; free: number };
  teams: number;
  competitions: number;
  leagues: number;
  ageGroups: string[];
  matches: number;
  goals: number;
  byAge: Array<{ ageGroup: string; teams: number; players: number }>;
  registry: Registry | null;
}

/**
 * Карта региона (слой №1) — перепись «что у меня есть» одним взглядом.
 * Живые счётчики из данных (футболисты/клубы/команды/соревнования/матчи/голы) +
 * кадры из административного реестра федерации (тренеры/судьи) с пометкой источника.
 */
export function FederationRegionMap() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'region-map'],
    queryFn: () => api<RegionMapData>('/federation/region-map'),
  });

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Карта региона</h1>
          <p className="fed-sub">{federation?.region ?? federation?.name ?? 'Регион'} · детско-юношеский футбол — перепись</p>
        </div>
      </header>

      {isLoading && (
        <div className="fed-kpis">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="fed-skeleton" style={{ height: 104 }} />)}
        </div>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить карту региона</div>}

      {data && <RegionBody d={data} />}
    </div>
  );
}

function RegionBody({ d }: { d: RegionMapData }) {
  return (
    <div className="fed-stack">
      {/* ---- Перепись: живые счётчики ---- */}
      <div className="fed-census fed-rise">
        <div className="fed-census__cell">
          <StatTile label="Футболисты" value={d.players} accent="violet" big />
        </div>
        <div className="fed-census__cell">
          <StatTile
            label="Клубы"
            value={d.clubs.total}
            extra={`${d.clubs.paid} глубина · ${d.clubs.free} база`}
            accent="cyan"
            big
          />
        </div>
        <div className="fed-census__cell"><StatTile label="Команды" value={d.teams} accent="muted" big /></div>
        <div className="fed-census__cell">
          <StatTile label="Лиги" value={d.leagues} extra={`${d.competitions} ${plural(d.competitions, 'возраст', 'возраста', 'возрастов')}`} accent="gold" big />
        </div>
        <div className="fed-census__cell"><StatTile label="Матчи разобраны" value={d.matches} accent="cyan" big /></div>
        <div className="fed-census__cell"><StatTile label="Голы" value={d.goals} accent="green" big /></div>
      </div>

      <div className="fed-cols">
        {/* ---- Кадры региона (реестр) ---- */}
        <RegistryCard r={d.registry} />
        {/* ---- Разрез по возрастам ---- */}
        <ByAgeCard rows={d.byAge} ageGroups={d.ageGroups} />
      </div>
    </div>
  );
}

function RegistryCard({ r }: { r: Registry | null }) {
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          Кадры региона
          {r && <span className="fed-faint" style={{ fontWeight: 400 }}>{r.source} · {r.period}</span>}
        </div>
        {!r ? (
          <div className="fed-note">Реестр кадров не задан для этого региона.</div>
        ) : (
          <>
            <div className="fed-kpis">
              <StatTile label="Тренеры" value={r.coaches ?? 0} accent="cyan" />
              <StatTile label="Судьи" value={r.referees ?? 0} accent="gold" />
              {r.participants != null && <StatTile label="Всего занимающихся" value={r.participants} accent="muted" />}
            </div>
            <p className="fed-faint" style={{ fontSize: 11.5, margin: '12px 2px 0', lineHeight: 1.55 }}>
              Тренеры и судьи — из административного реестра федерации (не из матчевых данных).
              Футбольный контур выше — живые счётчики из базы.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function ByAgeCard({ rows, ageGroups }: { rows: RegionMapData['byAge']; ageGroups: string[] }) {
  const maxPlayers = Math.max(1, ...rows.map((r) => r.players));
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          Состав по возрастам
          <span className="fed-faint" style={{ fontWeight: 400 }}>{ageGroups.length} {plural(ageGroups.length, 'возраст', 'возраста', 'возрастов')}</span>
        </div>
        {rows.length === 0 ? (
          <div className="fed-note">Пока нет команд по возрастам.</div>
        ) : (
          <div>
            {rows.map((a) => (
              <div className="fed-dist__row" key={a.ageGroup} style={{ marginBottom: 10 }}>
                <span className="fed-dist__label" style={{ width: 70 }}>{a.ageGroup}</span>
                <span className="fed-meter">
                  <span className="fed-meter__fill" style={{ width: `${(a.players / maxPlayers) * 100}%`, background: 'var(--brand-gradient)' }} />
                </span>
                <span className="fed-dist__val fed-num" style={{ width: 130 }}>
                  {a.players} {plural(a.players, 'игрок', 'игрока', 'игроков')} · {a.teams} {plural(a.teams, 'команда', 'команды', 'команд')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
