/**
 * Главный дашборд клуба — заменяет legacy ClubPage с Легирус-моками.
 *
 * ЯКОРЬ — СЕЗОН, не «последний матч»: рейтинги/топ-5/профили/состав/идентичность
 * считаются по сезонному агрегату. На последнем матче остаётся только Hero
 * (ближайший + последний результат) и опция «Матч» в переключателе показателей.
 *
 * Секции:
 *  - Hero: ближайший матч (countdown + venue) + последний результат
 *  - Командные показатели за период (Матч / 1 круг / 2 круг / Сезон, по умолч. сезон)
 *  - Детальная аналитика по секциям (среднее за сезон)
 *  - Как команда играет (стиль за сезон, тренерским языком)
 *  - Топ-5 игроков по среднему рейтингу за сезон + турнирная таблица
 *  - Профили топ-3 (сезонный радар) + состав за сезон
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
import { PlayerRadar } from '../components/PlayerRadar';
import { StatTile } from '../components/StatTile';
// Единая шкала рейтинга (var(--rating-*)) — общий источник по всему UI.
import { ratingColor, ratingTextColor } from '../utils/colors';
// @ts-ignore — legacy .js
import { shieldFor } from '../utils/legirus';
// @ts-ignore — legacy .jsx
import PredictedLineup from '../components/PredictedLineup';
// @ts-ignore — legacy .jsx
import PlayerPhoto from '../components/PlayerPhoto';
// @ts-ignore — legacy .jsx
import TeamSeasonAnalytics from '../components/analytics/TeamSeasonAnalytics';
// @ts-ignore — legacy .jsx
import TeamIdentityCard from '../components/analytics/TeamIdentityCard';
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

  // Фильтр периода блока «Командные показатели» (правка Зенита #7).
  // 'match' — конкретный матч (по умолчанию последний, можно выбрать другой);
  // round1/round2/season — усреднённые показатели за период (агрегат с backend).
  const [statPeriod, setStatPeriod]       = useState<'match' | 'round1' | 'round2' | 'season'>('season');
  const [statMatchId, setStatMatchId]     = useState<string | null>(null);
  const [statMatchDetail, setStatMatchDetail] = useState<AnyObj | null>(null);
  const [statAgg, setStatAgg]             = useState<AnyObj | null>(null);
  const [statLoading, setStatLoading]     = useState(false);

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

  // Режим «Матч»: если выбран НЕ последний матч — догружаем его детали.
  // Последний (matches[0]) уже загружен как latestMatch — повторный fetch не нужен.
  useEffect(() => {
    if (statPeriod !== 'match') { setStatMatchDetail(null); return; }
    const id = statMatchId ?? matches[0]?.id ?? null;
    if (!id || id === matches[0]?.id) { setStatMatchDetail(null); return; }
    let cancelled = false;
    setStatLoading(true);
    fetchMatch(id)
      .then((d) => { if (!cancelled) setStatMatchDetail(d as AnyObj); })
      .catch(() => { if (!cancelled) setStatMatchDetail(null); })
      .finally(() => { if (!cancelled) setStatLoading(false); });
    return () => { cancelled = true; };
  }, [statPeriod, statMatchId, matches]);

  // Режим «1 круг / 2 круг / сезон»: тянем агрегат с backend.
  useEffect(() => {
    if (statPeriod === 'match') { setStatAgg(null); return; }
    const teamId = team?.id ?? selectedTeamId;
    if (!teamId) return;
    let cancelled = false;
    setStatLoading(true);
    fetchMatchAggregate(teamId, statPeriod)
      .then((d) => { if (!cancelled) setStatAgg(d as AnyObj); })
      .catch(() => { if (!cancelled) setStatAgg(null); })
      .finally(() => { if (!cancelled) setStatLoading(false); });
    return () => { cancelled = true; };
  }, [statPeriod, team, selectedTeamId]);

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

  return (
    <div className="cd kinetic" ref={cdRef}>
      <div className="cd__bg-glow" aria-hidden />

      <header className="cd__header">
        <div>
          <div className="cd__eyebrow">{team.ageLabel || `U-${team.ageGroup}`} · Сезон {seasonLabel}</div>
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

      {/* Якорная навигация — разбивает «стену карточек», даёт быстрый переход.
          Перечисляем только реально отрисованные секции. */}
      <nav className="cd__anchors" aria-label="Разделы дашборда">
        {[
          { id: 'sec-main', label: 'Главное' },
          ...(latestMatch?.teamSummaryStats ? [{ id: 'sec-stats', label: 'Показатели' }] : []),
          ...((seasonAgg?.teamAggregates ?? latestMatch?.teamAggregates) ? [{ id: 'sec-detail', label: 'Аналитика' }] : []),
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
          {/* Матчи: следующий + последний в одном блоке (#6) */}
          <div className="cd__main-matches">
            {nextMatch ? (
              <div className="cd__mm cd__mm--next">
                <div className="cd__mm-eyebrow">Следующий · {nextMatch.round || ''}</div>
                <div className="cd__hero-matchup">
                  <MatchupTeam name={teamDisplay(nextMatch.home, isOurName(nextMatch.home, ourName))} shield={nextMatch.homeShield} isOur={isOurName(nextMatch.home, ourName)} />
                  <span className="cd__hero-vs">—</span>
                  <MatchupTeam name={teamDisplay(nextMatch.away, isOurName(nextMatch.away, ourName))} shield={nextMatch.awayShield} isOur={isOurName(nextMatch.away, ourName)} />
                </div>
                <div className="cd__hero-meta">
                  <span>{formatDateLong(nextMatch.date)}</span>
                  {nextMatch.venue && <span className="cd__hero-venue"> · {nextMatch.venue}</span>}
                </div>
                <Countdown to={nextMatch.date} />
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
          </div>

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
                        {ov.toFixed(2)}<span className="cd__kpi-scale">/10</span>
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
                    <span className="cd__kpi-sub">{seasonMatchCount > 0 ? `средний индекс эффективности · ${seasonMatchCount} матч.` : 'средний индекс эффективности'}</span>
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
                onClick={() => best && navigate(`/players/${best.playerId}`)}
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
                        <span className="cd__kpi-sub">#{best.number ?? '—'} · {best.position || 'игрок'}{best.matches ? ` · ${best.matches} матч.` : ''}</span>
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
        </div>
      </section>

      {/* Вероятный состав на следующий матч (Phase 5) — тренеру */}
      {isCoach && selectedTeamId && <PredictedLineup teamId={selectedTeamId} />}

      {/* Командные показатели за период (правка Зенита #7): матч / 1 круг / 2 круг / сезон.
          В режиме «матч» — наша сторона teamSummaryStats {home, away} + сравнение с
          соперником; в режиме периода — усреднённый агрегат с backend (opp = null). */}
      {latestMatch?.teamSummaryStats && (() => {
        const isMatchMode = statPeriod === 'match';
        const displayMatch = isMatchMode ? (statMatchDetail ?? latestMatch) : null;
        const our = isMatchMode
          ? pickOurSide(displayMatch as AnyObj, ourName)
          : ((statAgg?.our ?? null) as AnyObj | null);
        const opp = isMatchMode ? pickOppSide(displayMatch as AnyObj, ourName) : null;
        const avgRatings = (isMatchMode
          ? (displayMatch as AnyObj)?.teamAvgRatings
          : statAgg?.teamAvgRatings) as Record<string, unknown> | undefined;

        const PERIODS: { key: typeof statPeriod; label: string }[] = [
          { key: 'match',  label: 'Матч' },
          { key: 'round1', label: '1 круг' },
          { key: 'round2', label: '2 круг' },
          { key: 'season', label: `Сезон ${seasonLabel}` },
        ];

        // Семантический цвет KPI: зелёный — лучше соперника, красный — хуже.
        // higherBetter=false для «плохих» метрик (нарушения). Нет соперника → нейтраль.
        const cmp = (a: unknown, b: unknown, higherBetter = true): 'green' | 'red' | 'muted' => {
          const x = Number(a); const y = Number(b);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x === y) return 'muted';
          const better = higherBetter ? x > y : x < y;
          return better ? 'green' : 'red';
        };

        const sub = (() => {
          if (isMatchMode) {
            const m = displayMatch as AnyObj;
            return `${cleanTeamName(m.home)} ${m.scoreHome}:${m.scoreAway} ${cleanTeamName(m.away)}`;
          }
          const n = Number(statAgg?.matchCount ?? 0);
          const word = n % 10 === 1 && n % 100 !== 11 ? 'матч'
            : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'матча' : 'матчей';
          const label = PERIODS.find((p) => p.key === statPeriod)?.label ?? '';
          return `${label} · ${n} ${word} · среднее за матч`;
        })();

        return (
          <section className="cd__panel reveal" id="sec-stats">
            <div className="cd__panel-header">
              <h2 className="cd__panel-title">Командные показатели</h2>
              <span className="cd__panel-sub">{sub}</span>
            </div>
            <div className="cd__period-bar">
              <div className="cd__seg" role="tablist" aria-label="Период показателей">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="tab"
                    aria-selected={statPeriod === p.key}
                    className={`cd__seg-btn${statPeriod === p.key ? ' is-active' : ''}`}
                    onClick={() => setStatPeriod(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {isMatchMode && matches.length > 1 && (
                <select
                  className="cd__match-select"
                  aria-label="Выбор матча"
                  value={statMatchId ?? matches[0]?.id ?? ''}
                  onChange={(e) => setStatMatchId(e.target.value)}
                >
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {cleanTeamName(m.home)} {m.scoreHome}:{m.scoreAway} {cleanTeamName(m.away)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {statLoading && !our ? (
              <div className="cd__stats-empty">Загрузка…</div>
            ) : !our ? (
              <div className="cd__stats-empty">Нет разобранных матчей за выбранный период</div>
            ) : (
            <>
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
              {(() => {
                // xG-guard: >6 — битый рейтинг вместо xG (старые разборы) → не показываем.
                const xg = (v: unknown) => { const n = Number(v); return (v != null && Number.isFinite(n) && n <= 6) ? n : null; };
                const ourXg = xg(our.expectedGoals); const oppXg = xg(opp?.expectedGoals);
                return (
                  <StatTile accent={cmp(ourXg, oppXg)} label="xG"
                    value={ourXg != null ? ourXg.toFixed(2) : '—'}
                    extra={oppXg != null ? `соперник ${oppXg.toFixed(2)}` : undefined} />
                );
              })()}
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
            {avgRatings && (() => {
              const tar = avgRatings as Record<string, unknown>;
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
                  <div className="cd__avg-caption">Средний индекс эффективности по команде</div>
                  <div className="cd__avg-row">
                    {([['overall', 'Общий'], ['fitness', 'Фитнес'], ['attack', 'Атака'], ['defence', 'Защита']] as const).map(([k, label]) => {
                      const n = Number(tar[k] ?? 0);
                      return (
                        <div className="cd__avg-item" key={k}>
                          <span className="cd__avg-label">{label}</span>
                          <span className="cd__avg-val" style={n > 0 ? { color: ratingColor(n) } : undefined}>{fmt(k)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            </>
            )}
          </section>
        );
      })()}

      {/* teamAggregates — глубокая аналитика по секциям ЗА СЕЗОН (усреднённые
          командные агрегаты). Считаем только секции с хотя бы одной числовой
          записью — чтобы не показывать пустые категории. */}
      {(seasonAgg?.teamAggregates ?? latestMatch?.teamAggregates) && (() => {
        const ta = (seasonAgg?.teamAggregates ?? latestMatch?.teamAggregates) as Record<string, AnyObj>;
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
        const isSeason = !!seasonAgg?.teamAggregates;
        return (
          <section className="cd__panel reveal" id="sec-detail">
            <div className="cd__panel-header">
              <h2 className="cd__panel-title">Детальная аналитика по секциям</h2>
              <span className="cd__panel-sub">
                {isSeason && seasonMatchCount > 0 ? `количество действий · среднее за сезон, ${seasonMatchCount} матч.` : `количество действий · ${meaningful.length} категорий с данными`}
              </span>
            </div>
          <div className="cd__agg-grid">
            {meaningful.map(([key, vals]) => (
              <AggregateCard key={key} title={aggTitle(key)} data={vals as AnyObj} />
            ))}
          </div>
        </section>
        );
      })()}

      {/* xG-аналитика сезона: xPTS vs факт, реализация, форма, xG по матчам */}
      {matches.length > 0 && <TeamSeasonAnalytics matches={matches} />}

      {/* Как команда играет — стиль за сезон (тренерским языком) */}
      {seasonAgg && <TeamIdentityCard aggregate={seasonAgg} />}

      {/* Top 5 + standings */}
      <section className="cd__columns" id="sec-top">
        <div className="cd__panel reveal">
          <div className="cd__panel-header">
            <h2 className="cd__panel-title">Топ-5 по рейтингу</h2>
            <span className="cd__panel-sub">
              {topPlayers.length > 0
                ? (seasonMatchCount > 0 ? `средний рейтинг за сезон · ${seasonMatchCount} матч.` : 'средний рейтинг за сезон')
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
                      <span className="cd__top-rating" style={{ background: ratingColor(r), color: ratingTextColor(r) }}>
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
                      <td className="cd__table-team">
                        <span className="cd__table-team-cell">
                          <TeamCrest src={r.shield} name={r.team} size={20} />
                          {cleanTeamName(r.team)}
                        </span>
                      </td>
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
            <span className="cd__panel-sub">Индекс эффективности за сезон — % от лучшего в команде</span>
          </div>
          <div className="cd__radars-grid">
            {topPlayers.slice(0, 3).map((p) => (
              <div key={p.playerId} className="cd__radar-card" onClick={() => navigate(`/players/${p.playerId}`)}>
                <div className="cd__radar-head">
                  <span className="cd__radar-num">#{p.number}</span>
                  <span className="cd__radar-name">{p.fullName}</span>
                  <span className="cd__radar-rating" style={{ background: ratingColor(p.ratings?.overall), color: ratingTextColor(p.ratings?.overall) }}>
                    {Number(p.ratings?.overall ?? 0).toFixed(1)}
                  </span>
                </div>
                <PlayerRadar player={p} teamPlayers={seasonRoster as any[]} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roster */}
      <section className="cd__panel reveal" id="sec-roster">
        <div className="cd__panel-header">
          <h2 className="cd__panel-title">
            Состав{seasonRoster.length ? ` (${seasonRoster.length})` : ''}
          </h2>
          <span className="cd__panel-sub">
            {seasonRoster.length
              ? (seasonMatchCount > 0 ? `за сезон · ${seasonMatchCount} матч.` : 'за сезон')
              : 'нет загруженных разборов'}
          </span>
        </div>
        {(() => {
          // Состав без кнопок-фильтров: показываем как заявку — по линиям
          // (вратари → защита → полузащита → нападение), внутри линии лучшие
          // по рейтингу сверху. Порядок осмысленный сам по себе, сортировки не нужны.
          const all = seasonRoster;
          const LINES: { id: string; label: string }[] = [
            { id: 'gk',  label: 'Вратари' },
            { id: 'def', label: 'Защита' },
            { id: 'mid', label: 'Полузащита' },
            { id: 'fwd', label: 'Нападение' },
            { id: 'unknown', label: 'Без позиции' },
          ];
          const byLine = (id: string) => all
            .filter((p) => posGroup(p.position) === id)
            .sort((a, b) => {
              const ra = Number(a.ratings?.overall ?? 0); const rb = Number(b.ratings?.overall ?? 0);
              if (rb !== ra) return rb - ra;
              return Number(a.number ?? 99) - Number(b.number ?? 99);
            });

          const renderPlayer = (p: AnyObj) => {
            const r = Number(p.ratings?.overall ?? 0);
            const mins = Number(p.minutes ?? 0);
            const gp = Number(p.matches ?? 0);
            const load = gp > 0
              ? `${gp} матч.${mins > 0 ? ` · ${mins}'` : ''}`
              : (mins > 0 ? `${mins}'` : 'не выходил');
            return (
              <div
                key={p.playerId}
                className={`cd__player${r > 0 ? ' cd__player--rated' : ''}`}
                style={r > 0 ? ({ '--rt-col': ratingColor(r) } as React.CSSProperties) : undefined}
                onClick={() => navigate(`/players/${p.playerId}`)}
              >
                <div className="cd__player-photo">
                  <PlayerPhoto player={p} size={44} />
                </div>
                <div className="cd__player-num">{p.number ?? '—'}</div>
                <div className="cd__player-info">
                  <div className="cd__player-name">{p.fullName}</div>
                  <div className="cd__player-meta">
                    {p.position || 'игрок'}{` · ${load}`}
                  </div>
                </div>
                {r > 0 && (
                  <div className="cd__player-rating" style={{ background: ratingColor(r), color: ratingTextColor(r) }}>
                    {r.toFixed(1)}
                  </div>
                )}
              </div>
            );
          };

          const nonEmpty = LINES
            .map((line) => ({ ...line, players: byLine(line.id) }))
            .filter((g) => g.players.length > 0);
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
                      <span className="cd__line-count">{g.players.length}</span>
                    </div>
                  )}
                  <div className="cd__roster">
                    {g.players.map(renderPlayer)}
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
  forward: 'Вперёд', sideways: 'Поперечные',
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
  recoveriesAndTackling: 'Возвраты и отборы', rebounds: 'Подборы',
  inFirstThird: 'В 1-й трети', inSecondThird: 'В средней', inThirdThird: 'В фин. трети',
  // duels
  duel: 'Выиграно дуэлей', aerialDuel: 'Выиграно воздушных', totalDuels: 'Всего дуэлей',
  aerialDuels: 'Воздушные дуэли',
  // pressing
  pressing: 'Прессинг', counterpressing: 'Контр-прессинг',
  averagePpda: 'Сред. PPDA',
  // positioning
  clearance: 'Выносы', blockedShot: 'Блок-удары', positionPlay: 'Поз. игра',
  fouls: 'Фолы', yellowCard: 'Жёлтые', redCard: 'Красные', shotsAgainst: 'Удары по воротам',
  interceptions: 'Перехваты',
  // setPieces
  corner: 'Угловые', corners: 'Угловые', freeKick: 'Штрафные', freeKicks: 'Штрафные',
  freeKickShot: 'Штр. с ударом', penalty: 'Пенальти', throwing: 'Ауты', throwIns: 'Ауты',
  offsides: 'Офсайды', penaltyWithShot: 'Пенальти с ударом',
};

function fieldLabel(k: string): string {
  if (FIELD_RU[k]) return FIELD_RU[k];
  // camelCase → "Camel case"
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
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
  // Полоса величины относительно максимума в карточке — чтобы блок «считывался»
  // взглядом, а не был серой колонкой чисел. Проценты (suffix '%') — по 100.
  const max = entries.reduce((m, e) => Math.max(m, e.suffix === '%' ? 100 : e.val), 0) || 1;
  return (
    <div className="cd__agg-card">
      <div className="cd__agg-title">{title}</div>
      {entries.map(({ k, label, val, suffix }) => {
        const pct = Math.max(7, Math.round(((suffix === '%' ? val : val) / max) * 100));
        return (
          <div key={k} className="cd__agg-row">
            <div className="cd__agg-row-head">
              <span className="cd__agg-key">{label}</span>
              <span className="cd__agg-val">{val.toLocaleString('ru-RU')}{suffix}</span>
            </div>
            <span className="cd__agg-bar" aria-hidden><span className="cd__agg-bar-fill" style={{ width: `${pct}%` }} /></span>
          </div>
        );
      })}
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
