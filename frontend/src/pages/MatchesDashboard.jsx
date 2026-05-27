import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatches, fetchTeams, fetchMatch } from '../services/api';
import MatchList from '../components/MatchList';
import PdfUploadDialog from '../components/PdfUploadDialog';
import PlayerPhoto from '../components/PlayerPhoto';
import { ratingColor, ratingTextColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { useTournament } from '../contexts/TournamentContext';
import './MatchesDashboard.css';

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
  const navigate = useNavigate();
  const { user, canSeePlayer } = useAuth();
  const { selectedTeamId, selectedTeam } = useTeam();
  const canUpload = user?.role === 'head_coach' || user?.role === 'team_coach';
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
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
  const goalsFor = matches.reduce((s, m) =>
    s + (m.homeTeamId === ourTeam?.id ? m.score?.home || 0 : m.score?.away || 0), 0);
  const goalsAgainst = matches.reduce((s, m) =>
    s + (m.homeTeamId === ourTeam?.id ? m.score?.away || 0 : m.score?.home || 0), 0);
  const cleanSheets = matches.filter((m) =>
    (m.homeTeamId === ourTeam?.id ? m.score?.away : m.score?.home) === 0).length;
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
        if (r == null || isNaN(r)) return;
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

  return (
    <div className="page matches-dashboard">
      {/* Season hero */}
      <div className="matches-dashboard__hero">
        <div className="matches-dashboard__hero-text">
          <div className="matches-dashboard__hero-eyebrow">Сезон</div>
          <h1 className="matches-dashboard__hero-title">{season}</h1>
          <div className="matches-dashboard__hero-sub">
            ФК {ourTeam?.name?.toUpperCase() || 'Легирус 2010'} · {totalGames} матч{totalGames === 1 ? '' : 'ей'} разобран{totalGames === 1 ? '' : 'о'}
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
          {/* Сводка последнего матча */}
          {lastMatch && (
            <div className="card matches-dashboard__last">
              <div className="page-section-title">Сводка последнего матча</div>
              <div className="matches-dashboard__last-body">
                <div className="matches-dashboard__last-date">{fmtDate(lastMatch.date)}</div>
                <div className="matches-dashboard__last-teams">
                  <div className="matches-dashboard__last-team">
                    <img src="/assets/logos/legirus.png" alt="" />
                    <span>{lastMatch.homeTeam?.name?.replace(/ 20\d{2}$/, '') || 'Легирус'}</span>
                  </div>
                  <div className="matches-dashboard__last-score">
                    <span className={lastMatch.score?.home > lastMatch.score?.away ? 'win' : ''}>{lastMatch.score?.home}</span>
                    <span className="sep">:</span>
                    <span className={lastMatch.score?.away > lastMatch.score?.home ? 'win' : ''}>{lastMatch.score?.away}</span>
                  </div>
                  <div className="matches-dashboard__last-team away">
                    <span>{lastMatch.awayTeam?.name?.replace(/ 20\d{2}$/, '') || 'Соперник'}</span>
                    <div className="matches-dashboard__last-placeholder">?</div>
                  </div>
                </div>
                <button
                  className="matches-dashboard__last-btn"
                  onClick={() => navigate(`/matches/${lastMatch.id}`)}
                >
                  Открыть детали матча →
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="page-section-title">Информация по сезону</div>
            <div className="matches-dashboard__season">
              <SeasonStat label="Всего матчей"            value={totalGames} />
              <SeasonStat label="Забитые голы"            value={goalsFor} />
              <SeasonStat label="Пропущенные голы"        value={goalsAgainst} />
              <SeasonStat label="Среднее голов за игру"   value={avgGoals} />
              <SeasonStat label="Сухие матчи"             value={cleanSheets} />
              <SeasonStat label="Игроков на поле"         value={11} />
            </div>
          </div>

          {/* Топ-5 по рейтингу с трендами — свайп-карусель */}
          {topRated.length > 0 && (
            <div className="card">
              <div className="page-section-title">
                Топ-5 по рейтингу сезона{' '}
                <span className="topr-hint">— листайте →</span>
              </div>
              <div className="topr-carousel">
                {topRated.map((row, i) => {
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
                  return (
                    <div
                      key={player.id}
                      className={'topr-card' + (unlocked ? '' : ' topr-card--locked')}
                      onClick={() => { if (unlocked) navigate(`/players/${player.id}`); }}
                      title={unlocked ? '' : 'Доступно только тренеру'}
                    >
                      <div className="topr-card__rank">#{i + 1}</div>
                      <PlayerPhoto player={player} size={64} />
                      <div className="topr-card__name">{shortNameFromPlayer(player)}</div>
                      <div className="topr-card__pos">
                        №{player.number} · {player.positionFull || player.position}
                      </div>
                      <div
                        className="topr-card__rating"
                        style={{
                          background: ratingColor(avgAll),
                          color: ratingTextColor(avgAll),
                        }}
                      >
                        {avgAll.toFixed(1)}
                      </div>
                      <div className="topr-card__rating-label">
                        средний за {games} {games === 1 ? 'матч' : games < 5 ? 'матча' : 'матчей'}
                      </div>
                      <div className={`topr-trend ${trendClass}`}>
                        <span className="topr-trend__arrow">{trendArrow}</span>
                        <span className="topr-trend__value">
                          {delta == null
                            ? 'дебют'
                            : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="topr-card__last">
                        Последний матч: <b>{last.toFixed(1)}</b>
                      </div>
                    </div>
                  );
                })}
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

function SeasonStat({ label, value }) {
  return (
    <div className="season-stat">
      <div className="season-stat__value">{value}</div>
      <div className="season-stat__label">{label}</div>
    </div>
  );
}
