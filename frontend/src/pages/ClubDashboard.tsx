/**
 * Главный дашборд клуба — заменяет legacy ClubPage с Легирус-моками.
 *
 * РОЛЬ — ВИТРИНА (статус «сейчас» за 10 секунд), НЕ океан аналитики.
 * Глубокая командная аналитика (xG-модель, идентичность, командные показатели
 * за период) живёт на /analytics — здесь её НЕ дублируем (см. UI_IMPROVEMENTS_200
 * «Рекомендованный порядок»: club=витрина, analytics=океан).
 *
 * Секции:
 *  - Hero: ближайший матч (countdown + venue) + последний результат
 *  - Рейтинг сезона (оценка + форма) + лучший игрок сезона
 *  - Детальная аналитика по секциям (среднее за сезон) — ВРЕМЕННО, переедет в /analytics
 *  - Топ-5 игроков по среднему рейтингу за сезон + турнирная таблица
 *  - Профили топ-3 (сезонный радар) — ВРЕМЕННО, переедет в профиль/океан
 *  - Состав за сезон по линиям
 *
 * Данные: /data/teams, /data/matches?teamId, /data/match/:id, /data/calendar/:age,
 *         /data/standings/:age, /data/players/season, /data/matches/aggregate
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore — legacy .js hook
import { useReveal } from '../hooks/useReveal';
import {
  fetchTeams, fetchMatches, fetchMatch, fetchStandings, fetchCalendar, fetchMatchAggregate,
  fetchPlayersSeason,
} from '../services/api';
// @ts-ignore — legacy
import { useAuth } from '../contexts/AuthContext';
// @ts-ignore — legacy
import { useTeam } from '../contexts/TeamContext';
// Единая шкала рейтинга (var(--rating-*)) — общий источник по всему UI.
import { ratingColor, ratingTextColor } from '../utils/colors';
import { matchesWord } from '../utils/num';
import { surnameOf } from '../utils/players';
// @ts-ignore — legacy .js
import { shieldFor, normalizeTeamName as normLeague } from '../utils/legirus';
// @ts-ignore — legacy .jsx
import PredictedLineup from '../components/PredictedLineup';
// @ts-ignore — legacy .jsx
import PlayerPhoto from '../components/PlayerPhoto';
// @ts-ignore — legacy .jsx
import OpponentPreview from '../components/OpponentPreview';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SplitText, AnimatedNumber, StaggerList } from '../components/motion';
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

  // Kinetic-полировка: reveal секций при скролле. 3D parallax-tilt KPI-карточек
  // убран — для аналитического дашборда важнее читаемость и спокойствие, чем
  // «игрушечный» наклон (плюс он не работал на тач). Сдержанный hover-lift —
  // в CSS (.cd__kpi-card--click:hover).
  const cdRef = useRef<HTMLDivElement>(null);
  useReveal(cdRef, [selectedTeamId]);

  const [team, setTeam]               = useState<Team | null>(null);
  const [calendar, setCalendar]       = useState<AnyObj[]>([]);
  const [standings, setStandings]     = useState<AnyObj | null>(null);
  const [latestMatch, setLatestMatch] = useState<AnyObj | null>(null);
  const [matches, setMatches]         = useState<AnyObj[]>([]);
  // Сезонные данные — основной якорь дашборда (не «последний матч»):
  //  seasonPlayers — агрегат по игрокам (avg-рейтинги + сезонный радар);
  //  seasonAgg     — командные показатели + агрегаты за весь сезон.
  const [seasonPlayers, setSeasonPlayers] = useState<AnyObj[]>([]);
  const [seasonAgg, setSeasonAgg]         = useState<AnyObj | null>(null);
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

        // Сезонные агрегаты (игроки + командные показатели за весь сезон) —
        // якорь блоков «Топ-5 / Профили / Состав / Средний рейтинг / Идентичность».
        const [seasonRes, aggRes] = await Promise.all([
          fetchPlayersSeason(myTeam.id).catch(() => ({ players: [] })),
          fetchMatchAggregate(myTeam.id, 'season').catch(() => null),
        ]);
        if (!cancelled) {
          setSeasonPlayers(((seasonRes as AnyObj)?.players ?? []) as AnyObj[]);
          setSeasonAgg(aggRes as AnyObj | null);
        }

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

  // Унификация имени команды для отображения. Для НАШЕЙ команды берём
  // каноническое имя из загруженных данных (team.name) вместо «грязной» строки
  // календаря; для любой — чистим (юр-форма/скобки/возраст). См. cleanTeamName.
  const teamDisplay = (raw: unknown, isOur: boolean): string =>
    cleanTeamName(isOur ? (selectedTeam?.name || team?.name || raw) : raw);

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

  // Сезонный состав в форме «match-player» (ratings.overall = avg, radar = сезонный),
  // чтобы Топ-5/KPI/радары/состав работали без переписывания. Fallback — игроки
  // последнего матча (когда сезонный агрегат пуст, напр. первый разбор).
  const seasonRoster = useMemo<AnyObj[]>(() => {
    if (seasonPlayers.length === 0) return (latestMatch?.players ?? []) as AnyObj[];
    return seasonPlayers.map((p) => {
      const name = String(p.fullName ?? '');
      const sp = name.split(' ');
      return {
        playerId: p.id,
        fullName: name,
        firstName: sp[0] ?? '',
        lastName: sp.slice(1).join(' '),
        number: p.number,
        position: p.position,
        photoUrl: p.photoUrl,
        minutes: p.minutes,
        matches: p.matches,
        ratings: { overall: p.avgOverall, attack: p.avgAttack, defence: p.avgDefence, fitness: p.avgFitness },
        radar: p.radar ?? {},
        // Сырые сезонные агрегаты — для инсайтов карточки лучшего игрока.
        season: {
          goals: Number(p.goals ?? 0), assists: Number(p.assists ?? 0),
          dribble: Number(p.dribble ?? 0), tackle: Number(p.tackle ?? 0),
          interception: Number(p.interception ?? 0), recovery: Number(p.recovery ?? 0),
          duel: Number(p.duel ?? 0), pressing: Number(p.pressing ?? 0),
          keyPass: Number(p.keyPass ?? 0), shots: Number(p.shots ?? 0),
          distance: Number(p.distance ?? 0), sprintDistance: Number(p.sprintDistance ?? 0),
        },
      };
    });
  }, [seasonPlayers, latestMatch]);

  // Сколько матчей в основе сезонного агрегата (для подписей блоков).
  const seasonMatchCount = useMemo<number>(() => {
    if (Number(seasonAgg?.matchCount)) return Number(seasonAgg!.matchCount);
    return seasonPlayers.reduce((m, p) => Math.max(m, Number(p.matches ?? 0)), 0);
  }, [seasonAgg, seasonPlayers]);

  const topPlayers = useMemo<AnyObj[]>(() => {
    // Фильтр > 0: не игравшие/без рейтинга — в топ-5 их не должно быть.
    return [...seasonRoster]
      .filter((p) => p.ratings?.overall != null && Number(p.ratings.overall) > 0)
      .sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0))
      .slice(0, 5);
  }, [seasonRoster]);

  // Форма команды за сезон: последние сыгранные матчи → В/Н/П (хронологически).
  // Источник — calendar (результаты есть без догрузки деталей). Берём до 6.
  const seasonForm = useMemo<{ result: 'W' | 'D' | 'L'; opp: string; score: string; date: string }[]>(() => {
    const played = calendar
      .filter((m) => m.isOurMatch && m.scoreH != null && m.scoreA != null && m.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
    const mapped = played.map((m) => {
      const ourHome = isOurName(m.home, ourName);
      const our = Number(ourHome ? m.scoreH : m.scoreA);
      const opp = Number(ourHome ? m.scoreA : m.scoreH);
      const result: 'W' | 'D' | 'L' = our > opp ? 'W' : our === opp ? 'D' : 'L';
      return { result, opp: cleanTeamName(ourHome ? m.away : m.home), score: `${our}:${opp}`, date: m.date as string };
    });
    return mapped.reverse(); // хронологический порядок слева-направо
  }, [calendar, ourName]);

  // Средний рейтинг команды за сезон: из агрегата, иначе среднее по составу.
  const avgTeamRating = useMemo<number>(() => {
    const fromAgg = Number((seasonAgg?.teamAvgRatings as AnyObj)?.overall ?? 0);
    if (fromAgg > 0) return fromAgg;
    const rated = seasonRoster
      .map((p) => Number(p.ratings?.overall ?? 0))
      .filter((x) => x > 0);
    return rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
  }, [seasonAgg, seasonRoster]);

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

  // Сезон показываем по году окончания (2025-2026 → 2026). Источник — season
  // из разбора, затем из standings, иначе дефолт текущего сезона.
  const seasonLabel = useMemo<string>(() => {
    const raw = String(
      matches.find((m) => m.season)?.season
      ?? (standings as AnyObj)?.season
      ?? '2026',
    );
    const m = raw.match(/(\d{4})\s*[-–—/]\s*(\d{4})/);
    return m ? m[2]! : raw;
  }, [matches, standings]);

  if (loading) return <div className="cd"><div className="cd__loading">Загрузка дашборда…</div></div>;
  if (error)   return <div className="cd"><div className="cd__error">{error}</div></div>;
  if (!team)   return <div className="cd"><div className="cd__error">Команда не найдена</div></div>;

  const clubLogo = shieldFor(team.name);

  return (
    <div className="cd kinetic" ref={cdRef} data-testid="club-dashboard">
      <div className="cd__bg-glow" aria-hidden />

      <header className="cd__header">
        <div className="cd__header-id">
          {clubLogo && (
            <img src={clubLogo} alt="" className="cd__club-logo" aria-hidden
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          )}
          <div className="cd__header-text">
            <div className="cd__eyebrow">{team.ageLabel || ageGroupLabel(team.ageGroup)} · Сезон {seasonLabel}</div>
            <h1 className="cd__title"><SplitText text={cleanTeamName(team.name)} /></h1>
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
        </div>
      </header>

      {/* Якорная навигация — разбивает «стену карточек», даёт быстрый переход.
          Перечисляем только реально отрисованные секции. */}
      <nav className="cd__anchors" aria-label="Разделы дашборда">
        {[
          { id: 'sec-main', label: 'Главное' },
          { id: 'sec-top', label: 'Топ-игроки' },
          { id: 'sec-roster', label: 'Состав' },
        ].map((a) => (
          <button key={a.id} type="button" className="cd__anchor"
            onClick={() => document.getElementById(a.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {a.label}
          </button>
        ))}
      </nav>

      {/* ГЛАВНОЕ — единый фрейм: матчи + ключевые показатели команды (правки #5,#6,#9,#10) */}
      <section className="cd__main" id="sec-main">
        <div className="cd__main-title">Главное</div>
        <div className="cd__main-grid">
          {/* Матчи: следующий (герой, 60% высоты) + последний (вспомогательный, 40%) */}
          <div className="cd__main-matches">
            {nextMatch ? (
              <div className="cd__mm cd__mm--next">
                <div className="cd__mm-eyebrow">Следующий · {nextMatch.round || ''}</div>
                <div className="cd__hero-matchup">
                  <MatchupTeam name={teamDisplay(nextMatch.home, isOurName(nextMatch.home, ourName))} shield={nextMatch.homeShield} isOur={isOurName(nextMatch.home, ourName)} />
                  <span className="cd__hero-vs">—</span>
                  <MatchupTeam name={teamDisplay(nextMatch.away, isOurName(nextMatch.away, ourName))} shield={nextMatch.awayShield} isOur={isOurName(nextMatch.away, ourName)} />
                </div>
                <div className="cd__mm-formrow">
                  <TeamFormMini name={nextMatch.home} calendar={calendar} standings={standings} align="left" />
                  <TeamFormMini name={nextMatch.away} calendar={calendar} standings={standings} align="right" />
                </div>
                <div className="cd__hero-meta">
                  <span>{formatDateLong(nextMatch.date)}</span>
                  {nextMatch.venue && <span className="cd__hero-venue"> · {nextMatch.venue}</span>}
                </div>
                <CountdownHero to={nextMatch.date} />
              </div>
            ) : (
              <div className="cd__mm cd__mm--empty">
                <div className="cd__mm-eyebrow">Следующий матч</div>
                <div className="cd__hero-empty-text">Расписание на сезон закрыто</div>
              </div>
            )}

            {lastResult && (
              <div className="cd__mm cd__mm--last">
                <div className="cd__mm-eyebrow">Последний · {lastResult.round || ''}</div>
                <div className="cd__hero-matchup">
                  <MatchupTeam name={teamDisplay(lastResult.home, isOurName(lastResult.home, ourName))} shield={lastResult.homeShield} isOur={isOurName(lastResult.home, ourName)} />
                  <span className="cd__hero-score">{lastResult.scoreH}:{lastResult.scoreA}</span>
                  <MatchupTeam name={teamDisplay(lastResult.away, isOurName(lastResult.away, ourName))} shield={lastResult.awayShield} isOur={isOurName(lastResult.away, ourName)} />
                </div>
                <div className="cd__hero-meta">{formatDateShort(lastResult.date)}</div>
                {lastReport && (
                  <button className="cd__hero-action" onClick={() => navigate(`/matches/${lastReport.id}`)}>
                    Открыть подробный разбор →
                  </button>
                )}
              </div>
            )}

            {nextMatch && (
              <OpponentPreview
                nextMatch={nextMatch}
                allMatches={calendar.map((m) => ({
                  ...m,
                  isPast: m.scoreH != null && m.scoreA != null,
                  score: m.scoreH != null && m.scoreA != null ? { home: m.scoreH, away: m.scoreA } : null,
                }))}
                standings={standings}
              />
            )}
          </div>

          {/* Правые 2 узкие колонки (40%) — KPI с каскадным появлением (StaggerList) */}
          <StaggerList speed="normal" as="div" className="cd__kpi-column-group" whenInView={false}>
          {/* Рейтинг сезона (#9) — инфографика: оценка + форма + раскладка по линиям */}
          {(() => {
            const ov = Number(avgTeamRating ?? 0);
            const tar = (seasonAgg?.teamAvgRatings ?? {}) as Record<string, unknown>;
            const lines: { label: string; val: number }[] = [
              { label: 'Атака', val: Number(tar.attack ?? 0) },
              { label: 'Защита', val: Number(tar.defence ?? 0) },
              { label: 'Фитнес', val: Number(tar.fitness ?? 0) },
            ].filter((l) => l.val > 0);
            const col = ratingColor(ov);
            return (
              <div className="cd__kpi-card cd__kpi-card--metric">
                <div className="cd__kpi-head">
                  <span className="cd__kpi-label">Рейтинг сезона</span>
                  {ov > 0 && (
                    <span className="cd__kpi-grade" style={{ color: col, background: `color-mix(in srgb, ${col} 16%, transparent)` }}>
                      {ratingGrade(ov)}
                    </span>
                  )}
                </div>
                {ov > 0 ? (
                  <div className="cd__rt">
                    <div className="cd__rt-top">
                      <span className="cd__kpi-big" style={{ color: col }}>
                        <AnimatedNumber value={ov} format={(v) => v.toFixed(2)} /><span className="cd__kpi-scale">/10</span>
                      </span>
                      {seasonForm.length > 0 && (
                        <div className="cd__rt-form" title="Форма: последние матчи">
                          <div className="cd__rt-dots">
                            {seasonForm.map((f, i) => (
                              <span key={i} className={`cd__dot cd__dot--${f.result}`} title={`${f.opp} ${f.score}`}>
                                {f.result === 'W' ? 'В' : f.result === 'D' ? 'Н' : 'П'}
                              </span>
                            ))}
                          </div>
                          <span className="cd__rt-form-cap">форма</span>
                        </div>
                      )}
                    </div>
                    {lines.length > 0 && (
                      <div className="cd__rt-lines">
                        {lines.map((l) => (
                          <div key={l.label} className="cd__rt-line">
                            <span className="cd__rt-line-lab">{l.label}</span>
                            <span className="cd__rt-line-bar">
                              <span className="cd__rt-line-fill" style={{ width: `${Math.min(100, l.val * 10)}%`, background: ratingColor(l.val) }} />
                            </span>
                            <span className="cd__rt-line-val" style={{ color: ratingColor(l.val) }}>{l.val.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <span className="cd__kpi-sub">{seasonMatchCount > 0 ? `средний индекс эффективности · ${seasonMatchCount} ${matchesWord(seasonMatchCount)}` : 'средний индекс эффективности'}</span>
                  </div>
                ) : (
                  <div className="cd__kpi-hero"><div className="cd__kpi-empty">нет разбора</div></div>
                )}
              </div>
            );
          })()}

          {/* Лучший игрок сезона (#10) — карточка с авто-инсайтами по вкладу */}
          {(() => {
            const best = topPlayers[0];
            const r = Number(best?.ratings?.overall ?? 0);
            const insights = best ? bestPlayerInsights(best, seasonRoster) : [];
            return (
              <div
                className={`cd__kpi-card cd__kpi-card--player${best ? ' cd__kpi-card--click' : ''}`}
                role={best ? 'button' : undefined} tabIndex={best ? 0 : undefined}
                onClick={() => best && navigate(`/players/${best.playerId}`)}
                onKeyDown={best ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/players/${best.playerId}`); } } : undefined}
              >
                <div className="cd__kpi-head">
                  <span className="cd__kpi-label">Лучший игрок сезона</span>
                  {best && (
                    <span className="cd__kpi-rank" style={{ background: ratingColor(r), color: ratingTextColor(r) }}>
                      {r.toFixed(1)}
                    </span>
                  )}
                </div>
                {best ? (
                  <div className="cd__bp">
                    <div className="cd__bp-id">
                      <PlayerPhoto player={best} size={64} className="cd__bp-photo" />
                      <div className="cd__bp-body">
                        <span className="cd__bp-name">{best.fullName}</span>
                        <span className="cd__kpi-sub">#{best.number ?? '—'} · {best.position || posGroupLabel(posGroup(best.position))}{best.matches ? ` · ${best.matches} ${matchesWord(best.matches)}` : ''}</span>
                      </div>
                    </div>
                    {insights.length > 0 && (
                      <ul className="cd__bp-insights">
                        {insights.map((ins, i) => (
                          <li key={i} className="cd__bp-insight">
                            <InsightDot kind={ins.kind} />
                            <span className="cd__bp-insight-text">
                              {ins.lead && <b className="cd__bp-insight-lead">{ins.lead}</b>}{ins.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="cd__kpi-foot cd__kpi-foot--hint">Открыть профиль →</div>
                  </div>
                ) : (
                  <div className="cd__kpi-hero"><div className="cd__kpi-empty">нет разбора</div></div>
                )}
              </div>
            );
          })()}
          </StaggerList>
        </div>
      </section>

      {/* Top 5 + standings */}
      <section className="cd__columns" id="sec-top">
        <div className="cd__panel reveal">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Топ-5 по рейтингу</h2>
            <span className="cd__panel-sub">
              {topPlayers.length > 0
                ? (seasonMatchCount > 0 ? `средний рейтинг за сезон · ${seasonMatchCount} ${matchesWord(seasonMatchCount)}` : 'средний рейтинг за сезон')
                : 'нет загруженных разборов'}
            </span>
          </div>
          {topPlayers.length === 0 ? (
            <div className="cd__empty">
              <EmptyIcon kind="chart" />
              <div>Загрузи PDF + Excel SportVisor, чтобы увидеть рейтинги игроков</div>
            </div>
          ) : (
            <StaggerList speed="normal" as="ol" className="cd__top">
              {topPlayers.map((p, i) => {
                const r = Number(p.ratings?.overall ?? 0);
                const grp = posGroup(p.position);
                const sub = [
                  p.position || posGroupLabel(grp),
                  p.matches ? `${p.matches} ${matchesWord(p.matches)}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <li key={p.playerId} className="cd__top-row" role="button" tabIndex={0}
                    onClick={() => navigate(`/players/${p.playerId}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/players/${p.playerId}`); } }}>
                    <span className="cd__top-rank">{i + 1}</span>
                    <span className="cd__top-figure">
                      <PlayerPhoto player={p} size={64} className="cd__top-photo" />
                      <RoleBadge group={grp} />
                    </span>
                    <span className="cd__top-id">
                      <span className="cd__top-name">{p.fullName}</span>
                      <span className="cd__top-sub">{sub}</span>
                    </span>
                    <span className="cd__top-rating" style={{ background: ratingColor(r), color: ratingTextColor(r) }}>
                      {r > 0 ? r.toFixed(1) : '—'}
                    </span>
                  </li>
                );
              })}
            </StaggerList>
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
                  <tr><th>#</th><th>Команда</th><th title="Игр">И</th><th title="Мячи (забили-пропустили)">М</th><th title="Победы · Ничьи · Поражения">В·Н·П</th><th title="Очки">О</th></tr>
                </thead>
                <tbody>
                  {standingsTopRows.map((r, i) => r.__divider ? (
                    <tr key={`div-${i}`} className="cd__table-divider">
                      <td colSpan={6}>···</td>
                    </tr>
                  ) : (
                    <tr key={`${r.pos}-${r.team}`} className={r.isOurClub ? 'cd__table-row--us' : ''}>
                      <td>{r.pos}</td>
                      <td className="cd__table-team">
                        <span className="cd__table-team-cell">
                          <TeamCrest src={r.shield} name={r.team} size={20} />
                          {cleanTeamName(r.team)}
                        </span>
                      </td>
                      <td>{r.games}</td>
                      <td>{r.scored}-{r.missed}</td>
                      <td className="cd__table-wdl">
                        <b className="cd__wdl cd__wdl--w">{r.wins}</b>
                        <span className="cd__wdl-sep">·</span>
                        <b className="cd__wdl cd__wdl--d">{r.draws}</b>
                        <span className="cd__wdl-sep">·</span>
                        <b className="cd__wdl cd__wdl--l">{r.losses}</b>
                      </td>
                      <td className="cd__table-pts">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Зона состава: вероятный стартовый XI + полный состав за сезон ──
          Объединены в один блок (раньше PredictedLineup стоял выше и был
          оторван от «Состава» блоком Топ-5/таблицы — см. правку UX). */}
      {isCoach && selectedTeamId && <PredictedLineup teamId={selectedTeamId} />}

      {/* Roster */}
      <section className="cd__panel reveal" id="sec-roster">
        <div className="cd__panel-header">
          <h2 className="cd__panel-title">
            Состав{seasonRoster.length ? ` (${seasonRoster.length})` : ''}
          </h2>
          <span className="cd__panel-sub">
            {seasonRoster.length
              ? (seasonMatchCount > 0 ? `за сезон · ${seasonMatchCount} ${matchesWord(seasonMatchCount)}` : 'за сезон')
              : 'нет загруженных разборов'}
          </span>
        </div>
        {(() => {
          // Состав tier-display: по линиям (вратари → защита → полузащита →
          // нападение), внутри линии — три яруса:
          //  • топ-3 по рейтингу → крупные плитки 80px (основа линии, свечение);
          //  • остальные сыгравшие → 48px;
          //  • бенч (без матчей или рейтинг < BENCH_RATING) → 48px, приглушены.
          const BENCH_RATING = 3.0;
          const all = seasonRoster;
          const LINES: { id: string; label: string }[] = [
            { id: 'gk',  label: 'Вратари' },
            { id: 'def', label: 'Защита' },
            { id: 'mid', label: 'Полузащита' },
            { id: 'fwd', label: 'Нападение' },
            { id: 'unknown', label: 'Без позиции' },
          ];
          const byLine = (id: string): AnyObj[] => all
            .filter((p) => posGroup(p.position) === id)
            .sort((a, b) => {
              const ra = Number(a.ratings?.overall ?? 0); const rb = Number(b.ratings?.overall ?? 0);
              if (rb !== ra) return rb - ra;
              return Number(a.number ?? 99) - Number(b.number ?? 99);
            });

          // Плитка игрока: size 80 (топ-3) или 48 (остальные/бенч).
          const renderTile = (p: AnyObj, size: 80 | 48) => {
            const r = Number(p.ratings?.overall ?? 0);
            const grp = posGroup(p.position);
            const mins = Number(p.minutes ?? 0);
            const gp = Number(p.matches ?? 0);
            const sub = gp > 0
              ? `${gp} ${matchesWord(gp)}${mins > 0 ? ` · ${mins}'` : ''}`
              : (mins > 0 ? `${mins}'` : 'не выходил');
            return (
              <div
                key={p.playerId}
                className={`cd__player-tile${size === 80 ? ' cd__player-tile--top' : ''}${r > 0 ? ' cd__player-tile--rated' : ''}`}
                style={r > 0 ? ({ '--rt-col': ratingColor(r) } as React.CSSProperties) : undefined}
                role="button" tabIndex={0}
                onClick={() => navigate(`/players/${p.playerId}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/players/${p.playerId}`); } }}
              >
                <div className="cd__player-figure">
                  <PlayerPhoto player={p} size={size} className="cd__player-photo" />
                  <RoleBadge group={grp} />
                  {r > 0 && (
                    <span className="cd__player-rating" style={{ background: ratingColor(r), color: ratingTextColor(r) }}>
                      {r.toFixed(1)}
                    </span>
                  )}
                </div>
                <span className="cd__player-name">{surnameOf(p)}</span>
                <span className="cd__player-number">#{p.number ?? '—'} · {sub}</span>
              </div>
            );
          };

          const nonEmpty = LINES
            .map((line) => {
              const players = byLine(line.id);
              const isBench = (p: AnyObj): boolean =>
                Number(p.matches ?? 0) === 0 || Number(p.ratings?.overall ?? 0) < BENCH_RATING;
              const field = players.filter((p) => !isBench(p));
              const bench = players.filter(isBench);
              const top = field.slice(0, 3);
              const rest = field.slice(3);
              return { ...line, count: players.length, top, rest, bench };
            })
            .filter((g) => g.count > 0);
          // Заголовки линий показываем только когда позиции реально размечены
          // (есть ≥2 группы). Если все «без позиции» (частый случай ФФСПБ) —
          // просто состав без бессмысленной подписи «Без позиции».
          const showHeaders = nonEmpty.length > 1;
          return (
            <div className="cd__roster-lines">
              {nonEmpty.map((g) => (
                <div key={g.id} className="cd__line">
                  {showHeaders && (
                    <div className="cd__line-head">
                      <span className="cd__line-label">{g.label}</span>
                      <span className="cd__line-count">{g.count}</span>
                    </div>
                  )}
                  <div className="cd__line-tiers">
                    {g.top.length > 0 && (
                      <StaggerList speed="tight" as="div" className="cd__tier cd__tier--top">
                        {g.top.map((p) => renderTile(p, 80))}
                      </StaggerList>
                    )}
                    {g.rest.length > 0 && (
                      <StaggerList speed="tight" as="div" className="cd__tier cd__tier--rest">
                        {g.rest.map((p) => renderTile(p, 48))}
                      </StaggerList>
                    )}
                    {g.bench.length > 0 && (
                      <div className="cd__tier cd__tier--bench">
                        {g.bench.map((p) => renderTile(p, 48))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
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
import { cleanTeamName } from '../utils/teamName';

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

/** Классификатор позиции в группу для фильтра состава.
 * Поддерживает полные слова и короткие коды SportVisor (ЦЗ/ПН/ВР/ЛЦП…).
 * «полузащит» раньше «защит» — иначе «полузащитник» ложно попал бы в защиту.
 * Для кодов классифицируем по последней букве: Р→ВРТ, З→защита, П→полузащита,
 * Н→нападение (ЦЗ/ЛЗ/ПЗ → def, ЦП/ЛЦП/ОП/ЦОП → mid, ЦН/ПН/ЛН → fwd, ВР → gk). */
function posGroup(position?: string): string {
  const p = String(position || '').trim().toLowerCase();
  if (!p) return 'unknown';
  if (p.includes('вратар') || p.includes('голк')) return 'gk';
  if (p.includes('полузащит') || p.includes('хавбек') || p.includes('опорн') || p.includes('плеймейк')) return 'mid';
  if (p.includes('защит') || p.includes('бек') || p.includes('латераль')) return 'def';
  if (p.includes('напад') || p.includes('форвард')) return 'fwd';
  const code = p.toUpperCase().replace(/[^А-ЯЁ]/g, '');
  // FFSPB-коды (3 буквы, значима ПЕРВАЯ): ЗАЩ/НАП/ВРТ/ПОЛ. Ставим ДО эвристики
  // «по последней букве» — иначе НАП (последняя «П») ложно попадал в полузащиту,
  // а ЗАЩ/ВРТ (последние Щ/Т) — в unknown «без позиции».
  if (code.startsWith('ВРТ')) return 'gk';
  if (code.startsWith('НАП')) return 'fwd';
  if (code.startsWith('ЗАЩ')) return 'def';
  if (code.startsWith('ПОЛ')) return 'mid';
  if (code && code.length <= 4) {
    if (code === 'ВР' || code === 'ГК') return 'gk';
    const last = code[code.length - 1];
    if (last === 'Р') return 'gk';
    if (last === 'З') return 'def';
    if (last === 'П') return 'mid';
    if (last === 'Н') return 'fwd';
  }
  return 'unknown';
}

/** Возрастная группа: год рождения (2010) → «2010 г.р.», возраст (15) → «U-15».
 *  Раньше всегда лепили «U-», отсюда бессмысленное «U-2010» (U + год рождения). */
function ageGroupLabel(ag?: string | null): string {
  const s = String(ag ?? '').trim();
  if (/^(19|20)\d{2}$/.test(s)) return `${s} г.р.`;
  if (/^\d{1,2}$/.test(s)) return `U-${s}`;
  return s || '—';
}

/** Человеко-понятная подпись группы позиции — на случай, когда точная позиция неизвестна. */
function posGroupLabel(grp: string): string {
  switch (grp) {
    case 'gk': return 'вратарь';
    case 'def': return 'защитник';
    case 'mid': return 'полузащитник';
    case 'fwd': return 'нападающий';
    default: return 'полевой игрок';
  }
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

/** Эмблема клуба: URL → <img>, иначе первая буква названия в кружке. */
function TeamCrest({ src, name, size = 28 }: { src?: string | null; name?: string; size?: number }) {
  const [errored, setErrored] = useState(false);
  // Единая точка эмблем: shieldFor() даёт лого Легируса/нашего клуба, внешний
  // FFSPB-щит — только fallback. Без этого наша команда теряла лого (FFSPB не
  // отдаёт щит для своего клуба) и падала в букву-инициал.
  const resolvedSrc = shieldFor(name ?? '', src ?? '') || src;
  if (!resolvedSrc || errored) {
    const letter = String(name || '').trim().charAt(0).toUpperCase() || '?';
    return (
      <span className="cd__crest cd__crest--fallback" style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden>
        {letter}
      </span>
    );
  }
  return (
    <img className="cd__crest" src={resolvedSrc} alt="" width={size} height={size}
         loading="lazy" onError={() => setErrored(true)} />
  );
}

/** Место в лиге + форма (последние 5: В/Н/П) команды — считаем из календаря лиги
 *  и standings, БЕЗ новых запросов (всё уже загружено). */
function teamLeagueInfo(name: string, calendar: AnyObj[], standings: AnyObj | null): { pos: number | null; last5: ('W' | 'D' | 'L')[] } {
  // normLeague (utils/legirus) сильнее локального: режет юр-формы (ФК/ГБУ ДО…) и
  // применяет алиасы — иначе «ФК Легирус» из календаря не матчит «Легирус» в таблице.
  const norm = normLeague(name);
  const row = (((standings as AnyObj)?.table ?? []) as AnyObj[]).find((r) => normLeague(String(r.team)) === norm);
  const past = (calendar || [])
    .filter((m) => m.scoreH != null && m.scoreA != null && m.date &&
      (normLeague(String(m.home)) === norm || normLeague(String(m.away)) === norm))
    .sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime());
  const last5 = past.slice(0, 5).reverse().map((m) => {
    const isHome = normLeague(String(m.home)) === norm;
    const own = Number(isHome ? m.scoreH : m.scoreA);
    const opp = Number(isHome ? m.scoreA : m.scoreH);
    return (own > opp ? 'W' : own < opp ? 'L' : 'D') as 'W' | 'D' | 'L';
  });
  return { pos: row?.pos != null ? Number(row.pos) : null, last5 };
}

const FORM_RU: Record<'W' | 'D' | 'L', string> = { W: 'В', D: 'Н', L: 'П' };

/** Мини-блок «место в лиге + форма» под командой в превью матча. */
function TeamFormMini({ name, calendar, standings, align }: { name?: string; calendar: AnyObj[]; standings: AnyObj | null; align: 'left' | 'right' }) {
  if (!name) return null;
  const { pos, last5 } = teamLeagueInfo(name, calendar, standings);
  if (pos == null && last5.length === 0) return null;
  return (
    <div className={`cd__mm-form cd__mm-form--${align}`}>
      {pos != null && <span className="cd__mm-pos">#{pos} в лиге</span>}
      {last5.length > 0 && (
        <span className="cd__mm-form-cells" title="Последние матчи: В — победа, Н — ничья, П — поражение">
          {last5.map((r, i) => (
            <span key={i} className={`cd__mm-form-cell cd__mm-form-cell--${r.toLowerCase()}`}>{FORM_RU[r]}</span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Сторона матча в блоке «Главное»: эмблема + название (подсветка нашей команды). */
function MatchupTeam({ name, shield, isOur }: { name?: string; shield?: string | null; isOur: boolean }) {
  return (
    <span className={`cd__mt${isOur ? ' cd__mt--us' : ''}`}>
      <TeamCrest src={shield} name={name} size={32} />
      <span className="cd__mt-name">{name}</span>
    </span>
  );
}

// ── Авто-инсайты карточки лучшего игрока (сезонный вклад) ────────────────────
// Не пересказ суммы, а вывод: «лучший бомбардир», «лидер по обводкам», беговая
// работа. Сравниваем игрока с командой (лидерство = badge), берём топ-3.
type Insight = { kind: 'goal' | 'assist' | 'duel' | 'run'; lead?: string; text: string };

function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function bestPlayerInsights(best: AnyObj, roster: AnyObj[]): Insight[] {
  const s = (best?.season ?? {}) as Record<string, number>;
  if (!s || Object.values(s).every((v) => !Number(v))) return [];
  const out: Insight[] = [];
  // Командные максимумы — для значка «лучший в команде».
  const maxOf = (key: string): number =>
    roster.reduce((m, p) => Math.max(m, Number((p?.season as AnyObj)?.[key] ?? 0)), 0);
  const isLeader = (key: string, v: number) => v > 0 && v >= maxOf(key);

  // 1) Голы
  const goals = Number(s.goals ?? 0);
  if (goals > 0) {
    out.push({
      kind: 'goal',
      lead: isLeader('goals', goals) ? 'Лучший бомбардир' : undefined,
      text: `${isLeader('goals', goals) ? ' · ' : ''}${goals} ${ruPlural(goals, 'гол', 'гола', 'голов')} за сезон`,
    });
  }
  // 2) Результативные передачи
  const assists = Number(s.assists ?? 0);
  if (assists > 0) {
    out.push({
      kind: 'assist',
      lead: isLeader('assists', assists) ? 'Главный ассистент' : undefined,
      text: `${isLeader('assists', assists) ? ' · ' : ''}${assists} ${ruPlural(assists, 'результативная передача', 'результативные передачи', 'результативных передач')}`,
    });
  }
  // 3) Яркая «не-голевая» характеристика — где игрок лидер в команде.
  const TRAITS: { key: string; one: string; few: string; many: string }[] = [
    { key: 'dribble', one: 'обводка', few: 'обводки', many: 'обводок' },
    { key: 'tackle', one: 'отбор', few: 'отбора', many: 'отборов' },
    { key: 'interception', one: 'перехват', few: 'перехвата', many: 'перехватов' },
    { key: 'recovery', one: 'возврат', few: 'возврата', many: 'возвратов' },
    { key: 'pressing', one: 'действие в прессинге', few: 'действия в прессинге', many: 'действий в прессинге' },
  ];
  const traitLead = TRAITS
    .map((t) => ({ ...t, v: Number(s[t.key] ?? 0) }))
    .filter((t) => isLeader(t.key, t.v))
    .sort((a, b) => b.v - a.v)[0];
  if (traitLead && out.length < 3) {
    out.push({ kind: 'duel', lead: 'Лидер команды', text: ` · ${traitLead.v} ${ruPlural(traitLead.v, traitLead.one, traitLead.few, traitLead.many)}` });
  }
  // 4) Беговая работа — заполняем до трёх, если есть дистанция.
  const dist = Number(s.distance ?? 0);
  const m = Number(best?.matches ?? 0);
  if (dist > 0 && m > 0 && out.length < 3) {
    out.push({ kind: 'run', text: `${(dist / m / 1000).toFixed(1)} км за матч` });
  }
  return out.slice(0, 3);
}

/** Цветная иконка-маркер инсайта (без эмодзи — спокойный тон дашборда). */
function InsightDot({ kind }: { kind: Insight['kind'] }) {
  const color = kind === 'goal' ? 'var(--success)'
    : kind === 'assist' ? 'var(--accent-cyan)'
    : kind === 'duel' ? 'var(--warning)'
    : 'var(--text-faint)';
  return (
    <span className="cd__bp-dot" aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'goal' ? (
          <circle cx="12" cy="12" r="8" />
        ) : kind === 'assist' ? (
          <path d="M5 12h12M13 7l5 5-5 5" />
        ) : kind === 'duel' ? (
          <path d="M14.5 4l5.5 5.5L9 20.5 3.5 15z M16 2l6 6" />
        ) : (
          <path d="M13 4l-2 6h5l-7 10 2-7H6z" />
        )}
      </svg>
    </span>
  );
}

/** Качественная метка среднего рейтинга команды. */
function ratingGrade(r: number): string {
  if (r >= 8.5) return 'отлично';
  if (r >= 7.5) return 'сильно';
  if (r >= 6.5) return 'уверенно';
  if (r >= 5.5) return 'средне';
  return 'слабо';
}

// ratingColor / ratingTextColor — единый источник в ../utils/colors (импорт выше).
// Локальная градиентная копия удалена ради одной семантической шкалы var(--rating-*).
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

/** Группа позиции → буква-иконка роли для бейджа на фото. */
type RoleGroup = 'gk' | 'def' | 'mid' | 'fwd' | 'unknown';
const ROLE_LETTER: Record<RoleGroup, string> = { gk: 'ВР', def: 'З', mid: 'П', fwd: 'Н', unknown: '·' };
const ROLE_TITLE: Record<RoleGroup, string> = {
  gk: 'Вратарь', def: 'Защита', mid: 'Полузащита', fwd: 'Нападение', unknown: 'Без позиции',
};

/** Цветной бейдж-иконка роли на фото игрока (вратарь/защита/полузащита/нападение). */
function RoleBadge({ group }: { group: string }) {
  const g = (['gk', 'def', 'mid', 'fwd'].includes(group) ? group : 'unknown') as RoleGroup;
  // Без позиции бейдж не рисуем — иначе на фото висит пустой серый кружок «·».
  if (g === 'unknown') return null;
  return (
    <span className={`cd__role-badge cd__role-badge--${g}`} title={ROLE_TITLE[g]} aria-label={ROLE_TITLE[g]}>
      {ROLE_LETTER[g]}
    </span>
  );
}

/**
 * Состояние гигантского отсчёта: либо две крупных единицы (дни+часы / часы+мин),
 * либо один компактный блок (<1 мин / идёт сейчас). null — отсчёт уже не нужен.
 */
type CountdownState =
  | { mode: 'pair'; aLabel: string; aValue: number; aUnit: string; bValue: number; bUnit: string }
  | { mode: 'single'; lead: string; value: number; unit: string }
  | { mode: 'live' }
  | null;

function computeCountdown(to: string): CountdownState {
  const diff = new Date(to).getTime() - Date.now();
  if (diff <= -3 * 3600 * 1000) return null;      // завершился >3 ч назад
  if (diff <= 0) return { mode: 'live' };
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  if (days > 0)  return { mode: 'pair', aLabel: 'через', aValue: days, aUnit: 'дн.', bValue: hours, bUnit: 'ч.' };
  if (hours > 0) return { mode: 'pair', aLabel: 'через', aValue: hours, aUnit: 'ч.', bValue: mins, bUnit: 'мин.' };
  if (mins > 0)  return { mode: 'single', lead: 'начнётся через', value: mins, unit: 'мин.' };
  return { mode: 'single', lead: 'начнётся через', value: 1, unit: 'мин.' };
}

/**
 * Гигантский обратный отсчёт — герой-момент левой колонки. SplitText-слова
 * («через», «и») + AnimatedNumber-числа, дышит через CSS (cd__breathe-hero).
 * Пересчёт раз в минуту → числа переанимируются (движение подчёркивает время).
 */
function CountdownHero({ to }: { to: string }) {
  const [state, setState] = useState<CountdownState>(() => computeCountdown(to));
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const next = computeCountdown(to);
      setState(next);
      if (next === null && timer) clearInterval(timer);
    };
    tick();
    timer = setInterval(tick, 60000);
    return () => { if (timer) clearInterval(timer); };
  }, [to]);

  if (state === null) return null;
  if (state.mode === 'live') {
    return (
      <div className="cd__countdown-hero" aria-label="Матч идёт сейчас">
        <span className="cd__countdown-label"><SplitText text="идёт" /></span>
        <span className="cd__countdown-number cd__countdown-number--word">сейчас</span>
      </div>
    );
  }
  if (state.mode === 'single') {
    return (
      <div className="cd__countdown-hero" aria-label={`${state.lead} ${state.value} ${state.unit}`}>
        <span className="cd__countdown-label"><SplitText text={state.lead} /></span>
        <span className="cd__countdown-number">
          <AnimatedNumber value={state.value} format={(v) => String(Math.round(v))} stiffness={80} damping={12} />
          <span className="cd__countdown-unit">{state.unit}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="cd__countdown-hero" aria-label={`${state.aLabel} ${state.aValue} ${state.aUnit} и ${state.bValue} ${state.bUnit}`}>
      <span className="cd__countdown-label"><SplitText text={state.aLabel} /></span>
      <span className="cd__countdown-number">
        <AnimatedNumber value={state.aValue} format={(v) => String(Math.round(v))} stiffness={80} damping={12} />
        <span className="cd__countdown-unit">{state.aUnit}</span>
      </span>
      <span className="cd__countdown-label"><SplitText text="и" delay={0.2} /></span>
      <span className="cd__countdown-number">
        <AnimatedNumber value={state.bValue} format={(v) => String(Math.round(v))} stiffness={80} damping={12} />
        <span className="cd__countdown-unit">{state.bUnit}</span>
      </span>
    </div>
  );
}
