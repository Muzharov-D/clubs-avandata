import { useNavigate, NavLink } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchMatches } from '../services/api';
import LeaderMetricCard from '../components/LeaderMetricCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { shortNameFromPlayer } from '../utils/players';
import './PlayersLeaders.css';
import './PlayersRating.css';

function maxBy(items, getter) {
  let best = null;
  let bestVal = -Infinity;
  for (const it of items) {
    const v = getter(it);
    const num = typeof v === 'object' ? Number(v?.value) : Number(v);
    if (!isNaN(num) && num > bestVal) {
      bestVal = num; best = { item: it, value: num };
    }
  }
  return best;
}

export default function PlayersLeaders() {
  const navigate = useNavigate();
  const { canSeePlayer } = useAuth();
  const { selectedTeamId } = useTeam();
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const lastMatchId = matchesRes.data?.matches?.[0]?.id;
  const matchRes = useApi(() => (lastMatchId ? fetchMatch(lastMatchId) : Promise.resolve(null)), [lastMatchId]);

  const match = matchRes.data;
  const all = match?.players || [];

  if (matchesRes.loading || matchRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!match) return <div className="empty-state">Нет данных</div>;

  const overall = [...all].sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0))[0];

  const leaders = [
    ['Удары в створ',         maxBy(all, (p) => p.stats?.attack4?.shot)],
    ['Голы',                  maxBy(all, (p) => p.stats?.attack4?.goal)],
    ['Голевые передачи',      maxBy(all, (p) => p.stats?.attack1?.assist)],
    ['Отборы',                maxBy(all, (p) => p.stats?.defence1?.tackle)],
    ['Перехваты',             maxBy(all, (p) => p.stats?.defence1?.interception)],
    ['Прогрессивные передачи', maxBy(all, (p) => p.stats?.attack2?.progressivePass)],
    ['Прессинг',              maxBy(all, (p) => p.stats?.defence2?.pressing)],
    ['Сейвы',                 maxBy(all, (p) => p.stats?.defence3?.save)],
    ['Дистанция, м',          maxBy(all, (p) => p.stats?.fitness?.totalDistance)],
    ['Спринты',               maxBy(all, (p) => p.stats?.fitness?.sprintsCount)],
  ];

  return (
    <div className="page players-leaders">
      <div className="players-rating__subnav">
        <NavLink to="/players" end className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Лидеры</NavLink>
        <NavLink to="/players/rating" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Рейтинг</NavLink>
      </div>

      {overall && (
        <div
          className={'card players-leaders__top' + (canSeePlayer(overall.id) ? '' : ' players-leaders__top--locked')}
          onClick={() => { if (canSeePlayer(overall.id)) navigate(`/players/${overall.id}`); }}
          title={canSeePlayer(overall.id) ? '' : 'Доступно только тренеру'}
        >
          <div className="players-leaders__top-label">Рейтинг игрока</div>
          <div className="players-leaders__top-body">
            <PlayerPhoto player={overall} size={120} />
            <div className="players-leaders__top-info">
              <div className="players-leaders__top-name">{shortNameFromPlayer(overall)}</div>
              <div className="players-leaders__top-pos">№{overall.number} · {overall.positionFull}</div>
              <div className="players-leaders__top-stats">
                <span>Удары: <b>{overall.stats?.attack4?.shot?.value ?? '—'}</b></span>
                <span>Отборы: <b>{overall.stats?.defence1?.tackle?.value ?? '—'}</b></span>
                <span>Голы: <b>{overall.stats?.attack4?.goal?.value ?? '—'}</b></span>
              </div>
            </div>
            <div className="players-leaders__top-rating">
              <RatingPill value={overall.ratings?.overall} size="xl" />
              <div className="players-leaders__top-rating-100">
                {overall.ratings?.overall ? Math.round(overall.ratings.overall * 10) : '—'}/100
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="players-leaders__grid">
        {leaders.map(([label, lead], i) => (
          <LeaderMetricCard
            key={i}
            label={label}
            player={lead?.item}
            value={lead?.value}
            locked={lead?.item ? !canSeePlayer(lead.item.id) : false}
          />
        ))}
      </div>
    </div>
  );
}
