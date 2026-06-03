import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatches, fetchTeams, fetchMatch, fetchStandings } from '../services/api';
import MatchList from '../components/MatchList';
import PdfUploadDialog from '../components/PdfUploadDialog';
import PlayerPhoto from '../components/PlayerPhoto';
import { ratingColor, ratingTextColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import { isOurClub, shieldFor, normalizeTeamName } from '../utils/legirus';
import { trimAgeSuffix, cleanTeamName } from '../utils/teamName';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { useTournament } from '../contexts/TournamentContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AnimatedNumber, SplitText, Reveal, StaggerList, KineticCard } from '../components/motion';
import './MatchesDashboard.css';
import './matchesKinetic.css';

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MatchesDashboard() {
  useDocumentTitle('Матчи');
  const navigate = useNavigate();
  const { user, canSeePlayer } = useAuth();
  const { selectedTeamId, selectedTeam } = useTeam();
  const canUpload = user?.role === 'head_coach' || user?.role === 'team_coach';
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  // Эмблемы соперников из турнирной таблицы (в объекте матча щита нет) — чтобы
  // в сводке был логотип, а не буква названия. Матчинг по имени со срезом возраста.
  const ageGroup = (selectedTeamId || '').match(/(?:19|20)\d{2}/)?.[0] || null;
  const standingsRes = useApi(() => (ageGroup ? fetchStandings(ageGroup) : Promise.resolve(null)), [ageGroup]);
  const teamKey = (n) => normalizeTeamName(trimAgeSuffix(n));
  const shieldByName = useMemo(() => {
    const map = {};
    for (const r of standingsRes.data?.table || []) {
      const key = teamKey(r.team);
      if (key && r.shield) map[key] = r.shield;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsRes.data]);
  const resolveShield = (name) => shieldByName[teamKey(name)] || null;
  const teamsRes = useApi(fetchTeams, []);
  const [uploadOpen, setUploadOpen] = useState(false);

  const matches = matchesRes.data?.matches || [];
  const teams = teamsRes.data?.teams || [];
  const ourTeam = selectedTeam || teams.find((t) => t.id === selectedTeamId) || teams.find((t) => t.isOurTeam);
  const lastMatchEntry = matches[0] || null;
  const lastMatchRes = useApi(
    () => (lastMatchEntry?.id ? fetchMatch(lastMatchEntry.id) : Promise.resolve(null)),
    [lastMatchEntry?.id]
  );
  const lastMatch = lastMatchRes.data;

  const totalGames = matches.length;
  // «Мы дома?» — приоритет по ID (бэк заполняет home_team_id/away_team_id при upload
  // + backfill, задача #4): наша сторона та, чей team-id == teamId матча. Для legacy-строк
  // без id'шек (ещё не забэкфиллены) — tenant-aware fallback по нормализованному имени.
  // Старая эвристика home.includes(ourName) переворачивала голы при непопадании имени.
  const isHomeOurs = (m) => {
    if (m.homeTeamId || m.awayTeamId) return m.homeTeamId === m.teamId;
    return isOurClub(m.home);
  };
  const goalsFor = matches.reduce((s, m) =>
    s + (isHomeOurs(m) ? Number(m.scoreHome || 0) : Number(m.scoreAway || 0)), 0);
  const goalsAgainst = matches.reduce((s, m) =>
    s + (isHomeOurs(m) ? Number(m.scoreAway || 0) : Number(m.scoreHome || 0)), 0);
  const cleanSheets = matches.filter((m) =>
    Number(isHomeOurs(m) ? m.scoreAway : m.scoreHome) === 0).length;
  const avgGoals = totalGames ? (goalsFor / totalGames).toFixed(2) : '—';

  // Сезон — показываем как «год окончания» (2025-2026 → 2026)
  const seasonRaw = matches[0]?.season || '2026';
  const season = (() => {
    const m = String(seasonRaw).match(/(\d{4})\s*[-–—]\s*(\d{4})/);
    return m ? m[2] : seasonRaw;
  })();

  // Турнир / Кубок — глобальный контекст. Переключатель живёт на /club.
  // Здесь только читаем и фильтруем список матчей.
  const { tournament } = useTournament();
  const filteredMatches = useMemo(
    () => matches.filter((m) => (m.tournament || 'league') === tournament),
    [matches, tournament]
  );

  // Накопленная сезонная статистика — догружаем ВСЕ матчи (детально), считаем средний рейтинг
  // по каждому игроку и тренд (последний матч vs среднее по предыдущим).
  const [allMatches, setAllMatches] = useState([]);
  const [allMatchesLoading, setAllMatchesLoading] = useState(false);
  const matchIdsKey = useMemo(() => matches.map((m) => m.id).join('|'), [matches]);

  useEffect(() => {
    if (!matches.length) { setAllMatches([]); return; }
    let cancelled = false;
    setAllMatchesLoading(true);
    Promise.all(matches.map((m) => fetchMatch(m.id).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        setAllMatches(results.filter(Boolean));
      })
      .finally(() => { if (!cancelled) setAllMatchesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIdsKey]);

  const topRated = useMemo(() => {
    if (!allMatches.length) return [];
    const sorted = [...allMatches].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    const byPlayer = new Map();
    sorted.forEach((m) => {
      (m.players || []).forEach((p) => {
        const r = num(p.ratings?.overall);
        // 0 = «бенч / не оценён», не учитываем в накопленном среднем
        // (иначе игрок 1 матч 8.0 + 4 бенча 0 → средний 1.6 — нонсенс)
        if (r == null || isNaN(r) || r <= 0) return;
        const e = byPlayer.get(p.id) || { player: p, ratings: [] };
        e.player = p; // обновляем до самого свежего объекта
        e.ratings.push(r);
        byPlayer.set(p.id, e);
      });
    });
    const list = [];
    byPlayer.forEach(({ player, ratings }) => {
      if (!ratings.length) return;
      const last = ratings[ratings.length - 1];
      const avgAll = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      const prevSlice = ratings.slice(0, -1);
      const avgPrev = prevSlice.length
        ? prevSlice.reduce((a, b) => a + b, 0) / prevSlice.length
        : null;
      const delta = avgPrev != null ? last - avgPrev : null;
      list.push({
        player,
        last,
        avgAll,
        avgPrev,
        delta,
        games: ratings.length,
      });
    });
    return list
      .sort((a, b) => b.avgAll - a.avgAll)
      .slice(0, 5);
  }, [allMatches]);

  const homeScore = lastMatch?.score?.home;
  const awayScore = lastMatch?.score?.away;

  return (
    <div className="page matches-dashboard kinetic">
      {/* [1] ГЕРОЙ — счёт последнего матча, full-width, над заголовком сезона */}
      {lastMatch && (
        <Reveal variant="slide-up" duration={0.7} delay={0} className="matches-dashboard__hero-kinetic">
          <KineticCard glow className="card matches-dashboard__last matches-dashboard__last--hero">
            <div className="page-section-title">Сводка последнего матча</div>
            <div className="matches-dashboard__last-body">
              <div className="matches-dashboard__last-date">{fmtDate(lastMatch.date)}</div>
              <div className="matches-dashboard__last-teams matches-dashboard__last-teams--hero">
                <div className="matches-dashboard__last-team">
                  <LastTeamCrest name={lastMatch.homeTeam?.name} shield={resolveShield(lastMatch.homeTeam?.name)} hero />
                  <span>{cleanTeamName(lastMatch.homeTeam?.name) || 'Команда'}</span>
                </div>
                <div className="matches-dashboard__last-score matches-dashboard__last-score--hero">
                  <span className={homeScore != null && homeScore > awayScore ? 'win' : (homeScore != null && homeScore < awayScore ? 'loss' : '')}>
                    {homeScore != null
                      ? <AnimatedNumber value={Number(homeScore)} format={(v) => String(Math.round(v))} stiffness={120} damping={25} />
                      : '—'}
                  </span>
                  <span className="sep">:</span>
                  <span className={awayScore != null && awayScore > homeScore ? 'win' : (awayScore != null && awayScore < homeScore ? 'loss' : '')}>
                    {awayScore != null
                      ? <AnimatedNumber value={Number(awayScore)} format={(v) => String(Math.round(v))} stiffness={120} damping={25} />
                      : '—'}
                  </span>
                </div>
                <div className="matches-dashboard__last-team away">
                  <span>{cleanTeamName(lastMatch.awayTeam?.name) || 'Соперник'}</span>
                  <LastTeamCrest name={lastMatch.awayTeam?.name} shield={resolveShield(lastMatch.awayTeam?.name)} hero />
                </div>
              </div>
              <button
                className="matches-dashboard__last-btn"
                onClick={() => navigate(`/matches/${lastMatch.id}`)}
              >
                Открыть детали матча →
              </button>
            </div>
          </KineticCard>
        </Reveal>
      )}

      {/* Заголовок сезона */}
      <div className="matches-dashboard__hero">
        <div className="matches-dashboard__hero-text">
          <div className="matches-dashboard__hero-eyebrow">Сезон</div>
          <h1 className="matches-dashboard__hero-title"><SplitText text={String(season)} /></h1>
          <div className="matches-dashboard__hero-sub">
            {(ourTeam?.name || 'Команда').toUpperCase()} · {totalGames} матч{totalGames === 1 ? '' : 'ей'} разобран{totalGames === 1 ? '' : 'о'}
            {tournament === 'cup' && <> · Кубок</>}
          </div>
        </div>
        {canUpload && (
          <button className="matches-dashboard__upload" onClick={() => setUploadOpen(true)}>
            + Загрузить отчёт Sportvisor
          </button>
        )}
      </div>

      <div className="matches-dashboard__grid">
        <aside className="matches-dashboard__col-left">
          <MatchList matches={filteredMatches} teams={teams} />
        </aside>

        <section className="matches-dashboard__col-right">
          {/* [2] Сезонная статистика — иерархия: ведущая метрика + каскад вторичных */}
          <Reveal variant="slide-up" duration={0.55} delay={0.2}>
            <div className="card">
              <div className="page-section-title">Информация по сезону</div>
              <div className="matches-dashboard__season">
                <SeasonStat label="Всего матчей" value={totalGames} primary />
                <StaggerList speed="tight" className="matches-dashboard__season-secondary">
                  <SeasonStat label="Забитые голы"          value={goalsFor} />
                  <SeasonStat label="Пропущенные голы"      value={goalsAgainst} />
                  <SeasonStat label="Среднее голов за игру" value={avgGoals} decimals={2} />
                  <SeasonStat label="Сухие матчи"           value={cleanSheets} />
                </StaggerList>
              </div>
            </div>
          </Reveal>

          {/* [3] Топ-5 — podium-reveal: #1 чемпион крупно, #2–5 каскадом */}
          {topRated.length > 0 && (
            <div className="card">
              <div className="page-section-title">Топ-5 по рейтингу сезона</div>
              <div className="topr-table">
                {/* #1 — чемпион: входит первым (slide-right), крупнее, border-glow */}
                <Reveal variant="slide-right" duration={0.6} delay={0.4}>
                  <TopRatedRow
                    row={topRated[0]}
                    index={0}
                    champion
                    canSeePlayer={canSeePlayer}
                    navigate={navigate}
                  />
                </Reveal>
                {/* #2–5 — каскад после чемпиона */}
                {topRated.length > 1 && (
                  <StaggerList speed="normal" className="topr-row--cascade">
                    {topRated.slice(1).map((row, i) => (
                      <TopRatedRow
                        key={row.player.id}
                        row={row}
                        index={i + 1}
                        canSeePlayer={canSeePlayer}
                        navigate={navigate}
                      />
                    ))}
                  </StaggerList>
                )}
              </div>
              {allMatchesLoading && (
                <div className="topr-loading">Считаем накопленный рейтинг…</div>
              )}
            </div>
          )}

          {canUpload && (
            <div className="card">
              <div className="page-section-title">Подсказка</div>
              <div className="matches-dashboard__hint">
                Нажмите кнопку <b>«Загрузить отчёт Sportvisor»</b>, чтобы добавить новый матч. Парсер автоматически извлечёт командные показатели, индивидуальные метрики (105 на игрока) и тематические карты.
              </div>
            </div>
          )}
        </section>
      </div>

      {uploadOpen && (
        <PdfUploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={() => window.location.reload()}
        />
      )}
    </div>
  );
}

// Эмблема команды в сводке матча: через shieldFor (наш клуб → лого, соперник →
// инициал, т.к. внешнего щита в объекте матча нет). Единая точка эмблем проекта.
function LastTeamCrest({ name, shield = null, hero = false }) {
  const [errored, setErrored] = useState(false);
  const src = shieldFor(name || '', shield || '');
  if (!src || errored) {
    return (
      <span className={`matches-dashboard__last-placeholder${hero ? ' matches-dashboard__last-placeholder--hero' : ''}`} aria-hidden>
        {(name || '?').trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }
  return <img className={`matches-dashboard__last-crest${hero ? ' matches-dashboard__last-crest--hero' : ''}`} src={src} alt="" onError={() => setErrored(true)} />;
}

function SeasonStat({ label, value, decimals = 0, primary = false }) {
  const n = typeof value === 'number' ? value : Number(value);
  const isNum = value !== '—' && value != null && Number.isFinite(n);
  return (
    <div className={'season-stat' + (primary ? ' season-stat--primary' : '')}>
      <div className="season-stat__value">
        {isNum ? <AnimatedNumber value={n} format={(v) => v.toFixed(decimals)} /> : value}
      </div>
      <div className="season-stat__label">{label}</div>
    </div>
  );
}

// Строка топ-5 по рейтингу. champion=#1 (крупнее, border-glow, KineticCard glow);
// остальные — обычная строка с микро-лифтом. Логика тренда/рейтинга едина.
function TopRatedRow({ row, index, champion = false, canSeePlayer, navigate }) {
  const { player, last, avgAll, delta, games } = row;
  const unlocked = canSeePlayer(player.id);
  const trendClass =
    delta == null ? 'topr-trend--neutral'
    : delta > 0.05 ? 'topr-trend--up'
    : delta < -0.05 ? 'topr-trend--down'
    : 'topr-trend--flat';
  const trendArrow =
    delta == null ? '·'
    : delta > 0.05 ? '▲'
    : delta < -0.05 ? '▼'
    : '=';
  const rowClass =
    'topr-row'
    + (champion ? ' topr-row--champion' : '')
    + (unlocked ? '' : ' topr-row--locked');
  return (
    <KineticCard
      glow={champion}
      className={rowClass}
      onClick={() => { if (unlocked) navigate(`/players/${player.id}`); }}
      ariaLabel={unlocked ? `Профиль игрока ${shortNameFromPlayer(player)}` : 'Доступно только тренеру'}
    >
      <div className="topr-row__rank">#{index + 1}</div>
      <PlayerPhoto player={player} size={champion ? 56 : 40} />
      <div className="topr-row__info">
        <div className="topr-row__name">{shortNameFromPlayer(player)}</div>
        <div className="topr-row__pos">
          №{player.number} · {player.positionFull || player.position}
        </div>
      </div>
      <div className={`topr-trend ${trendClass}`}>
        <span className="topr-trend__arrow">{trendArrow}</span>
        <span className="topr-trend__value">
          {delta == null
            ? 'дебют'
            : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
        </span>
      </div>
      <div className="topr-row__ratingwrap">
        <div
          className="topr-row__rating"
          style={{ background: ratingColor(avgAll), color: ratingTextColor(avgAll) }}
        >
          <AnimatedNumber
            value={avgAll}
            format={(v) => v.toFixed(1)}
            stiffness={100}
            damping={30}
          />
        </div>
        <div className="topr-row__sub">
          за {games} {games === 1 ? 'матч' : games < 5 ? 'матча' : 'матчей'} · посл. {last.toFixed(1)}
        </div>
      </div>
    </KineticCard>
  );
}
