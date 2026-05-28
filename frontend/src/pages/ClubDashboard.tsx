/**
 * Главный дашборд клуба — заменяет legacy ClubPage с Легирус-моками.
 *
 * Секции:
 *  - Hero: ближайший матч (countdown + venue) + последний результат
 *  - Турнирная таблица (топ-8 с подсветкой нашей строки + полный модал)
 *  - Топ-5 игроков по рейтингу из последнего разобранного матча
 *  - Командные итоги последнего матча (possession/xG/shots/passes/distance)
 *  - Состав команды (17 игроков)
 *
 * Данные: /data/teams, /data/matches?teamId, /data/match/:id,
 *         /data/calendar/:age, /data/standings/:age
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchTeams, fetchMatches, fetchMatch, fetchStandings, fetchCalendar,
} from '../services/api';
// @ts-ignore — legacy
import { useAuth } from '../contexts/AuthContext';
import { PlayerRadar } from '../components/PlayerRadar';
import './ClubDashboard.css';

type AnyObj = Record<string, any>;

interface Team {
  id: string;
  name: string;
  ageGroup: string;
  ageLabel?: string | null;
  headCoach?: string | null;
}

export default function ClubDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth() as { user: { tenantId?: string | null } | null };

  const [team, setTeam]               = useState<Team | null>(null);
  const [calendar, setCalendar]       = useState<AnyObj[]>([]);
  const [standings, setStandings]     = useState<AnyObj | null>(null);
  const [latestMatch, setLatestMatch] = useState<AnyObj | null>(null);
  const [matches, setMatches]         = useState<AnyObj[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const teamsRes = await fetchTeams();
        const myTeam = (teamsRes?.teams ?? [])[0];
        if (!myTeam) { setError('У клуба нет команд. Создай команду через /admin.'); setLoading(false); return; }
        if (cancelled) return;
        setTeam(myTeam);

        const [matchesRes, calRes, standRes] = await Promise.all([
          fetchMatches(myTeam.id).catch(() => ({ matches: [] })),
          fetchCalendar(myTeam.ageGroup).catch(() => ({ matches: [] })),
          fetchStandings(myTeam.ageGroup).catch(() => null),
        ]);
        if (cancelled) return;

        const matchesList: AnyObj[] = (matchesRes as AnyObj)?.matches ?? [];
        setMatches(matchesList);
        setCalendar(((calRes as AnyObj)?.matches ?? []) as AnyObj[]);
        setStandings(standRes as AnyObj | null);

        if (matchesList.length > 0) {
          const detail = await fetchMatch(matchesList[0].id).catch(() => null);
          if (!cancelled && detail) setLatestMatch(detail as AnyObj);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const nextMatch = useMemo(() => {
    const now = Date.now();
    return calendar.find((m) =>
      m.isOurMatch && m.scoreH == null && m.date && new Date(m.date).getTime() >= now,
    ) ?? null;
  }, [calendar]);

  const lastResult = useMemo(() => {
    return [...calendar]
      .filter((m) => m.isOurMatch && m.scoreH != null && m.date && new Date(m.date).getTime() < Date.now())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;
  }, [calendar]);

  const topPlayers = useMemo<AnyObj[]>(() => {
    const players: AnyObj[] = (latestMatch?.players ?? []) as AnyObj[];
    return [...players]
      .filter((p) => p.ratings?.overall != null)
      .sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0))
      .slice(0, 5);
  }, [latestMatch]);

  const standingsTopRows = useMemo<AnyObj[]>(() => {
    const t = (standings as AnyObj)?.table ?? [];
    return t.slice(0, 8);
  }, [standings]);

  const ourRow = useMemo<AnyObj | null>(() => {
    const t = (standings as AnyObj)?.table ?? [];
    return t.find((r: AnyObj) => r.isOurClub) ?? null;
  }, [standings]);

  if (loading) return <div className="cd"><div className="cd__loading">Загрузка дашборда…</div></div>;
  if (error)   return <div className="cd"><div className="cd__error">{error}</div></div>;
  if (!team)   return <div className="cd"><div className="cd__error">Команда не найдена</div></div>;

  return (
    <div className="cd">
      <div className="cd__bg-glow" aria-hidden />

      <header className="cd__header">
        <div>
          <div className="cd__eyebrow">{team.ageLabel || `U-${team.ageGroup}`} · Сезон 2025-2026</div>
          <h1 className="cd__title">{team.name}</h1>
          <div className="cd__sub">
            Главный тренер: <b>{team.headCoach || '—'}</b>
            {ourRow && (
              <span className="cd__pos">
                {' · '}
                <span className="cd__pos-num">{ourRow.pos} место</span> в ЮФЛ U-15
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Hero strip — next + last */}
      <section className="cd__hero-row">
        {nextMatch ? (
          <div className="cd__hero-card cd__hero-card--next">
            <div className="cd__hero-eyebrow">Следующий матч · {nextMatch.round || ''}</div>
            <div className="cd__hero-matchup">
              <span className={nextMatch.home === ourLabel(user) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {nextMatch.home}
              </span>
              <span className="cd__hero-vs">vs</span>
              <span className={nextMatch.away === ourLabel(user) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {nextMatch.away}
              </span>
            </div>
            <div className="cd__hero-meta">
              <span>{formatDateLong(nextMatch.date)}</span>
              {nextMatch.venue && <span> · {nextMatch.venue}</span>}
            </div>
            <Countdown to={nextMatch.date} />
          </div>
        ) : (
          <div className="cd__hero-card cd__hero-card--empty">
            <div className="cd__hero-eyebrow">Следующий матч</div>
            <div className="cd__hero-empty-text">Расписание на сезон закрыто</div>
          </div>
        )}

        {lastResult && (
          <div className="cd__hero-card cd__hero-card--last">
            <div className="cd__hero-eyebrow">Последний матч · {lastResult.round || ''}</div>
            <div className="cd__hero-matchup">
              <span className={lastResult.home === ourLabel(user) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {lastResult.home}
              </span>
              <span className="cd__hero-score">
                {lastResult.scoreH}:{lastResult.scoreA}
              </span>
              <span className={lastResult.away === ourLabel(user) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {lastResult.away}
              </span>
            </div>
            <div className="cd__hero-meta">{formatDateShort(lastResult.date)}</div>
            {matches[0] && (
              <button className="cd__hero-action" onClick={() => navigate(`/matches/${matches[0].id}`)}>
                Открыть SportVisor разбор →
              </button>
            )}
          </div>
        )}
      </section>

      {/* Stats from latest analyzed match — структура SportVisor: {home, away} */}
      {latestMatch?.teamSummaryStats && (() => {
        const our = pickOurSide(latestMatch, user);
        const opp = pickOppSide(latestMatch, user);
        if (!our) return null;
        return (
          <section className="cd__panel">
            <div className="cd__panel-header">
              <h2 className="cd__panel-title">Командные показатели</h2>
              <span className="cd__panel-sub">
                {latestMatch.home} {latestMatch.scoreHome}:{latestMatch.scoreAway} {latestMatch.away}
              </span>
            </div>
            <div className="cd__stats-grid">
              <StatTile label="Владение"     value={String(our.possessionPct ?? '—')} suffix="%" extra={opp ? `vs ${opp.possessionPct}%` : undefined} />
              <StatTile label="Удары"        value={String(our.shots?.total ?? '—')} extra={`в створ ${our.shots?.onTarget ?? 0} (${our.shots?.accuracy ?? 0}%)`} />
              <StatTile label="xG"           value={our.expectedGoals != null ? String(our.expectedGoals) : '—'} />
              <StatTile label="Передачи"     value={String(our.passes?.total ?? '—')} extra={`точн ${our.passes?.accuracy ?? 0}% (${our.passes?.successful ?? 0})`} />
              <StatTile label="Угловые"      value={String(our.corners?.total ?? '—')} extra={our.corners?.accuracy != null ? `${our.corners.accuracy}% реализация` : undefined} />
              <StatTile label="Штрафные с ударом" value={String(our.freeKickShots ?? '—')} />
              <StatTile label="Нарушения"    value={String(our.fouls ?? '—')} extra={opp ? `vs ${opp.fouls ?? 0}` : undefined} />
              <StatTile label="Офсайды"      value={String(our.offsides ?? '—')} />
            </div>
            {latestMatch.teamAvgRatings && (
              <div className="cd__avg-row">
                <div className="cd__avg-item"><span className="cd__avg-label">Общий</span><span className="cd__avg-val">{Number(latestMatch.teamAvgRatings.overall ?? 0).toFixed(2)}</span></div>
                <div className="cd__avg-item"><span className="cd__avg-label">Фитнес</span><span className="cd__avg-val">{Number(latestMatch.teamAvgRatings.fitness ?? 0).toFixed(2)}</span></div>
                <div className="cd__avg-item"><span className="cd__avg-label">Атака</span><span className="cd__avg-val">{Number(latestMatch.teamAvgRatings.attack ?? 0).toFixed(2)}</span></div>
                <div className="cd__avg-item"><span className="cd__avg-label">Защита</span><span className="cd__avg-val">{Number(latestMatch.teamAvgRatings.defence ?? 0).toFixed(2)}</span></div>
              </div>
            )}
          </section>
        );
      })()}

      {/* teamAggregates — глубокая аналитика по 10 категориям */}
      {latestMatch?.teamAggregates && Object.keys(latestMatch.teamAggregates).length > 0 && (
        <section className="cd__panel">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Детальная аналитика</h2>
            <span className="cd__panel-sub">teamAggregates · {Object.keys(latestMatch.teamAggregates).length} категорий</span>
          </div>
          <div className="cd__agg-grid">
            {Object.entries(latestMatch.teamAggregates as Record<string, AnyObj>).map(([key, vals]) => (
              <AggregateCard key={key} title={aggTitle(key)} data={vals} />
            ))}
          </div>
        </section>
      )}

      {/* Top 5 + standings */}
      <section className="cd__columns">
        <div className="cd__panel">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Топ-5 по рейтингу</h2>
            <span className="cd__panel-sub">из последнего разбора</span>
          </div>
          {topPlayers.length === 0 ? (
            <div className="cd__empty">
              <div className="cd__empty-icon">📊</div>
              <div>Загрузи PDF + Excel SportVisor, чтобы увидеть рейтинги игроков</div>
            </div>
          ) : (
            <ol className="cd__top">
              {topPlayers.map((p, i) => (
                <li key={p.playerId} className="cd__top-row" onClick={() => navigate(`/players/${p.playerId}`)}>
                  <span className="cd__top-rank">{i + 1}</span>
                  <span className="cd__top-num">#{p.number ?? '—'}</span>
                  <span className="cd__top-name">{p.fullName}</span>
                  <span className="cd__top-pos">{p.position || ''}</span>
                  <span className="cd__top-rating" style={{ background: ratingColor(p.ratings?.overall) }}>
                    {p.ratings?.overall?.toFixed(1) ?? '—'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="cd__panel">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Турнирная таблица</h2>
            <span className="cd__panel-sub">{standings ? 'ЮФЛ U-15 · группа' : ''}</span>
          </div>
          {standingsTopRows.length === 0 ? (
            <div className="cd__empty">
              <div className="cd__empty-icon">🏆</div>
              <div>Таблица турнира пока недоступна</div>
            </div>
          ) : (
            <table className="cd__table">
              <thead>
                <tr><th>#</th><th>Команда</th><th>И</th><th>М</th><th>О</th></tr>
              </thead>
              <tbody>
                {standingsTopRows.map((r) => (
                  <tr key={r.pos} className={r.isOurClub ? 'cd__table-row--us' : ''}>
                    <td>{r.pos}</td>
                    <td className="cd__table-team">{r.team}</td>
                    <td>{r.games}</td>
                    <td>{r.scored}-{r.missed}</td>
                    <td className="cd__table-pts">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Top-3 profile radars */}
      {topPlayers.length > 0 && (
        <section className="cd__panel">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Профили топ-3</h2>
            <span className="cd__panel-sub">проценты от лучшего в команде</span>
          </div>
          <div className="cd__radars-grid">
            {topPlayers.slice(0, 3).map((p) => (
              <div key={p.playerId} className="cd__radar-card" onClick={() => navigate(`/players/${p.playerId}`)}>
                <div className="cd__radar-head">
                  <span className="cd__radar-num">#{p.number}</span>
                  <span className="cd__radar-name">{p.fullName}</span>
                  <span className="cd__radar-rating" style={{ background: ratingColor(p.ratings?.overall) }}>
                    {Number(p.ratings?.overall ?? 0).toFixed(1)}
                  </span>
                </div>
                <PlayerRadar player={p} teamPlayers={(latestMatch?.players ?? []) as any[]} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roster */}
      <section className="cd__panel">
        <div className="cd__panel-header">
          <h2 className="cd__panel-title">Состав ({latestMatch?.players?.length ?? '—'})</h2>
          <span className="cd__panel-sub">из загруженного разбора</span>
        </div>
        <div className="cd__roster">
          {(((latestMatch?.players ?? []) as AnyObj[])).map((p) => (
            <div key={p.playerId} className="cd__player" onClick={() => navigate(`/players/${p.playerId}`)}>
              <div className="cd__player-num">{p.number ?? '—'}</div>
              <div className="cd__player-info">
                <div className="cd__player-name">{p.fullName}</div>
                <div className="cd__player-meta">{p.position || ''} · {p.minutes ?? 0}'</div>
              </div>
              {p.ratings?.overall != null && (
                <div className="cd__player-rating" style={{ background: ratingColor(p.ratings.overall) }}>
                  {p.ratings.overall.toFixed(1)}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function ourLabel(user: { tenantId?: string | null } | null): string {
  return user?.tenantId === 'zenit-fk' ? 'Зенит' : 'СШОР Зенит';
}

function pickOurSide(m: AnyObj, user: { tenantId?: string | null } | null): AnyObj | null {
  const ss = m.teamSummaryStats as { home?: AnyObj; away?: AnyObj } | null;
  if (!ss) return null;
  const ourName = ourLabel(user).toLowerCase();
  const homeName = String(m.home || '').toLowerCase();
  const homeMatches = homeName.includes(ourName) && (ourName === 'зенит' ? !homeName.includes('сшор') : true);
  return homeMatches ? (ss.home ?? null) : (ss.away ?? null);
}
function pickOppSide(m: AnyObj, user: { tenantId?: string | null } | null): AnyObj | null {
  const ss = m.teamSummaryStats as { home?: AnyObj; away?: AnyObj } | null;
  if (!ss) return null;
  const ourName = ourLabel(user).toLowerCase();
  const homeName = String(m.home || '').toLowerCase();
  const homeMatches = homeName.includes(ourName) && (ourName === 'зенит' ? !homeName.includes('сшор') : true);
  return homeMatches ? (ss.away ?? null) : (ss.home ?? null);
}

const AGG_TITLES: Record<string, string> = {
  shooting: 'Удары и реализация',
  passes:   'Передачи',
  possession: 'Владение мячом',
  attacks:  'Атаки',
  pressing: 'Прессинг',
  recoveriesAndTackling: 'Отборы и перехваты',
  duels:    'Единоборства',
  positioning: 'Позиционная игра',
  setPieces: 'Стандарты',
};
function aggTitle(k: string): string { return AGG_TITLES[k] || k; }

function AggregateCard({ title, data }: { title: string; data: AnyObj }) {
  // Берём первые 6 числовых полей
  const entries = Object.entries(data || {})
    .filter(([, v]) => typeof v === 'number' || (v && typeof v === 'object' && (typeof (v as AnyObj).value === 'number' || typeof (v as AnyObj).pct === 'number')))
    .slice(0, 6);
  if (entries.length === 0) return null;
  return (
    <div className="cd__agg-card">
      <div className="cd__agg-title">{title}</div>
      {entries.map(([k, v]) => {
        const isObj = v && typeof v === 'object';
        const val = isObj ? ((v as AnyObj).value ?? (v as AnyObj).pct) : v;
        const suffix = isObj && (v as AnyObj).pct != null ? '%' : '';
        return (
          <div key={k} className="cd__agg-row">
            <span className="cd__agg-key">{humanize(k)}</span>
            <span className="cd__agg-val">{typeof val === 'number' ? val.toLocaleString('ru-RU') : '—'}{suffix}</span>
          </div>
        );
      })}
    </div>
  );
}
function humanize(k: string): string {
  return k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function num(v: any, digits = 0): string {
  if (v == null) return '—';
  const n = typeof v === 'object' ? (v.value ?? v.pct ?? null) : v;
  if (n == null || isNaN(n)) return '—';
  return digits === 0 ? Math.round(Number(n)).toLocaleString('ru-RU') : Number(n).toFixed(digits);
}
function pct(v: any): string {
  if (v == null) return '—';
  const n = typeof v === 'object' ? (v.pct ?? v.value ?? null) : v;
  if (n == null || isNaN(n)) return '—';
  return Math.round(Number(n)).toString();
}
function kmFromMeters(v: any): string {
  if (v == null) return '—';
  const n = typeof v === 'object' ? (v.value ?? null) : v;
  if (n == null) return '—';
  return (Number(n) / 1000).toFixed(1);
}
function ratingColor(r: number | null | undefined): string {
  if (r == null) return '#475569';
  if (r >= 8.5) return 'linear-gradient(135deg, #16a34a, #22c55e)';
  if (r >= 7.5) return 'linear-gradient(135deg, #22c55e, #84cc16)';
  if (r >= 6.5) return 'linear-gradient(135deg, #84cc16, #facc15)';
  if (r >= 5.5) return 'linear-gradient(135deg, #facc15, #f97316)';
  return 'linear-gradient(135deg, #ef4444, #f97316)';
}
function formatDateLong(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' });
}
function formatDateShort(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function StatTile({ label, value, suffix = '', extra }: { label: string; value: string; suffix?: string; extra?: string }) {
  return (
    <div className="cd__stat-tile">
      <div className="cd__stat-label">{label}</div>
      <div className="cd__stat-value">{value}{suffix && <span className="cd__stat-suffix">{suffix}</span>}</div>
      {extra && <div className="cd__stat-extra">{extra}</div>}
    </div>
  );
}

function Countdown({ to }: { to: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    function tick() {
      const diff = new Date(to).getTime() - Date.now();
      if (diff <= 0) { setText('началось'); return; }
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000) / 60000);
      if (days > 0)      setText(`через ${days} дн. ${hours} ч.`);
      else if (hours > 0) setText(`через ${hours} ч. ${mins} мин.`);
      else                setText(`через ${mins} мин.`);
    }
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [to]);
  return <div className="cd__countdown">{text}</div>;
}
