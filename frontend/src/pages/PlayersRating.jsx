import { useMemo, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchMatches } from '../services/api';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { ratingColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import './PlayersRating.css';

// Definition of metrics shown in the chip-selector.
// `path` is a function that receives the player and returns a numeric (or null) value.
const METRICS = [
  { id: 'overall',      label: 'Общий рейтинг',     unit: '',   digits: 1, path: (p) => p.ratings?.overall, primary: true },
  { id: 'fitness',      label: 'Фитнес рейтинг',    unit: '',   digits: 1, path: (p) => p.ratings?.fitness, primary: true },
  { id: 'attack',       label: 'Атака рейтинг',     unit: '',   digits: 1, path: (p) => p.ratings?.attack,  primary: true },
  { id: 'defence',      label: 'Защита рейтинг',    unit: '',   digits: 1, path: (p) => p.ratings?.defence, primary: true },
  { id: 'goal',         label: 'Голы',              unit: '',   digits: 0, path: (p) => num(p.stats?.attack4?.goal) },
  { id: 'shotOnTarget', label: 'Удары в створ',     unit: '',   digits: 0, path: (p) => num(p.stats?.attack4?.shot) },
  { id: 'assist',       label: 'Голевые передачи',  unit: '',   digits: 0, path: (p) => num(p.stats?.attack1?.assist) },
  { id: 'keyPass',      label: 'Ключевые пасы',     unit: '',   digits: 0, path: (p) => num(p.stats?.attack1?.keyPass) },
  { id: 'xG',           label: 'xG',                unit: '',   digits: 2, path: (p) => num(p.stats?.attack1?.xG) },
  { id: 'progPass',     label: 'Прогрессивные пасы', unit: '',  digits: 0, path: (p) => num(p.stats?.attack2?.progressivePass) },
  { id: 'finalThird',   label: 'В финальную треть', unit: '',   digits: 0, path: (p) => num(p.stats?.attack2?.passToFinalThird) },
  { id: 'cross',        label: 'Кроссы',            unit: '',   digits: 0, path: (p) => num(p.stats?.attack2?.cross) },
  { id: 'tackle',       label: 'Отборы',            unit: '',   digits: 0, path: (p) => num(p.stats?.defence1?.tackle) },
  { id: 'interception', label: 'Перехваты',         unit: '',   digits: 0, path: (p) => num(p.stats?.defence1?.interception) },
  { id: 'pressing',     label: 'Прессинг',          unit: '',   digits: 0, path: (p) => num(p.stats?.defence2?.pressing) },
  { id: 'counterpress', label: 'Контрпрессинг',     unit: '',   digits: 0, path: (p) => num(p.stats?.defence2?.counterpressing) },
  { id: 'save',         label: 'Сейвы',             unit: '',   digits: 0, path: (p) => num(p.stats?.defence3?.save) },
  { id: 'totalDist',    label: 'Дистанция',         unit: ' м', digits: 0, path: (p) => num(p.stats?.fitness?.totalDistance) },
  { id: 'sprints',      label: 'Спринты',           unit: '',   digits: 0, path: (p) => num(p.stats?.fitness?.sprintsCount) },
  { id: 'sprintDist',   label: 'Спринтерская дист.', unit: ' м', digits: 0, path: (p) => num(p.stats?.fitness?.sprintDistance) },
  { id: 'minutes',      label: 'Минуты на поле',    unit: '',   digits: 0, path: (p) => p.minutes },
];

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

function fmt(value, digits, unit) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  let s;
  if (Number.isInteger(value) && digits === 0) s = value.toString();
  else s = Number(value).toFixed(digits);
  return s + (unit || '');
}

