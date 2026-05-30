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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore — legacy .js hook
import { useReveal } from '../hooks/useReveal';
import {
  fetchTeams, fetchMatches, fetchMatch, fetchStandings, fetchCalendar,
} from '../services/api';
// @ts-ignore — legacy
import { useAuth } from '../contexts/AuthContext';
// @ts-ignore — legacy
import { useTeam } from '../contexts/TeamContext';
import { PlayerRadar } from '../components/PlayerRadar';
import { StatTile } from '../components/StatTile';
// @ts-ignore — legacy .jsx
import PredictedLineup from '../components/PredictedLineup';
// @ts-ignore — legacy .jsx
import PlayerPhoto from '../components/PlayerPhoto';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './ClubDashboard.css';
import './clubKinetic.css';

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
  const { user, isCoach } = useAuth() as { user: { tenantId?: string | null; fullName?: string } | null; isCoach: boolean };
  const { selectedTeam, selectedTeamId } = useTeam() as { selectedTeam: Team | null; selectedTeamId: string | null };
  useDocumentTitle(selectedTeam?.name ? `${selectedTeam.name} — Клуб` : 'Клуб');

  // Kinetic-полировка: reveal секций при скролле + parallax-tilt hero-карточек.
  const cdRef = useRef<HTMLDivElement>(null);
  useReveal(cdRef, [selectedTeamId]);
  useEffect(() => {
    const root = cdRef.current;
    if (!root) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia?.('(hover: none)').matches) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.cd__hero-card'));
    const cleanups = cards.map((el) => {
      let raf = 0;
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform = `perspective(1000px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg) translateY(-4px)`;
        });
      };
      const onLeave = () => { cancelAnimationFrame(raf); el.style.transform = ''; };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); cancelAnimationFrame(raf); };
    });
    return () => cleanups.forEach((fn) => fn());
  }, [selectedTeamId, selectedTeam]);

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
        // Команду берём из TeamContext (он уже их подтянул и выбрал) —
        // если контекст не успел, делаем fallback fetchTeams().
        let myTeam: Team | null = selectedTeam;
        if (!myTeam) {
          const teamsRes = await fetchTeams();
          const list = (teamsRes?.teams ?? []) as Team[];
          myTeam = list.find((t) => t.id === selectedTeamId) || list[0] || null;
        }
        if (!myTeam) {
          setError('У клуба пока нет команд. Создайте команду в админ-панели.');
          setLoading(false);
          return;
        }
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
  }, [user, selectedTeamId]);

  // Имя нашей команды для сравнений «наш матч» / «наша строка таблицы».
  // Берём из выбранной команды (а не хардкод «Зенит»), fallback на team из БД.
  const ourName = (selectedTeam?.name || team?.name || '').toLowerCase().trim();

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

  // Разбор (загруженный отчёт) ИМЕННО для последнего матча — ищем отчёт с той же
  // датой. Кнопка «Открыть разбор» нужна только если разбор для этого матча есть;
  // иначе (есть отчёт для другого матча или вообще нет) — кнопку не показываем.
  const dayKey = (d: unknown): string => {
    try { return new Date(d as string).toISOString().slice(0, 10); } catch { return ''; }
  };
  const lastReport = useMemo(() => {
    if (!lastResult?.date) return null;
    const day = dayKey(lastResult.date);
    return matches.find((m) => m.date && dayKey(m.date) === day) ?? null;
  }, [matches, lastResult]);

  const topPlayers = useMemo<AnyObj[]>(() => {
    const players: AnyObj[] = (latestMatch?.players ?? []) as AnyObj[];
    // Фильтр > 0: бенч/не-вышедшие имеют overall=0 (placeholder) — в топ-5 их не должно быть.
    return [...players]
      .filter((p) => p.ratings?.overall != null && Number(p.ratings.overall) > 0)
      .sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0))
      .slice(0, 5);
  }, [latestMatch]);

  const standingsTopRows = useMemo<AnyObj[]>(() => {
    const t = ((standings as AnyObj)?.table ?? []) as AnyObj[];
    const top = t.slice(0, 8);
    const our = t.find((r) => r.isOurClub);
    // Если наша команда вне топ-8 — добавляем её внизу с разделителем-флагом
    if (our && !top.includes(our)) {
      return [...top, { __divider: true }, our];
    }
    return top;
  }, [standings]);

  const ourRow = useMemo<AnyObj | null>(() => {
    const t = (standings as AnyObj)?.table ?? [];
    return t.find((r: AnyObj) => r.isOurClub) ?? null;
  }, [standings]);

  // Tournament title: только лига без дубля age. ClubDashboard hero уже
  // выводит ageLabel/U-15 в eyebrow, плюс standings panel-sub имеет свой
  // tournamentTitle — там показываем «ЮФЛ U-15 · сезон» без 2011 г.р.
  const tournamentTitle = (standings as AnyObj)?.leagueName ?? 'Турнир';

  if (loading) return <div className="cd"><div className="cd__loading">Загрузка дашборда…</div></div>;
  if (error)   return <div className="cd"><div className="cd__error">{error}</div></div>;
  if (!team)   return <div className="cd"><div className="cd__error">Команда не найдена</div></div>;

  return (
    <div className="cd kinetic" ref={cdRef}>
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
                <span className="cd__pos-num">{ourRow.pos} место</span> в {tournamentTitle}
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
              <span className={isOurName(nextMatch.home, ourName) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {nextMatch.home}
              </span>
              <span className="cd__hero-vs">vs</span>
              <span className={isOurName(nextMatch.away, ourName) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {nextMatch.away}
              </span>
            </div>
            <div className="cd__hero-meta">
              <span>{formatDateLong(nextMatch.date)}</span>
              {nextMatch.venue && <span className="cd__hero-venue"> · {nextMatch.venue}</span>}
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
              <span className={isOurName(lastResult.home, ourName) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {lastResult.home}
              </span>
              <span className="cd__hero-score">
                {lastResult.scoreH}:{lastResult.scoreA}
              </span>
              <span className={isOurName(lastResult.away, ourName) ? 'cd__hero-team--us' : 'cd__hero-team'}>
                {lastResult.away}
              </span>
            </div>
            <div className="cd__hero-meta">{formatDateShort(lastResult.date)}</div>
            {lastReport && (
              <button className="cd__hero-action" onClick={() => navigate(`/matches/${lastReport.id}`)}>
                Открыть подробный разбор →
              </button>
            )}
          </div>
        )}
      </section>

      {/* Вероятный состав на следующий матч (Phase 5) — тренеру */}
      {isCoach && selectedTeamId && <PredictedLineup teamId={selectedTeamId} />}

      {/* Stats from latest analyzed match — структура SportVisor: {home, away} */}
      {latestMatch?.teamSummaryStats && (() => {
        const our = pickOurSide(latestMatch, ourName);
        const opp = pickOppSide(latestMatch, ourName);
        if (!our) return null;
        // Семантический цвет KPI: зелёный — лучше соперника, красный — хуже.
        // higherBetter=false для «плохих» метрик (нарушения). Нет соперника → нейтраль.
        const cmp = (a: unknown, b: unknown, higherBetter = true): 'green' | 'red' | 'muted' => {
          const x = Number(a); const y = Number(b);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x === y) return 'muted';
          const better = higherBetter ? x > y : x < y;
          return better ? 'green' : 'red';
        };
        return (
          <section className="cd__panel reveal">
            <div className="cd__panel-header">
              <h2 className="cd__panel-title">Командные показатели</h2>
              <span className="cd__panel-sub">
                {trimAgeSuffix(latestMatch.home)} {latestMatch.scoreHome}:{latestMatch.scoreAway} {trimAgeSuffix(latestMatch.away)}
              </span>
            </div>
            <div className="cd__stats-grid">
              <StatTile accent={cmp(our.possessionPct, opp?.possessionPct)} label="Владение"
                value={our.possessionPct != null ? our.possessionPct : '—'}
                unit={our.possessionPct != null ? '%' : undefined}
                extra={opp?.possessionPct != null ? `соперник ${opp.possessionPct}%` : undefined}
                delta={opp?.possessionPct != null && our.possessionPct != null && our.possessionPct !== opp.possessionPct
                  ? { sign: our.possessionPct > opp.possessionPct ? 'up' : 'down', text: `${Math.abs(our.possessionPct - opp.possessionPct)}%` }
                  : undefined} />
              <StatTile accent={cmp(our.shots?.total, opp?.shots?.total)} label="Удары"
                value={our.shots?.total != null ? our.shots.total : '—'}
                extra={our.shots?.total != null
                  ? `в створ ${our.shots?.onTarget ?? '—'} · ${our.shots?.accuracy ?? '—'}%`
                  : undefined}
                delta={opp?.shots?.total != null && our.shots?.total != null && our.shots.total !== opp.shots.total
                  ? { sign: our.shots.total > opp.shots.total ? 'up' : 'down', text: `${Math.abs(our.shots.total - opp.shots.total)}` }
                  : undefined} />
              <StatTile accent={cmp(our.expectedGoals, opp?.expectedGoals)} label="xG"
                value={our.expectedGoals != null ? Number(our.expectedGoals).toFixed(2) : '—'}
                extra={opp?.expectedGoals != null ? `соперник ${Number(opp.expectedGoals).toFixed(2)}` : undefined} />
              {/* Передачи/Угловые — объём (стиль игры), не «хуже/лучше»: нейтрально. */}
              <StatTile accent="muted"  label="Передачи"
                value={our.passes?.total != null ? our.passes.total : '—'}
                extra={our.passes?.total != null
                  ? `точность ${our.passes?.accuracy ?? '—'}% (${our.passes?.successful ?? '—'})`
                  : undefined} />
              <StatTile accent="muted"  label="Угловые"
                value={our.corners?.total != null ? our.corners.total : '—'}
                extra={our.corners?.accuracy != null ? `${our.corners.accuracy}% реализация` : undefined} />
              <StatTile accent={cmp(our.fouls, opp?.fouls, false)} label="Нарушения"
                value={our.fouls != null ? our.fouls : '—'}
                extra={opp?.fouls != null ? `соперник ${opp.fouls}` : undefined} />
              <StatTile accent={cmp(our.offsides, opp?.offsides, false)} label="Офсайды"
                value={our.offsides != null ? our.offsides : '—'}
                extra={opp?.offsides != null ? `соперник ${opp.offsides}` : undefined} />
            </div>
            {latestMatch.teamAvgRatings && (() => {
              const tar = latestMatch.teamAvgRatings as Record<string, unknown>;
              const fmt = (k: string) => {
                const v = tar[k];
                return v != null && Number(v) > 0 ? Number(v).toFixed(2) : '—';
              };
              const anyValue = ['overall','fitness','attack','defence'].some((k) => {
                const v = tar[k]; return v != null && Number(v) > 0;
              });
              if (!anyValue) return null;
              return (
                <>
                  <div className="cd__avg-caption">Средние Performance Index по команде</div>
                  <div className="cd__avg-row">
                    <div className="cd__avg-item"><span className="cd__avg-label">Общий</span><span className="cd__avg-val">{fmt('overall')}</span></div>
                    <div className="cd__avg-item"><span className="cd__avg-label">Фитнес</span><span className="cd__avg-val">{fmt('fitness')}</span></div>
                    <div className="cd__avg-item"><span className="cd__avg-label">Атака</span><span className="cd__avg-val">{fmt('attack')}</span></div>
                    <div className="cd__avg-item"><span className="cd__avg-label">Защита</span><span className="cd__avg-val">{fmt('defence')}</span></div>
                  </div>
                </>
              );
            })()}
          </section>
        );
      })()}

      {/* teamAggregates — глубокая аналитика по 10 категориям. Считаем только
          секции с хотя бы одной числовой записью (после фильтра нулей внутри
          AggregateCard) — чтобы не показывать «9 категорий» из которых 6 пустые. */}
      {latestMatch?.teamAggregates && (() => {
        const ta = latestMatch.teamAggregates as Record<string, AnyObj>;
        const meaningful = Object.entries(ta).filter(([, v]) => {
          if (!v || typeof v !== 'object') return false;
          return Object.entries(v).some(([k, x]) => {
            if (k === 'mapImage') return false;
            if (typeof x === 'number') return x > 0;
            if (x && typeof x === 'object') {
              const val = (x as AnyObj).value ?? (x as AnyObj).pct;
              return typeof val === 'number' && val > 0;
            }
            return false;
          });
        });
        if (meaningful.length === 0) return null;
        return (
          <section className="cd__panel reveal">
            <div className="cd__panel-header">
              <h2 className="cd__panel-title">Детальная аналитика по секциям</h2>
              <span className="cd__panel-sub">{meaningful.length} категорий с данными</span>
            </div>
          <div className="cd__agg-grid">
            {meaningful.map(([key, vals]) => (
              <AggregateCard key={key} title={aggTitle(key)} data={vals as AnyObj} />
            ))}
          </div>
        </section>
        );
      })()}

      {/* Top 5 + standings */}
      <section className="cd__columns">
        <div className="cd__panel reveal">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Топ-5 по рейтингу</h2>
            <span className="cd__panel-sub">
              {latestMatch
                ? `по матчу ${formatDateShort(latestMatch.date)} · ${trimAgeSuffix(latestMatch.home)} ${latestMatch.scoreHome}:${latestMatch.scoreAway} ${trimAgeSuffix(latestMatch.away)}`
                : 'нет загруженных разборов'}
            </span>
          </div>
          {topPlayers.length === 0 ? (
            <div className="cd__empty">
              <EmptyIcon kind="chart" />
              <div>Загрузи PDF + Excel SportVisor, чтобы увидеть рейтинги игроков</div>
            </div>
          ) : (
            <ol className="cd__top">
              {(() => {
                const maxRating = topPlayers.reduce((m, x) => Math.max(m, x.ratings?.overall ?? 0), 0) || 10;
                return topPlayers.map((p, i) => {
                  const r = p.ratings?.overall ?? 0;
                  const pct = Math.min(100, (r / maxRating) * 100);
                  return (
                    <li key={p.playerId} className="cd__top-row" onClick={() => navigate(`/players/${p.playerId}`)}>
                      <span className="cd__top-rank">{i + 1}</span>
                      <span className="cd__top-num">#{p.number ?? '—'}</span>
                      <span className="cd__top-name">{p.fullName}</span>
                      <span className="cd__top-pos">{p.position || ''}</span>
                      <span className="cd__top-bar" aria-hidden>
                        <span className="cd__top-bar-fill" style={{ width: `${pct}%`, background: ratingColor(r) }} />
                      </span>
                      <span className="cd__top-rating" style={{ background: ratingColor(r) }}>
                        {p.ratings?.overall?.toFixed(1) ?? '—'}
                      </span>
                    </li>
                  );
                });
              })()}
            </ol>
          )}
        </div>

        <div className="cd__panel reveal">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Турнирная таблица</h2>
            <span className="cd__panel-sub">{standings ? tournamentTitle : ''}</span>
          </div>
          {standingsTopRows.length === 0 ? (
            <div className="cd__empty">
              <EmptyIcon kind="trophy" />
              <div>Таблица турнира пока недоступна</div>
            </div>
          ) : (
            <div className="cd__table-wrap">
              <table className="cd__table">
                <thead>
                  <tr><th>#</th><th>Команда</th><th title="Игр">И</th><th title="Мячи (забили-пропустили)">М</th><th title="Очки">О</th></tr>
                </thead>
                <tbody>
                  {standingsTopRows.map((r, i) => r.__divider ? (
                    <tr key={`div-${i}`} className="cd__table-divider">
                      <td colSpan={5}>···</td>
                    </tr>
                  ) : (
                    <tr key={`${r.pos}-${r.team}`} className={r.isOurClub ? 'cd__table-row--us' : ''}>
                      <td>{r.pos}</td>
                      <td className="cd__table-team">{r.team}</td>
                      <td>{r.games}</td>
                      <td>{r.scored}-{r.missed}</td>
                      <td className="cd__table-pts">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Top-3 profile radars */}
      {topPlayers.length >= 3 && (
        <section className="cd__panel reveal">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Профили топ-3</h2>
            <span className="cd__panel-sub">Performance Index — % от лучшего в команде</span>
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
      <section className="cd__panel reveal">
        <div className="cd__panel-header">
          <h2 className="cd__panel-title">
            Состав{latestMatch?.players?.length ? ` (${latestMatch.players.length})` : ''}
          </h2>
          <span className="cd__panel-sub">
            {latestMatch?.players?.length
              ? `из матча ${formatDateShort(latestMatch.date)}`
              : 'нет загруженных разборов'}
          </span>
        </div>
        <div className="cd__roster">
          {(((latestMatch?.players ?? []) as AnyObj[]))
            // Сортировка: по минутам убыванию, потом по номеру — стартовый
            // состав сверху, бенч ниже
            .slice()
            .sort((a, b) => {
              const ma = Number(a.minutes ?? 0); const mb = Number(b.minutes ?? 0);
              if (ma !== mb) return mb - ma;
              return Number(a.number ?? 99) - Number(b.number ?? 99);
            })
            .map((p) => {
              const r = Number(p.ratings?.overall ?? 0);
              const mins = Number(p.minutes ?? 0);
              return (
                <div key={p.playerId} className="cd__player" onClick={() => navigate(`/players/${p.playerId}`)}>
                  <div className="cd__player-photo">
                    <PlayerPhoto player={p} size={40} />
                  </div>
                  <div className="cd__player-num">{p.number ?? '—'}</div>
                  <div className="cd__player-info">
                    <div className="cd__player-name">{p.fullName}</div>
                    <div className="cd__player-meta">
                      {p.position || ''}{mins > 0 ? ` · ${mins}'` : ' · не выходил'}
                    </div>
                  </div>
                  {r > 0 && (
                    <div className="cd__player-rating" style={{ background: ratingColor(r) }}>
                      {r.toFixed(1)}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Сравнение названий команд: «наше» имя из selectedTeam vs строка из API.
 * Нормализация: lowercase + trim + убираем U-15/U15/2011 г.р./() — у API
 * могут быть «Зенит U-15», «Зенит 2011», «ФК Зенит U-15» — все ОДНА команда.
 * Edge-case: «Зенит» vs «СШОР Зенит» — для name='зенит' добавляем явное
 * исключение, чтобы не словить ложноположительный матч.
 */
function normalizeTeamName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\bu-?\s*\d{1,3}\b/gi, '')        // U-15, U15
    .replace(/\b20\d{2}\b/g, '')               // 2011, 2010
    .replace(/[«»()\[\]]/g, '')                // кавычки/скобки
    .replace(/\s+/g, ' ')
    .trim();
}

/** То же что normalizeTeamName, но сохраняет Capitalize — для display. */
function trimAgeSuffix(s: unknown): string {
  return String(s || '')
    .replace(/\s*[Uu]-?\s*\d{1,3}\s*/g, ' ')   // " U15 " → " "
    .replace(/\s+20\d{2}\s*/g, ' ')             // " 2011 "
    .replace(/[«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isOurName(matchTeam: unknown, ourLower: string): boolean {
  if (!ourLower) return false;
  const me  = normalizeTeamName(ourLower);
  const her = normalizeTeamName(matchTeam as string);
  if (!me || !her) return false;
  // Edge: если МЫ — просто «зенит»/«фк зенит» — не должны матчиться с «сшор зенит»
  if ((me === 'зенит' || me === 'фк зенит') && her.includes('сшор')) return false;
  // Edge: если МЫ «сшор зенит» — не должны матчиться с просто «зенит» без «сшор»
  if (me.includes('сшор') && !her.includes('сшор')) return false;
  if (me === her) return true;
  return her.includes(me) || me.includes(her);
}

function pickOurSide(m: AnyObj, ourLower: string): AnyObj | null {
  const ss = m.teamSummaryStats as { home?: AnyObj; away?: AnyObj } | null;
  if (!ss) return null;
  return isOurName(m.home, ourLower) ? (ss.home ?? null) : (ss.away ?? null);
}
function pickOppSide(m: AnyObj, ourLower: string): AnyObj | null {
  const ss = m.teamSummaryStats as { home?: AnyObj; away?: AnyObj } | null;
  if (!ss) return null;
  return isOurName(m.home, ourLower) ? (ss.away ?? null) : (ss.home ?? null);
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

// Русские названия полей агрегатов (что приходит из derivedAggregates + build_match)
const FIELD_RU: Record<string, string> = {
  // shooting
  shots: 'Удары', onTarget: 'В створ', goals: 'Голы', byHead: 'Головой',
  totalShots: 'Удары', shotsOnTarget: 'В створ', expectedGoals: 'xG',
  avgShotDistance: 'Сред. дистанция удара',
  // passes
  total: 'Всего', successful: 'Точные', progressive: 'Прогрессивные',
  toFinalThird: 'В финальную треть', intoPenArea: 'В штрафную',
  crosses: 'Кроссы', keyPass: 'Ключевые', back: 'Назад', long: 'Длинные',
  short: 'Короткие', middle: 'Средние', oppda: 'PPDA',
  // attacks
  assists: 'Ассисты', goalActions: 'Голевые действия', dribble: 'Дриблинг',
  touchesInBox: 'Касания в штрафной', entriesInBox: 'Входы в штрафную',
  crossingMidfield: 'Переходы средней линии', defenceBreakthroughs: 'Прорывы обороны',
  // possession
  lostBall: 'Потери', technicalMistake: 'Брак', loseOnOwnHalf: 'Потери на своей',
  losses: 'Потери всего', possessionsCount: 'Владения',
  // recoveriesAndTackling
  tackle: 'Отборы', interception: 'Перехваты', recovery: 'Возвраты',
  tackleAndRecovery: 'Отбор+возврат', slidingTackles: 'Подкаты',
  returns: 'Возвраты', tacklesLine: 'Отборы на линии',
  inFirstThird: 'В 1-й трети', inSecondThird: 'В средней', inThirdThird: 'В фин. трети',
  // duels
  duel: 'Дуэли', aerialDuel: 'Воздух', totalDuels: 'Всего дуэлей',
  aerialDuels: 'Воздушные дуэли',
  // pressing
  pressing: 'Прессинг', counterpressing: 'Контр-прессинг',
  averagePpda: 'Сред. PPDA',
  // positioning
  clearance: 'Выносы', blockedShot: 'Блок-удары', positionPlay: 'Поз. игра',
  fouls: 'Фолы', yellowCard: 'Жёлтые', redCard: 'Красные', shotsAgainst: 'Удары по воротам',
  interceptions: 'Перехваты',
  // setPieces
  corner: 'Угловые', corners: 'Угловые', freeKick: 'Штрафные',
  freeKickShot: 'Штр. с ударом', penalty: 'Пенальти', throwing: 'Ауты', throwIns: 'Ауты',
  offsides: 'Офсайды', penaltyWithShot: 'Пенальти с ударом',
};

function fieldLabel(k: string): string {
  if (FIELD_RU[k]) return FIELD_RU[k];
  // camelCase → "Camel case"
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function AggregateCard({ title, data }: { title: string; data: AnyObj }) {
  // Только записи с реальным числом > 0. Скрываем mapImage (это base64 строка).
  // Дедуп по русскому лейблу — оставляем макс значение (interception vs interceptions).
  type Entry = { k: string; label: string; val: number; suffix: string };
  const bucket = new Map<string, Entry>();
  for (const [k, v] of Object.entries(data || {})) {
    if (k === 'mapImage') continue;
    let val: number | null = null;
    let suffix = '';
    if (typeof v === 'number') val = v;
    else if (v && typeof v === 'object') {
      if (typeof (v as AnyObj).value === 'number') val = Number((v as AnyObj).value);
      else if (typeof (v as AnyObj).pct === 'number') {
        val = Number((v as AnyObj).pct);
        suffix = '%';
      }
    }
    if (val == null || val === 0) continue;  // Скрываем нули
    const label = fieldLabel(k);
    const prev = bucket.get(label);
    if (!prev || prev.val < val) bucket.set(label, { k, label, val, suffix });
  }
  const entries = Array.from(bucket.values()).sort((a, b) => b.val - a.val).slice(0, 6);
  if (entries.length === 0) return null;
  return (
    <div className="cd__agg-card">
      <div className="cd__agg-title">{title}</div>
      {entries.map(({ k, label, val, suffix }) => (
        <div key={k} className="cd__agg-row">
          <span className="cd__agg-key">{label}</span>
          <span className="cd__agg-val">{val.toLocaleString('ru-RU')}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

/** Тонкая SVG-иконка пустого состояния (вместо эмодзи). */
function EmptyIcon({ kind }: { kind: 'chart' | 'trophy' }) {
  return (
    <div className="cd__empty-icon" aria-hidden>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'chart' ? (
          <>
            <path d="M3 3v18h18" />
            <rect x="7" y="12" width="3" height="6" />
            <rect x="12" y="8" width="3" height="10" />
            <rect x="17" y="5" width="3" height="13" />
          </>
        ) : (
          <>
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
          </>
        )}
      </svg>
    </div>
  );
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

// StatTile вынесен в components/StatTile.tsx (glassmorphism + accent + delta)

function Countdown({ to }: { to: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function tick() {
      const diff = new Date(to).getTime() - Date.now();
      if (diff <= -3 * 3600 * 1000) {
        // Матч завершился больше 3 ч назад — countdown больше не нужен
        setText('');
        if (timer) clearInterval(timer);
        return;
      }
      if (diff <= 0) {
        setText('идёт сейчас');
        return;
      }
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000) / 60000);
      if (days > 0)      setText(`через ${days} дн. ${hours} ч.`);
      else if (hours > 0) setText(`через ${hours} ч. ${mins} мин.`);
      else if (mins > 0)  setText(`через ${mins} мин.`);
      else                setText('начнётся через минуту');
    }
    tick();
    timer = setInterval(tick, 60000);
    return () => { if (timer) clearInterval(timer); };
  }, [to]);
  if (!text) return null;
  return <div className="cd__countdown">{text}</div>;
}
