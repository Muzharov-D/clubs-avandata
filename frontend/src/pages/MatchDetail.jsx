import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchPlayers, fetchMatches } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import FormationField from '../components/FormationField';
import MatchTimeline from '../components/MatchTimeline';
import StatCompareBar from '../components/StatCompareBar';
import DonutComparisonCard from '../components/DonutComparisonCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import RatingCard from '../components/RatingCard';
import SoccerFieldImageMap from '../components/SoccerFieldImageMap';
import { shieldFor } from '../utils/legirus';
import { shortNameFromPlayer } from '../utils/players';
import './MatchDetail.css';

const SECTION_MAPS = [
  { id: 'shooting',              title: 'Удары' },
  { id: 'setPieces',             title: 'Стандарты' },
  { id: 'passes',                title: 'Передачи' },
  { id: 'attacks',               title: 'Атаки' },
  { id: 'recoveriesAndTackling', title: 'Отборы и возвраты' },
  { id: 'duels',                 title: 'Единоборства' },
  { id: 'pressing',              title: 'Прессинг' },
  { id: 'positioning',           title: 'Оборона' },
];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

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
  // Только реально играшие с положительным рейтингом — иначе MotM = бенч с 0.0
  const eligible = match.players.filter((p) => Number(p.ratings?.overall ?? 0) > 0);
  if (!eligible.length) return null;
  return eligible.sort(
    (a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0)
  )[0];
}