export default function PlayersRating() {
  const navigate = useNavigate();
  const { canSeePlayer } = useAuth();
  const { selectedTeamId } = useTeam();
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const lastMatchId = matchesRes.data?.matches?.[0]?.id;
  const matchRes = useApi(() => (lastMatchId ? fetchMatch(lastMatchId) : Promise.resolve(null)), [lastMatchId]);

  const [metricId, setMetricId] = useState('overall');
  const [direction, setDirection] = useState('desc'); // 'desc' | 'asc'
  const [posFilter, setPosFilter] = useState('all');

  const match = matchRes.data;
  const players = match?.players || [];

  const positions = useMemo(() => {
    const set = new Set();
    players.forEach((p) => p.position && set.add(p.position));
    return ['all', ...Array.from(set)];
  }, [players]);

  const metric = METRICS.find((m) => m.id === metricId) || METRICS[0];

  const rows = useMemo(() => {
    const filtered = posFilter === 'all'
      ? [...players]
      : players.filter((p) => p.position === posFilter);
    return filtered
      .map((p) => ({ player: p, value: metric.path(p) }))
      .sort((a, b) => {
        const av = a.value === null || a.value === undefined || isNaN(a.value) ? -Infinity : Number(a.value);
        const bv = b.value === null || b.value === undefined || isNaN(b.value) ? -Infinity : Number(b.value);
        return direction === 'desc' ? bv - av : av - bv;
      });
  }, [players, metric, direction, posFilter]);

  const isPrimary = !!metric.primary;
  const max = useMemo(() => {
    let m = 0;
    rows.forEach((r) => { if (typeof r.value === 'number' && !isNaN(r.value) && r.value > m) m = r.value; });
    return m;
  }, [rows]);

  if (matchesRes.loading || matchRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!match) return <div className="empty-state">Нет данных</div>;

  return (
    <div className="page players-rating">
      <div className="players-rating__subnav">
        <NavLink to="/players" end className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Лидеры</NavLink>
        <NavLink to="/players/rating" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Рейтинг</NavLink>
      </div>

      <div className="card players-rating__controls">
        <div className="players-rating__controls-row">
          <div className="players-rating__controls-label">Метрика</div>
          <div className="players-rating__chips">
            {METRICS.map((m) => (
              <button
                key={m.id}
                className={'chip' + (m.id === metricId ? ' chip--active' : '') + (m.primary ? ' chip--primary' : '')}
                onClick={() => setMetricId(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="players-rating__controls-row">
          <div className="players-rating__controls-label">Позиция</div>
          <div className="players-rating__chips">
            {positions.map((pos) => (
              <button
                key={pos}
                className={'chip' + (pos === posFilter ? ' chip--active' : '')}
                onClick={() => setPosFilter(pos)}
              >
                {pos === 'all' ? 'Все' : pos}
              </button>
            ))}
          </div>
          <button
            className="players-rating__direction"
            onClick={() => setDirection((d) => (d === 'desc' ? 'asc' : 'desc'))}
            title="Изменить направление сортировки"
          >
            {direction === 'desc' ? '↓ По убыванию' : '↑ По возрастанию'}
          </button>
        </div>
      </div>

      <div className="card players-rating__table">
        <div className="players-rating__head">
          <span className="col-rank">№</span>
          <span className="col-photo"></span>
          <span className="col-name">Игрок</span>
          <span className="col-pos">Позиция</span>
          <span className="col-minutes">Мин.</span>
          <span className="col-overall">Общий</span>
          <span className="col-metric">{metric.label}</span>
        </div>
        <div className="players-rating__body">
          {rows.map(({ player, value }, i) => {
            const unlocked = canSeePlayer(player.id);
            return (
            <div
              key={player.id}
              className={'players-rating__row' + (unlocked ? '' : ' players-rating__row--locked')}
              onClick={() => { if (unlocked) navigate(`/players/${player.id}`); }}
              role={unlocked ? 'button' : undefined}
              tabIndex={unlocked ? 0 : undefined}
              title={unlocked ? '' : 'Доступно только тренеру'}
            >
              <span className="col-rank">{i + 1}</span>
              <span className="col-photo">
                <PlayerPhoto player={player} size={36} />
              </span>
              <span className="col-name">
                <div className="players-rating__name">{shortNameFromPlayer(player)}</div>
                <div className="players-rating__num">№{player.number}</div>
              </span>
              <span className="col-pos">{player.positionFull || player.position || '—'}</span>
              <span className="col-minutes">{player.minutes ?? '—'}</span>
              <span className="col-overall">
                <RatingPill value={player.ratings?.overall} size="sm" />
              </span>
              <span className="col-metric">
                <div className="players-rating__metric-bar">
                  <div
                    className="players-rating__metric-fill"
                    style={{
                      width: max > 0 && typeof value === 'number' && !isNaN(value)
                        ? `${Math.max(0, Math.min(100, (value / max) * 100))}%`
                        : '0%',
                      background: isPrimary ? ratingColor(value) : 'linear-gradient(90deg, #2c66c7, #22d3ee)',
                    }}
                  />
                </div>
                <span className="players-rating__metric-value">
                  {fmt(value, metric.digits, metric.unit)}
                </span>
              </span>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
