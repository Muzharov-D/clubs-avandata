import { useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchTeams, fetchMatches, fetchMatch } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import MatchList from '../components/MatchList';
import RatingCard from '../components/RatingCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { shortNameFromPlayer } from '../utils/players';
import { ratingColor } from '../utils/colors';
import { leadersByLine } from '../utils/lines';
import { useNavigate } from 'react-router-dom';
import './ClubOverview.css';

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

function bestPlayer(match) {
  if (!match?.players?.length) return null;
  return [...match.players].sort(
    (a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0)
  )[0];
}

function topN(players, n) {
  return [...players]
    .sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0))
    .slice(0, n);
}

function teamSplitSum(match, key, half) {
  // half: 'first' | 'second' | 'match'
  if (!match?.players) return 0;
  let s = 0;
  for (const p of match.players) {
    const row = p.splits?.[key];
    if (!row) continue;
    const v = num(row[half]);
    if (typeof v === 'number' && !isNaN(v)) s += v;
  }
  return Math.round(s);
}

export default function ClubOverview() {
  const navigate = useNavigate();
  const { selectedTeamId, selectedTeam } = useTeam();
  const teamsRes = useApi(fetchTeams, []);
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const lastMatchId = matchesRes.data?.matches?.[0]?.id;
  const matchRes = useApi(() => (lastMatchId ? fetchMatch(lastMatchId) : Promise.resolve(null)), [lastMatchId]);

  const teams = teamsRes.data?.teams || [];
  const ourTeam = selectedTeam || teams.find((t) => t.id === selectedTeamId) || teams.find((t) => t.isOurTeam);
  const matches = matchesRes.data?.matches || [];
  const match = matchRes.data;
  const home = match?.teamSummaryStats?.home || {};
  const away = match?.teamSummaryStats?.away || {};
  const ratings = match?.teamAvgRatings || {};
  const motm = bestPlayer(match);
  const players = match?.players || [];

  const top5 = useMemo(() => topN(players, 5), [players]);

  const lineLeaders = useMemo(() => leadersByLine(players), [players]);

  const halfMetrics = useMemo(() => {
    if (!match) return [];
    return [
      { label: 'Удары',         key: 'Shot' },
      { label: 'Передачи',      key: 'Pass' },
      { label: 'Отборы',        key: 'Tackle' },
      { label: 'Перехваты',     key: 'Interception' },
      { label: 'Прессинг',      key: 'Pressing' },
      { label: 'Голы',          key: 'Goal' },
    ].map((m) => ({
      ...m,
      first: teamSplitSum(match, m.key, 'first'),
      second: teamSplitSum(match, m.key, 'second'),
    }));
  }, [match]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="page club-overview">
      <div className="club-overview__grid">
        <aside className="club-overview__col-left">
          <MatchList matches={matches} teams={teams} activeMatchId={lastMatchId} />
        </aside>

        <section className="club-overview__col-right">
          {/* HERO: Информация о команде + Сводка матча */}
          <div className="club-overview__hero">
            <div className="card team-info">
              <div className="team-info__head">
                <div className="team-info__title">Информация о команде</div>
              </div>
              <div className="team-info__body">
                <div className="team-info__logo">
                  <img src="/assets/logos/legirus.png" alt={ourTeam?.name || 'ФК Легирус'} />
                </div>
                <div className="team-info__data">
                  <div className="team-info__name">ФК {(ourTeam?.name || 'Легирус 2010').toUpperCase()}</div>
                  <div className="team-info__rating">
                    Средний рейтинг команды:&nbsp;
                    <span className="team-info__rating-val">
                      {ratings.overall ? Math.round(ratings.overall * 100) : '—'}
                    </span>
                  </div>
                  <div className="team-info__coach">
                    Главный тренер: <span>{ourTeam?.headCoach || '—'}</span>
                  </div>
                  <div className="team-info__coach">
                    Игроков в составе: <span>{players.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {match && (
              <div className="card match-summary">
                <div className="team-info__title">Последний матч</div>
                <div className="match-summary__date">{formatDate(match.date)}</div>
                <div className="match-summary__teams">
                  <div className="match-summary__team match-summary__team--home">
                    <img src="/assets/logos/legirus.png" alt="" />
                    <span>{match.homeTeam?.name?.replace(/ 20\d{2}$/, '') || 'Легирус'}</span>
                  </div>
                  <div className="match-summary__score">
                    <span className={match.score?.home > match.score?.away ? 'win' : ''}>{match.score?.home ?? '—'}</span>
                    <span className="match-summary__score-sep">:</span>
                    <span className={match.score?.away > match.score?.home ? 'win' : ''}>{match.score?.away ?? '—'}</span>
                  </div>
                  <div className="match-summary__team match-summary__team--away">
                    <span>{match.awayTeam?.name?.replace(/ 20\d{2}$/, '') || 'Соперник'}</span>
                    <div className="match-summary__placeholder">?</div>
                  </div>
                </div>
                <button className="match-summary__open" onClick={() => navigate(`/matches/${match.id}`)}>
                  Открыть матч →
                </button>
              </div>
            )}
          </div>

          {/* Лучший игрок — рендерим только если у него реально есть рейтинг.
              Без проверки bestPlayer() возвращал первого игрока даже когда у
              всех rating=null → карточка показывала «—/100». */}
          {motm && motm.ratings?.overall != null && (
            <div className="card best-player" onClick={() => navigate(`/players/${motm.id}`)}>
              <div className="best-player__head">Лучший игрок матча</div>
              <div className="best-player__body">
                <PlayerPhoto player={motm} size={84} />
                <div className="best-player__info">
                  <div className="best-player__name">{shortNameFromPlayer(motm)}</div>
                  <div className="best-player__pos">№{motm.number} · {motm.positionFull}</div>
                  <div className="best-player__stats">
                    <span>Голы: <b>{num(motm.stats?.attack4?.goal) ?? 0}</b></span>
                    <span>Ассисты: <b>{num(motm.stats?.attack1?.assist) ?? 0}</b></span>
                    <span>Перехваты: <b>{num(motm.stats?.defence1?.interception) ?? 0}</b></span>
                    <span>Минуты: <b>{motm.minutes ?? 0}</b></span>
                  </div>
                </div>
                <div className="best-player__rating">
                  <RatingPill value={motm.ratings?.overall} size="xl" />
                </div>
              </div>
            </div>
          )}

          {/* Top-5 рейтинг */}
          {top5.length > 0 && (
            <div>
              <div className="page-section-title">Топ-5 игроков матча</div>
              <div className="club-overview__top5">
                {top5.map((p, i) => (
                  <div
                    key={p.id}
                    className="top5-card"
                    onClick={() => navigate(`/players/${p.id}`)}
                  >
                    <div className="top5-card__rank">{i + 1}</div>
                    <PlayerPhoto player={p} size={56} />
                    <div className="top5-card__info">
                      <div className="top5-card__name">{p.lastName} {p.firstName?.[0]}.</div>
                      <div className="top5-card__pos">№{p.number} · {p.position}</div>
                    </div>
                    <RatingPill value={p.ratings?.overall} size="md" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Сводные рейтинги */}
          <div>
            <div className="page-section-title">Сводные рейтинги команды</div>
            <div className="club-overview__ratings">
              <RatingCard label="Общий" value={ratings.overall} />
              <RatingCard label="Фитнес" value={ratings.fitness} />
              <RatingCard label="Атака" value={ratings.attack} />
              <RatingCard label="Защита" value={ratings.defence} />
            </div>
          </div>

          {/* Ключевые показатели — расширенные */}
          <div>
            <div className="page-section-title">Ключевые показатели матча</div>
            <div className="club-overview__kpi">
              <KpiCell label="Забитые"        value={match?.score?.home} accent="gold" />
              <KpiCell label="Пропущенные"    value={match?.score?.away} />
              <KpiCell label="Владение, %"    value={home.possessionPct} />
              <KpiCell label="Удары всего"    value={home.shots?.total} />
              <KpiCell label="Удары в створ"  value={home.shots?.onTarget} />
              <KpiCell label="xG"             value={home.expectedGoals} />
              <KpiCell label="Передачи"       value={home.passes?.total} />
              <KpiCell label="% точных"       value={home.passes?.accuracy} suffix="%" />
              <KpiCell label="Угловые"        value={home.corners?.total} />
              <KpiCell label="Штрафные удары" value={home.freeKickShots} />
              <KpiCell label="Нарушения"      value={home.fouls} />
              <KpiCell label="Офсайды"        value={home.offsides} />
            </div>
          </div>

          {/* Команда по таймам */}
          {halfMetrics.length > 0 && (
            <div className="card">
              <div className="page-section-title">1 тайм vs 2 тайм — командно</div>
              <div className="halftime-team">
                {halfMetrics.map((m) => {
                  const max = Math.max(m.first, m.second, 1);
                  return (
                    <div className="halftime-team__row" key={m.key}>
                      <span className="halftime-team__label">{m.label}</span>
                      <div className="halftime-team__bars">
                        <div className="halftime-team__bar halftime-team__bar--first">
                          <div className="halftime-team__bar-fill" style={{ width: `${(m.first / max) * 100}%` }} />
                          <span className="halftime-team__bar-val">{m.first}</span>
                        </div>
                        <div className="halftime-team__bar halftime-team__bar--second">
                          <div className="halftime-team__bar-fill" style={{ width: `${(m.second / max) * 100}%` }} />
                          <span className="halftime-team__bar-val">{m.second}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="halftime-team__legend">
                  <span><i className="dot dot--first" /> 1 тайм</span>
                  <span><i className="dot dot--second" /> 2 тайм</span>
                </div>
              </div>
            </div>
          )}

          {/* Лидеры по линиям */}
          {lineLeaders.length > 0 && (
            <div className="card">
              <div className="page-section-title">Лидеры по линиям</div>
              <div className="club-overview__lines">
                {lineLeaders.map(({ group, leader, count, avg: a }) => (
                  <div
                    className="line-card"
                    key={group.id}
                    onClick={() => navigate(`/players/${leader.id}`)}
                  >
                    <div className="line-card__group">{group.label}</div>
                    <div className="line-card__count">{count} игр.</div>
                    <div className="line-card__player">
                      <PlayerPhoto player={leader} size={44} />
                      <div>
                        <div className="line-card__name">{leader.lastName} {leader.firstName?.[0]}.</div>
                        <div className="line-card__pos">№{leader.number}</div>
                      </div>
                    </div>
                    <div className="line-card__metrics">
                      <div>
                        <div className="line-card__metric-label">Рейтинг</div>
                        <div className="line-card__metric-val" style={{ color: ratingColor(leader.ratings?.overall) }}>
                          {leader.ratings?.overall?.toFixed(1) ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="line-card__metric-label">Ср. линии</div>
                        <div className="line-card__metric-val line-card__metric-val--muted">
                          {a ? a.toFixed(1) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Атака / Оборона */}
          <div className="club-overview__ao">
            <div className="card">
              <div className="page-section-title">Атака</div>
              <AoBars items={[
                ['Удары в створ',              num(home.shots?.onTarget),                       home.shots?.total],
                ['xG',                         num(home.expectedGoals),                          5],
                ['Прогрессивные передачи',     num(match?.teamAggregates?.passes?.progressive),  100],
                ['Передачи в финальную треть', num(match?.teamAggregates?.passes?.toFinalThird), 80],
                ['Угловые',                    num(home.corners?.total),                         10],
                ['Кроссы',                     num(match?.teamAggregates?.passes?.crosses),      30],
              ]} colorFn={() => '#22d3ee'} />
            </div>
            <div className="card">
              <div className="page-section-title">Оборона</div>
              <AoBars items={[
                ['Перехваты',     num(match?.teamAggregates?.positioning?.interceptions),         50],
                ['Отборы',        num(match?.teamAggregates?.duels?.totalDuels),                  60],
                ['Прессинг',      num(match?.teamAggregates?.pressing?.pressing),                 80],
                ['Контрпрессинг', num(match?.teamAggregates?.pressing?.counterpressing),          40],
                ['Сейвы',         num(match?.teamAggregates?.positioning?.shotsAgainst) || 0,     10],
                ['Заблокированные удары', num(match?.teamAggregates?.positioning?.clearance),     20],
              ]} colorFn={() => '#7cb342'} />
            </div>
          </div>
        </section>
      </div>

      {(teamsRes.loading || matchesRes.loading || matchRes.loading) && (
        <div className="empty-state">Загрузка данных…</div>
      )}
    </div>
  );
}

function KpiCell({ label, value, accent, suffix }) {
  const display = value === null || value === undefined ? '—' : `${value}${suffix || ''}`;
  return (
    <div className={`kpi-cell ${accent ? `kpi-cell--${accent}` : ''}`}>
      <div className="kpi-cell__value">{display}</div>
      <div className="kpi-cell__label">{label}</div>
    </div>
  );
}

function AoBars({ items, colorFn }) {
  const max = items.reduce((m, [, v, suggestedMax]) => {
    const n = typeof v === 'number' && !isNaN(v) ? v : 0;
    return Math.max(m, n, suggestedMax || 0);
  }, 0) || 1;
  return (
    <div className="ao-bars">
      {items.map(([label, val], i) => {
        const num = typeof val === 'number' && !isNaN(val) ? val : 0;
        const pct = (num / max) * 100;
        return (
          <div className="ao-bars__row" key={i}>
            <div className="ao-bars__label">{label}</div>
            <div className="ao-bars__track">
              <div className="ao-bars__fill" style={{ width: `${pct}%`, background: colorFn() }} />
            </div>
            <div className="ao-bars__val">
              {val === null || val === undefined ? '—' : val}
            </div>
          </div>
        );
      })}
    </div>
  );
}
