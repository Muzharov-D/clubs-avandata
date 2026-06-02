import { useMemo, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchMatches } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { ratingColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import { percentileRank, percentileColor } from '../utils/percentile';
import { downloadCsv } from '../utils/exportCsv';
import './PlayersRating.css';
import './playersKinetic.css';

// Группы метрик: Общее + 3 модуля. Каждый модуль возглавляет его рейтинг (primary).
// Оценка (0–10, цветная) — только у primary-метрик (4 модуля). Остальные — счёт.
const GROUPS = [
  { id: 'general', label: 'Общее' },
  { id: 'attack',  label: 'Атака' },
  { id: 'defence', label: 'Защита' },
  { id: 'fitness', label: 'Физика' },
];

// `path` принимает игрока → число (или null). Поля сверены с legirusAdapter
// (attack1–5 / defence1–3 / fitness). primary=true → оценка модуля (цветная).
const METRICS = [
  // ── Общее ──
  { id: 'overall', group: 'general', label: 'Общий рейтинг',  unit: '', digits: 1, primary: true, path: (p) => p.ratings?.overall },
  { id: 'minutes', group: 'general', label: 'Минуты на поле', unit: '', digits: 0, path: (p) => p.minutes },

  // ── Атака (возглавляет рейтинг Атака) ──
  { id: 'attack',      group: 'attack', label: 'Атака рейтинг',          unit: '', digits: 1, primary: true, path: (p) => p.ratings?.attack },
  { id: 'goal',        group: 'attack', label: 'Голы',                   unit: '', digits: 0, path: (p) => num(p.stats?.attack4?.goal) },
  { id: 'goalActions', group: 'attack', label: 'Голевые действия',       unit: '', digits: 0, path: (p) => num(p.stats?.attack1?.goalActions) },
  { id: 'shot',        group: 'attack', label: 'Удары',                  unit: '', digits: 0, path: (p) => num(p.stats?.attack4?.shot) },
  { id: 'byHead',      group: 'attack', label: 'Удары головой',          unit: '', digits: 0, path: (p) => num(p.stats?.attack5?.byHead) },
  { id: 'assist',      group: 'attack', label: 'Голевые передачи',       unit: '', digits: 0, path: (p) => num(p.stats?.attack1?.assist) },
  { id: 'keyPass',     group: 'attack', label: 'Ключевые пасы',          unit: '', digits: 0, path: (p) => num(p.stats?.attack1?.keyPass) },
  { id: 'pass',        group: 'attack', label: 'Передачи',               unit: '', digits: 0, path: (p) => num(p.stats?.attack2?.pass) },
  { id: 'progPass',    group: 'attack', label: 'Прогрессивные пасы',     unit: '', digits: 0, path: (p) => num(p.stats?.attack2?.progressivePass) },
  { id: 'finalThird',  group: 'attack', label: 'Пасы в финальную треть', unit: '', digits: 0, path: (p) => num(p.stats?.attack2?.passToFinalThird) },
  { id: 'intoPenArea', group: 'attack', label: 'Пасы в штрафную',        unit: '', digits: 0, path: (p) => num(p.stats?.attack2?.intoPenArea) },
  { id: 'cross',       group: 'attack', label: 'Кроссы',                 unit: '', digits: 0, path: (p) => num(p.stats?.attack2?.cross) },
  { id: 'dribble',     group: 'attack', label: 'Обводки',                unit: '', digits: 0, path: (p) => num(p.stats?.attack4?.dribble) },
  { id: 'touchesBox',  group: 'attack', label: 'Касания в штрафной',     unit: '', digits: 0, path: (p) => num(p.stats?.attack3?.touchesInPenArea) },
  { id: 'entriesBox',  group: 'attack', label: 'Входы в штрафную',       unit: '', digits: 0, path: (p) => num(p.stats?.attack5?.entriesInBox) },
  { id: 'passFwd',     group: 'attack', label: 'Передачи вперёд',        unit: '', digits: 0, path: (p) => num(p.stats?.attack3?.passForward) },
  { id: 'lostBall',    group: 'attack', label: 'Потери мяча',            unit: '', digits: 0, path: (p) => num(p.stats?.attack4?.lostBall) },

  // ── Защита (возглавляет рейтинг Защита) ──
  { id: 'defence',       group: 'defence', label: 'Защита рейтинг',         unit: '', digits: 1, primary: true, path: (p) => p.ratings?.defence },
  { id: 'tackle',        group: 'defence', label: 'Отборы',                 unit: '', digits: 0, path: (p) => num(p.stats?.defence1?.tackle) },
  { id: 'slidingTackle', group: 'defence', label: 'Подкаты',                unit: '', digits: 0, path: (p) => num(p.stats?.defence1?.slidingTackles) },
  { id: 'interception',  group: 'defence', label: 'Перехваты',              unit: '', digits: 0, path: (p) => num(p.stats?.defence1?.interception) },
  { id: 'recovery',      group: 'defence', label: 'Возвраты мяча',          unit: '', digits: 0, path: (p) => num(p.stats?.defence1?.recovery) },
  { id: 'clearance',     group: 'defence', label: 'Выносы',                 unit: '', digits: 0, path: (p) => num(p.stats?.defence1?.clearance) },
  { id: 'blockedShot',   group: 'defence', label: 'Блокированные удары',    unit: '', digits: 0, path: (p) => num(p.stats?.defence1?.blockedShot) },
  { id: 'duel',          group: 'defence', label: 'Единоборства',           unit: '', digits: 0, path: (p) => num(p.stats?.defence2?.duel) },
  { id: 'aerialDuel',    group: 'defence', label: 'Верховые единоборства',  unit: '', digits: 0, path: (p) => num(p.stats?.defence2?.aerialDuel) },
  { id: 'pressing',      group: 'defence', label: 'Прессинг',               unit: '', digits: 0, path: (p) => num(p.stats?.defence2?.pressing) },
  { id: 'counterpress',  group: 'defence', label: 'Контрпрессинг',          unit: '', digits: 0, path: (p) => num(p.stats?.defence2?.counterpressing) },
  { id: 'dribbleAgainst',group: 'defence', label: 'Обводки против',         unit: '', digits: 0, path: (p) => num(p.stats?.defence2?.dribbleAgainst) },
  { id: 'save',          group: 'defence', label: 'Сейвы',                  unit: '', digits: 0, path: (p) => num(p.stats?.defence3?.save) },
  { id: 'shotsAgainst',  group: 'defence', label: 'Удары по воротам',       unit: '', digits: 0, path: (p) => num(p.stats?.defence3?.shotsAgainst) },

  // ── Физика (возглавляет рейтинг физической готовности) ──
  { id: 'fitness',     group: 'fitness', label: 'Физика рейтинг',     unit: '',    digits: 1, primary: true, path: (p) => p.ratings?.fitness },
  { id: 'totalDist',   group: 'fitness', label: 'Дистанция',          unit: ' м',  digits: 0, path: (p) => num(p.stats?.fitness?.totalDistance) },
  { id: 'sprintDist',  group: 'fitness', label: 'Спринт-дистанция',   unit: ' м',  digits: 0, path: (p) => num(p.stats?.fitness?.sprintDistance) },
  { id: 'sprints',     group: 'fitness', label: 'Спринты',            unit: '',    digits: 0, path: (p) => num(p.stats?.fitness?.sprintsCount) },
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
  useDocumentTitle('Рейтинг игроков');
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

  // Перцентиль внутри состава по выбранной метрике (бенчмарк без данных лиги).
  const metricValues = useMemo(
    () => rows.map((r) => Number(r.value)).filter((v) => Number.isFinite(v)),
    [rows],
  );

  // CSV-экспорт всех метрик по всем игрокам матча (для тренерского штаба).
  const handleExport = () => {
    const columns = [
      { label: 'Игрок', get: (p) => shortNameFromPlayer(p) },
      { label: '№', get: (p) => p.number ?? '' },
      { label: 'Позиция', get: (p) => p.positionFull || p.position || '' },
      { label: 'Минуты', get: (p) => p.minutes ?? '' },
      ...METRICS.map((m) => ({ label: m.label, get: (p) => { const v = m.path(p); return v == null || isNaN(v) ? '' : Number(v); } })),
    ];
    const opp = match.awayTeam?.isOurTeam ? match.home : match.away;
    downloadCsv(`rating-${(opp || 'match').toString().slice(0, 20)}`, players, columns);
  };

  if (matchesRes.loading || matchRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!match) return <div className="empty-state">Нет данных</div>;

  return (
    <div className="page players-rating kinetic">
      <div className="players-rating__subnav">
        <NavLink to="/players" end className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Лидеры</NavLink>
        <NavLink to="/players/rating" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Рейтинг</NavLink>
        <NavLink to="/players/compare" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Сравнение</NavLink>
      </div>

      <div className="card players-rating__controls">
        <div className="players-rating__controls-row players-rating__controls-row--metrics">
          <div className="players-rating__controls-label">Метрика</div>
          <div className="players-rating__metric-groups">
            {GROUPS.map((g) => (
              <div className="players-rating__metric-group" key={g.id}>
                <div className="players-rating__group-label">{g.label}</div>
                <div className="players-rating__chips">
                  {METRICS.filter((m) => m.group === g.id).map((m) => (
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
          <button
            className="players-rating__direction"
            onClick={handleExport}
            title="Скачать все метрики в CSV (для Excel)"
          >
            ⤓ CSV
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
                      background: isPrimary
                        ? ratingColor(value)
                        : 'linear-gradient(90deg, var(--brand-secondary), var(--brand-primary))',
                    }}
                  />
                </div>
                <span className="players-rating__metric-value">
                  {fmt(value, metric.digits, metric.unit)}
                  {(() => {
                    const pr = percentileRank(metricValues, Number(value));
                    return pr != null ? (
                      <span
                        className="players-rating__pct"
                        style={{ color: percentileColor(pr) }}
                        title={`Лучше ${pr}% состава по этой метрике`}
                      >
                        П{pr}
                      </span>
                    ) : null;
                  })()}
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