// Безопасный рендер строки счёта/процента с fallback на «—»
function fmtNumOrDash(v, suffix = '') {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${v}${suffix}`;
}

function topByMetric(players, getter, n = 3) {
  return [...players]
    .map((p) => ({ player: p, value: num(getter(p)) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .filter((r) => r.value > 0);
}

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const { selectedTeamId } = useTeam();
  const matchRes = useApi(() => fetchMatch(matchId), [matchId]);
  const playersRes = useApi(() => fetchPlayers(selectedTeamId), [selectedTeamId]);

  const match = matchRes.data;
  const players = playersRes.data?.players || [];

  const matchTitle = match
    ? `${match.home || ''} ${match.scoreHome ?? ''}:${match.scoreAway ?? ''} ${match.away || ''}`.trim()
    : 'Матч';
  useDocumentTitle(matchTitle);
  const home = match?.teamSummaryStats?.home || {};
  const away = match?.teamSummaryStats?.away || {};
  const ta = match?.teamAggregates || {};
  const motm = bestPlayer(match);
  const teamRatings = match?.teamAvgRatings || {};

  const attackingActions = useMemo(() => {
    const pos = ta.attacks?.positional?.withShot || 0;
    const cnt = ta.attacks?.counterattacks?.withShot || 0;
    return pos + cnt;
  }, [ta]);

  const topGoals = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.attack4?.goal), [match]);
  const topAssists = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.attack1?.assist), [match]);
  const topTackles = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.defence1?.tackle), [match]);

  // Накопленный сезонный средний — догружаем все матчи для сравнения с текущим
  const matchesListRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const seasonMatches = matchesListRes.data?.matches || [];
  const seasonIdsKey = useMemo(() => seasonMatches.map((m) => m.id).join('|'), [seasonMatches]);
  const [allMatchData, setAllMatchData] = useState([]);

  useEffect(() => {
    if (!seasonMatches.length) { setAllMatchData([]); return; }
    let cancelled = false;
    // Defer на 1.5 сек — даём первой отрисовке (счёт/формация/командные ratings)
    // завершиться без блокировки сеть N параллельными fetch'ами. Без этого
    // браузер на /matches/:id «висел» 13+ сек пока грузил все матчи сезона
    // для блока «vs средний по сезону» — а его юзер видит только при скролле.
    const handle = setTimeout(() => {
      Promise.all(seasonMatches.map((m) => fetchMatch(m.id).catch(() => null)))
        .then((results) => {
          if (cancelled) return;
          setAllMatchData(results.filter(Boolean));
        });
    }, 1500);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonIdsKey]);

  const seasonAvg = useMemo(() => {
    if (!allMatchData.length) return null;
    const acc = { overall: [], fitness: [], attack: [], defence: [] };
    allMatchData.forEach((m) => {
      const t = m?.teamAvgRatings || {};
      Object.keys(acc).forEach((k) => {
        const v = num(t[k]);
        if (v != null && !isNaN(v)) acc[k].push(v);
      });
    });
    const out = {};
    Object.entries(acc).forEach(([k, arr]) => {
      out[k] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    });
    out._games = allMatchData.length;
    return out;
  }, [allMatchData]);

  if (matchRes.error) return <div className="empty-state">Ошибка: {matchRes.error.message}</div>;
  if (!match) return <div className="empty-state">Загрузка матча…</div>;

  return (
    <div className="page match-detail">
      <div className="match-detail__topbar">
        <button className="match-detail__back" onClick={() => navigate('/matches')}>← К матчам</button>
      </div>

      {/* HERO: счёт и команды */}
      <div className="match-detail__hero">
        <div className="match-detail__team match-detail__team--home">
          <img
            src={shieldFor(match.homeTeam?.name, match.homeTeam?.shield)}
            alt={match.homeTeam?.name || ''}
            className="match-detail__team-logo-img"
            onError={(e) => {
              e.currentTarget.outerHTML = `<div class="match-detail__team-logo team-logo--home">${(match.homeTeam?.name || '?').charAt(0)}</div>`;
            }}
          />
          <div className="match-detail__team-name">{match.homeTeam?.name}</div>
        </div>
        <div className="match-detail__score-block">
          <div className="match-detail__date">{fmtDate(match.date)}</div>
          <div className="match-detail__score">
            {match.score?.home}:{match.score?.away}
          </div>
          <div className="match-detail__status">МАТЧ РАЗОБРАН</div>
        </div>
        <div className="match-detail__team match-detail__team--away">
          {match.awayTeam?.shield ? (
            <img
              src={match.awayTeam.shield}
              alt={match.awayTeam.name || ''}
              className="match-detail__team-logo-img"
              onError={(e) => {
                // Fallback на инициал клуба если щит не загрузился
                e.currentTarget.outerHTML = `<div class="match-detail__team-logo team-logo--away">${(match.awayTeam?.name || '?').charAt(0)}</div>`;
              }}
            />
          ) : (
            <div className="match-detail__team-logo team-logo--away">
              {(match.awayTeam?.name || '?').charAt(0)}
            </div>
          )}
          <div className="match-detail__team-name">{match.awayTeam?.name}</div>
        </div>
      </div>

      {/* 4 рейтинга команды */}
      <div className="match-detail__ratings">
        <RatingCard label="Общий" value={teamRatings.overall} />
        <RatingCard label="Фитнес" value={teamRatings.fitness} />
        <RatingCard label="Атака" value={teamRatings.attack} />
        <RatingCard label="Защита" value={teamRatings.defence} />
      </div>

      {/* Хроника матча (best-effort из PDF) — рендерится только если events найдены */}
      <MatchTimeline events={match.events || []} />

      <div className="match-detail__grid">
        <div className="match-detail__left">
          <FormationField
            formation={match.formation}
            players={players}
            ourTeamName={match.homeTeam?.name}
            imageSrc={match.formationImage}
            imageFullSrc={match.formationImageFull}
          />
          <div className="card guest-placeholder">
            <div className="page-section-title">Состав соперника</div>
            <div className="guest-placeholder__msg">
              {match.guestTeamPlaceholder ||
                'SportVisor разбор содержит per-player статистику только нашей команды. Состав соперника появится, когда соперник загрузит свой отчёт.'}
            </div>
          </div>
        </div>

        <div className="match-detail__center">
          <div className="card">
            <div className="page-section-title">Командная статистика</div>
            <div className="match-detail__stats">
              <StatCompareBar label="Владение"          home={fmtNumOrDash(home.possessionPct, '%')} away={fmtNumOrDash(away.possessionPct, '%')} />
              <StatCompareBar label="Удары"             home={fmtNumOrDash(home.shots?.total)}       away={fmtNumOrDash(away.shots?.total)} />
              <StatCompareBar label="Удары в створ"     home={fmtNumOrDash(home.shots?.onTarget)}    away={fmtNumOrDash(away.shots?.onTarget)} />
              <StatCompareBar label="xG"                home={fmtNumOrDash(home.expectedGoals)}      away={fmtNumOrDash(away.expectedGoals)} />
              <StatCompareBar label="Передачи"          home={fmtNumOrDash(home.passes?.total)}      away={fmtNumOrDash(away.passes?.total)} />
              <StatCompareBar label="Точные передачи"   home={fmtNumOrDash(home.passes?.successful)} away={fmtNumOrDash(away.passes?.successful)} />
              <StatCompareBar label="Удары со штрафных" home={fmtNumOrDash(home.freeKickShots)}      away={fmtNumOrDash(away.freeKickShots)} />
              <StatCompareBar label="Угловые"           home={fmtNumOrDash(home.corners?.total)}     away={fmtNumOrDash(away.corners?.total)} />
              <StatCompareBar label="Нарушения"         home={fmtNumOrDash(home.fouls)}              away={fmtNumOrDash(away.fouls)} />
              <StatCompareBar label="Жёлтые карточки"   home={fmtNumOrDash(home.yellowCards)}        away={fmtNumOrDash(away.yellowCards)} />
              <StatCompareBar label="Красные карточки"  home={fmtNumOrDash(home.redCards)}           away={fmtNumOrDash(away.redCards)} />
              <StatCompareBar label="Офсайды"           home={fmtNumOrDash(home.offsides)}           away={fmtNumOrDash(away.offsides)} />
            </div>
          </div>

          <div className="card">
            <div className="page-section-title">Лидеры матча — наша команда</div>
            <div className="match-detail__breakdowns">
              <PlayerBreakdown title="Голы" rows={topGoals} navigate={navigate} />
              <PlayerBreakdown title="Ассисты" rows={topAssists} navigate={navigate} />
              <PlayerBreakdown title="Отборы" rows={topTackles} navigate={navigate} />
            </div>
          </div>

          <div className="match-detail__donuts">
            <DonutComparisonCard label="Удары в створ" home={home.shots?.onTarget} away={away.shots?.onTarget} />
            <DonutComparisonCard label="Прогрессивные передачи" home={ta.passes?.progressive} away={null} />
            <DonutComparisonCard label="Отборы" home={ta.duels?.totalDuels} away={null} />
            <DonutComparisonCard label="Перехваты" home={ta.positioning?.interceptions} away={null} />
            <DonutComparisonCard label="Атаки с ударом" home={attackingActions} away={null} />
            <DonutComparisonCard label="Кроссы" home={ta.passes?.crosses} away={null} />
          </div>
        </div>

        <div className="match-detail__right">
          {motm && motm.ratings?.overall != null && (
            <div className="card best-player" onClick={() => navigate(`/players/${motm.id}`)}>
              <div className="page-section-title">Игрок матча</div>
              <div className="best-player__body">
                <PlayerPhoto player={motm} size={80} />
                <div className="best-player__info">
                  <div className="best-player__name">{shortNameFromPlayer(motm)}</div>
                  <div className="best-player__pos">№{motm.number} · {motm.positionFull}</div>
                </div>
                <RatingPill value={motm.ratings?.overall} size="xl" />
              </div>
            </div>
          )}
          {seasonAvg && (
            <div className="card mvs">
              <div className="page-section-title">
                Этот матч vs средний по сезону
                {seasonAvg._games > 1 && (
                  <span className="mvs__hint"> · по {seasonAvg._games} матчам</span>
                )}
              </div>
              <div className="mvs__list">
                {[
                  ['Общий', 'overall'],
                  ['Фитнес', 'fitness'],
                  ['Атака', 'attack'],
                  ['Защита', 'defence'],
                ].map(([label, key]) => {
                  const m = num(teamRatings[key]);
                  const s = seasonAvg[key];
                  if (m == null || s == null) return null;
                  const d = m - s;
                  const dir = d > 0.1 ? 'up' : d < -0.1 ? 'down' : 'flat';
                  const arrow = d > 0.1 ? '▲' : d < -0.1 ? '▼' : '=';
                  return (
                    <div className="mvs-row" key={key}>
                      <div className="mvs-row__label">{label}</div>
                      <div className="mvs-row__pair">
                        <span className="mvs-row__cap">матч</span>
                        <span className="mvs-row__val mvs-row__val--match">{m.toFixed(1)}</span>
                      </div>
                      <div className="mvs-row__pair">
                        <span className="mvs-row__cap">сезон</span>
                        <span className="mvs-row__val mvs-row__val--season">{s.toFixed(1)}</span>
                      </div>
                      <div className={`mvs-row__delta mvs-row__delta--${dir}`}>
                        <span className="mvs-row__delta-arrow">{arrow}</span>
                        <span>{d > 0 ? '+' : ''}{d.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card top-scorers">
            <div className="page-section-title">Топ по рейтингу</div>
            {(match.players || [])
              .filter((p) => p.ratings?.overall != null)
              .sort((a, b) => b.ratings.overall - a.ratings.overall)
              .slice(0, 5)
              .map((p) => (
                <div key={p.id} className="top-scorers__row" onClick={() => navigate(`/players/${p.id}`)}>
                  <PlayerPhoto player={p} size={36} />
                  <div className="top-scorers__info">
                    <div className="top-scorers__name">{shortNameFromPlayer(p)}</div>
                    <div className="top-scorers__pos">{p.positionFull}</div>
                  </div>
                  <RatingPill value={p.ratings.overall} size="sm" />
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Командные карты — рендерим всю секцию только если хотя бы 1 карта есть */}
      {SECTION_MAPS.some((sec) => ta[sec.id]?.mapImage) && (
      <div className="card match-detail__maps-card">
        <div className="page-section-title">Командные тепловые карты</div>
        <div className="match-detail__maps-grid">
          {SECTION_MAPS.map((sec) => {
            const map = ta[sec.id]?.mapImage;
            if (!map) return null;
            return (
              <div className="match-detail__map-cell" key={sec.id}>
                <SoccerFieldImageMap src={map} title={sec.title} height={220} />
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

function PlayerBreakdown({ title, rows, navigate }) {
  return (
    <div className="player-breakdown">
      <div className="player-breakdown__title">{title}</div>
      {rows.length === 0 && <div className="empty-state">Нет данных</div>}
      {rows.map(({ player, value }, i) => (
        <div
          key={player.id}
          className="player-breakdown__row"
          onClick={() => navigate(`/players/${player.id}`)}
        >
          <span className="player-breakdown__rank">{i + 1}</span>
          <PlayerPhoto player={player} size={36} />
          <div className="player-breakdown__info">
            <div className="player-breakdown__name">{shortNameFromPlayer(player)}</div>
            <div className="player-breakdown__pos">№{player.number} · {player.position}</div>
          </div>
          <span className="player-breakdown__val">{value}</span>
        </div>
      ))}
    </div>
  );
}
