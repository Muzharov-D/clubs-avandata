/**
 * Public родительский экран — без auth, tenant из URL path.
 * URL: /m/:slug/team/:age (например /m/zenit-fk/team/2011)
 *
 * Что показывает:
 *  - Бренд клуба (логотип, цвет, название)
 *  - Ближайший матч команды (герой-момент: обратный отсчёт + broadcast lower-thirds)
 *  - Турнирную таблицу (зоны по цвету + пульс нашей строки)
 *  - Состав команды (три звезды + сворачиваемый список остальных)
 *  - Кнопки: «Добавить в календарь» и «Push-уведомления» (заглушки на демо)
 *
 * Полностью отдельная страница — НЕ Legacy Легируса. Минимум зависимостей,
 * читает данные через /api/v1/public/:slug/* (no auth).
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AnimatedNumber, Reveal, SplitText, KineticCard, StaggerList } from '../components/motion';
import './PublicTenantTeam.css';

interface Tenant {
  slug: string;
  name: string;
  displayName: string;
  brand: { primary?: string; accent?: string };
}
interface Player {
  id: string;
  fullName: string;
  number: number | null;
  position: string | null;
  photoUrl: string | null;
}
interface StandingRow {
  pos: number;
  team: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  missed: number;
  points: number;
  isOurClub: boolean;
}
interface NextMatch {
  matchId: string;
  date: string;
  home: string;
  away: string;
  venue: string | null;
  round: string | null;
}
interface TeamComposite {
  team: { id: string; name: string; ageGroup: string; ageLabel: string | null; headCoach: string | null } | null;
  players: Player[];
  nextMatch: NextMatch | null;
  standings: { table: StandingRow[]; leagueName: string } | null;
}

/** Приоритет амплуа для выбора «трёх звёзд» состава. */
const POSITION_PRIORITY: Record<string, number> = {
  вратарь: 0,
  гк: 0,
  gk: 0,
  защитник: 1,
  def: 1,
  полузащитник: 2,
  mid: 2,
  нападающий: 3,
  fwd: 3,
};

function positionRank(position: string | null): number {
  if (!position) return 9;
  const key = position.trim().toLowerCase();
  return POSITION_PRIORITY[key] ?? 9;
}

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const STAR_COUNT = 3;

