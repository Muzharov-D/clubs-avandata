import { useMemo } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchPlayersSeason } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import LeaderMetricCard from '../components/LeaderMetricCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { AnimatedNumber, SplitText } from '../components/motion';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { shortNameFromPlayer } from '../utils/players';
import './PlayersLeaders.css';
import './playersKinetic.css';
import './PlayersRating.css';

// Лидер сезона по метрике: максимум суммарного значения среди игравших.
// Ноль/отрицательное — не лидер (артефакт бенча), карточка покажет пустое.
function maxBy(items, getter) {
  let best = null;
  let bestVal = -Infinity;
  for (const it of items) {
    const v = Number(getter(it));
    if (!Number.isNaN(v) && v > bestVal) { bestVal = v; best = { item: it, value: v }; }
  }
  if (!best || best.value <= 0) return null;
  return best;
}

function Subnav() {
  return (
    <div className="players-rating__subnav">
      <NavLink to="/players" end className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Лидеры</NavLink>
      <NavLink to="/players/rating" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Рейтинг</NavLink>
      <NavLink to="/players/compare" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Сравнение</NavLink>
    </div>
  );
}

export default function PlayersLeaders() {
  useDocumentTitle('Лидеры сезона');
  const navigate = useNavigate();
  const { canSeePlayer } = useAuth();
  const { selectedTeamId } = useTeam();

  // СЕЗОН, не последний матч: кто лучший по сумме за сезон (был источником
  // «последний матч» — нонсенс для «лидеров команды»).
  const seasonRes = useApi(
    () => (selectedTeamId ? fetchPlayersSeason(selectedTeamId) : Promise.resolve({ players: [] })),
    [selectedTeamId],
  );
  const all = seasonRes.data?.players || [];

  const overall = useMemo(() => {
    const rated = all.filter((p) => Number(p.avgOverall ?? 0) > 0 && Number(p.matches ?? 0) >= 1);
    return [...rated].sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0))[0] || null;
  }, [all]);

  const leaders = useMemo(() => ([
    ['Голы',                maxBy(all, (p) => p.goals)],
    ['Голевые передачи',    maxBy(all, (p) => p.assists)],
    ['Удары',               maxBy(all, (p) => p.shots)],
    ['Ключевые передачи',   maxBy(all, (p) => p.keyPass)],
    ['Обводки',             maxBy(all, (p) => p.dribble)],
    ['Отборы',              maxBy(all, (p) => p.tackle)],
    ['Перехваты',           maxBy(all, (p) => p.interception)],
    ['Возвраты',            maxBy(all, (p) => p.recovery)],
    ['Прессинг',            maxBy(all, (p) => p.pressing)],
    ['Дистанция, м',        maxBy(all, (p) => p.distance)],
  ]), [all]);

  if (seasonRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!all.length) {
    return (
      <div className="page players-leaders kinetic">
        <Subnav />
        <div className="empty-state">Сезонная статистика появится после разбора матчей.</div>
      </div>
    );
  }

  return (
    <div className="page players-leaders kinetic">
      <Subnav />

      <div className="players-leaders__scope" style={{ color: 'var(--text-faint)', fontSize: 13, margin: '4px 2px 14px' }}>
        Лидеры по сумме за сезон
      </div>

      {overall && (
        <div
          className={'card players-leaders__top' + (canSeePlayer(overall.id) ? '' : ' players-leaders__top--locked')}
          onClick={() => { if (canSeePlayer(overall.id)) navigate(`/players/${overall.id}`); }}
          title={canSeePlayer(overall.id) ? '' : 'Доступно только тренеру'}
        >
          <div className="players-leaders__top-label">Лучший по среднему рейтингу сезона</div>
          <div className="players-leaders__top-body">
            <PlayerPhoto player={overall} size={120} />
            <div className="players-leaders__top-info">
              <div className="players-leaders__top-name"><SplitText text={shortNameFromPlayer(overall) || overall.fullName || ''} /></div>
              <div className="players-leaders__top-pos">№{overall.number} · {overall.position || ''}</div>
              <div className="players-leaders__top-stats">
                <span>Матчи: <b>{overall.matches ?? '—'}</b></span>
                <span>Голы: <b>{overall.goals ?? 0}</b></span>
                <span>Пасы: <b>{overall.assists ?? 0}</b></span>
              </div>
            </div>
            <div className="players-leaders__top-rating">
              <RatingPill value={overall.avgOverall} size="xl" />
              <div className="players-leaders__top-rating-100">
                {overall.avgOverall ? (<><AnimatedNumber value={Math.round(overall.avgOverall * 10)} />/100</>) : '—'}
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