export function PublicTenantTeam() {
  const { slug = '', age = '' } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [data, setData] = useState<TeamComposite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secsLeft, setSecsLeft] = useState<number>(0);
  const [restOpen, setRestOpen] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/v1/public/tenant/${slug}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/v1/public/${slug}/team/${age}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([t, d]) => {
        if (cancelled) return;
        if (!t || !d) {
          setError('Команда не найдена');
          return;
        }
        setTenant(t);
        setData(d);
        const root = document.documentElement;
        if (t.brand?.primary) root.style.setProperty('--pub-brand', t.brand.primary);
        if (t.brand?.accent) root.style.setProperty('--pub-accent', t.brand.accent);
        document.title = `${t.displayName} ${d.team?.ageLabel ?? `U-${age}`} · Расписание`;
      })
      .catch(() => {
        if (!cancelled) setError('Ошибка загрузки');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, age]);

  // Обратный отсчёт до матча — живой таймер с очисткой интервала.
  const matchDate = data?.nextMatch?.date ?? null;
  useEffect(() => {
    if (!matchDate) return;
    const target = new Date(matchDate).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecsLeft(diff);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [matchDate]);

  // Подзаголовок вкладки с оставшимся временем до матча.
  const tenantName = tenant?.displayName ?? '';
  const ageLabel = data?.team?.ageLabel ?? `U-${age}`;
  useEffect(() => {
    if (!matchDate || !tenantName) return;
    const days = Math.floor(secsLeft / SECONDS_PER_DAY);
    const suffix = secsLeft <= 0 ? 'Матч идёт' : `Матч через ${countdownPhrase(secsLeft)}`;
    document.title = `${suffix} · ${tenantName} ${ageLabel}`;
  }, [secsLeft, matchDate, tenantName, ageLabel]);

  // Звёзды состава: сортировка по амплуа (вратарь → защита → центр → атака).
  const { stars, rest } = useMemo(() => {
    const players = data?.players ?? [];
    const ordered = [...players].sort((a, b) => positionRank(a.position) - positionRank(b.position));
    return {
      stars: ordered.slice(0, STAR_COUNT),
      rest: ordered.slice(STAR_COUNT),
    };
  }, [data]);

  if (error) {
    return (
      <div className="pub">
        <div className="pub__empty">{error}</div>
      </div>
    );
  }
  if (!tenant || !data) {
    return (
      <div className="pub">
        <div className="pub__skeleton">Загружаем расписание команды…</div>
      </div>
    );
  }

  const { team, players, nextMatch, standings } = data;
  const ourRow = standings?.table?.find((r) => r.isOurClub);
  const ourTeamName = (ourRow?.team ?? tenant.displayName).toLowerCase();
  const lastZoneStart = standings ? Math.max(standings.table.length - 3, 3) : 0;

  const brandInitials = tenant.displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="pub" data-testid="public-team">
      {/* Bg glow */}
      <div className="pub__glow" aria-hidden />

      {/* Header */}
      <header className="pub__header">
        <div className="pub__brand">
          <div className="pub__brand-mark">{brandInitials}</div>
          <div>
            <div className="pub__brand-name">{tenant.displayName}</div>
            <div className="pub__brand-team">
              {team?.name} · {ageLabel} · Расписание
            </div>
          </div>
        </div>
        <Link to="/" className="pub__powered">
          avandata.ru ↗
        </Link>
      </header>

      {/* Next match hero — герой-момент: обратный отсчёт */}
      {nextMatch && (
        <section className="pub__hero">
          <Reveal variant="fade" duration={0.4}>
            <div className="pub__hero-eyebrow">
              Ближайший матч{nextMatch.round ? ` · ${nextMatch.round}` : ''}
            </div>
          </Reveal>

          <div className="pub__hero-matchup">
            <div className={`pub__hero-team ${isUs(nextMatch.home, ourTeamName) ? 'pub__hero-team--us' : ''}`}>
              <SplitText className="pub__hero-team-name" text={nextMatch.home} delay={0.1} />
            </div>
            <div className="pub__hero-vs">—</div>
            <div className={`pub__hero-team ${isUs(nextMatch.away, ourTeamName) ? 'pub__hero-team--us' : ''}`}>
              <SplitText className="pub__hero-team-name" text={nextMatch.away} delay={0.2} />
            </div>
          </div>

          <Reveal variant="slide-up" delay={0.3}>
            <div className="pub__hero-countdown">
              {secsLeft > 0 ? (
                <>
                  <span className="pub__hero-countdown-label">До матча</span>
                  <span className="pub__hero-countdown-value">
                    <AnimatedNumber
                      value={Math.floor(secsLeft / SECONDS_PER_DAY)}
                      stiffness={80}
                      damping={25}
                      format={(v) => dayWord(Math.round(v))}
                    />
                    <span className="pub__hero-countdown-sep"> · </span>
                    <AnimatedNumber
                      value={Math.floor((secsLeft % SECONDS_PER_DAY) / SECONDS_PER_HOUR)}
                      stiffness={80}
                      damping={25}
                      format={(v) => hourWord(Math.round(v))}
                    />
                  </span>
                </>
              ) : (
                <span className="pub__hero-countdown-value">Матч начался</span>
              )}
            </div>
            <div className="pub__hero-meta">
              <span>{formatDateRu(nextMatch.date)}</span>
              {nextMatch.venue && (
                <>
                  <span className="pub__hero-meta-sep">·</span>
                  <span>{nextMatch.venue}</span>
                </>
              )}
            </div>
          </Reveal>

          <Reveal variant="slide-up" delay={0.4} duration={0.5}>
            <div className="pub__hero-actions">
              <button className="pub__btn pub__btn--primary" type="button">
                Добавить в календарь
              </button>
              <button className="pub__btn pub__btn--ghost" type="button">
                Напомнить о матче
              </button>
            </div>
          </Reveal>
        </section>
      )}

      {/* Standings — зоны по цвету + пульс нашей строки */}
      {standings && (
        <section className="pub__card">
          <div className="pub__card-header">
            <h2 className="pub__card-title">Турнирная таблица</h2>
            <span className="pub__card-sub">{standings.leagueName}</span>
          </div>
          <div className="pub__table-wrap">
            <table className="pub__table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Команда</th>
                  <th>И</th>
                  <th>В</th>
                  <th>Н</th>
                  <th>П</th>
                  <th>М</th>
                  <th>О</th>
                </tr>
              </thead>
              <tbody>
                {standings.table.map((r, idx) => {
                  const zone = r.isOurClub
                    ? 'us'
                    : idx < 3
                      ? 'safe'
                      : idx >= lastZoneStart
                        ? 'danger'
                        : 'neutral';
                  return (
                    <tr key={r.pos} className={`pub__row pub__row--${zone}`}>
                      <td className="pub__pos">{r.pos}</td>
                      <td className="pub__team-cell">{r.team}</td>
                      <td>{r.games}</td>
                      <td>{r.wins}</td>
                      <td>{r.draws}</td>
                      <td>{r.losses}</td>
                      <td>
                        {r.scored}-{r.missed}
                      </td>
                      <td className="pub__points">{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ourRow && (
            <div className="pub__our-summary">
              <strong>{ourRow.team}</strong>
              <span className="pub__our-summary-pos"> · {ourRow.pos} место</span>
              <span>
                {' '}
                · {ourRow.wins}-{ourRow.draws}-{ourRow.losses} · {ourRow.points} очков
              </span>
            </div>
          )}
        </section>
      )}

      {/* Roster — три звезды + сворачиваемый список остальных */}
      <section className="pub__card">
        <div className="pub__card-header">
          <h2 className="pub__card-title">Состав ({players.length})</h2>
          <span className="pub__card-sub">Тренер: {team?.headCoach ?? '—'}</span>
        </div>

        {stars.length > 0 && (
          <div className="pub__stars">
            {stars.map((p, i) => (
              <Reveal key={p.id} variant="slide-right" delay={0.5 + i * 0.08}>
                <KineticCard glow className="pub__star">
                  <div className="pub__star-num">{p.number ?? '—'}</div>
                  <div className="pub__star-info">
                    <div className="pub__star-name">{p.fullName}</div>
                    {p.position && <div className="pub__star-pos">{p.position}</div>}
                  </div>
                </KineticCard>
              </Reveal>
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <>
            <StaggerList as="div" speed="loose" className={`pub__roster ${restOpen ? '' : 'pub__roster--collapsed'}`}>
              {rest.map((p) => (
                <div key={p.id} className="pub__player">
                  <div className="pub__player-num">{p.number ?? '—'}</div>
                  <div className="pub__player-info">
                    <div className="pub__player-name">{p.fullName}</div>
                    {p.position && <div className="pub__player-pos">{p.position}</div>}
                  </div>
                </div>
              ))}
            </StaggerList>
            {!restOpen && rest.length > 6 && (
              <button className="pub__roster-more" type="button" onClick={() => setRestOpen(true)}>
                Ещё {rest.length - 6} {playerWord(rest.length - 6)}
              </button>
            )}
          </>
        )}
      </section>

      <footer className="pub__footer">clubs.avandata.ru · {tenant.displayName}</footer>
    </div>
  );
}

function isUs(teamName: string, ourTeamName: string): boolean {
  if (!ourTeamName) return false;
  const a = teamName.toLowerCase();
  return a.includes(ourTeamName) || ourTeamName.includes(a);
}

/** «День 2 · час 5» — словесная фраза без сырых чисел в обзоре. */
function countdownPhrase(secs: number): string {
  const days = Math.floor(secs / SECONDS_PER_DAY);
  const hours = Math.floor((secs % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  if (days > 0) return `${dayWord(days)}, ${hourWord(hours)}`;
  if (hours > 0) return hourWord(hours);
  const mins = Math.max(1, Math.floor((secs % SECONDS_PER_HOUR) / 60));
  return `${mins} мин`;
}

function dayWord(n: number): string {
  const w = pluralRu(n, 'день', 'дня', 'дней');
  return `${n} ${w}`;
}
function hourWord(n: number): string {
  const w = pluralRu(n, 'час', 'часа', 'часов');
  return `${n} ${w}`;
}
function playerWord(n: number): string {
  return pluralRu(n, 'игрок', 'игрока', 'игроков');
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function formatDateRu(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
