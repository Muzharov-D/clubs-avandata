import { useMemo, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchPlayersSeason } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { AnimatedNumber, Reveal } from '../components/motion';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { ratingColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import { percentileRank, percentileColor } from '../utils/percentile';
import './PlayersRating.css';
import './playersKinetic.css';

// Группы метрик: Общее + 3 модуля. Рейтинги (primary) — средние за сезон (0–10,
// цветные), остальное — суммы за сезон. ЯКОРЬ — СЕЗОН, не последний матч.
const GROUPS = [
  { id: 'general', label: 'Общее' },
  { id: 'attack',  label: 'Атака' },
  { id: 'defence', label: 'Защита' },
  { id: 'fitness', label: 'Фитнес' },
];

// Поля сезонного агрегата (fetchPlayersSeason): avg*-рейтинги + суммы действий.
const METRICS = [
  // ── Общее ──
  { id: 'overall', group: 'general', label: 'Средний рейтинг', unit: '', digits: 1, primary: true, path: (p) => p.avgOverall },
  { id: 'matches', group: 'general', label: 'Матчи',           unit: '', digits: 0, path: (p) => p.matches },
  { id: 'minutes', group: 'general', label: 'Минуты',          unit: '', digits: 0, path: (p) => p.minutes },

  // ── Атака ──
  { id: 'attack',  group: 'attack', label: 'Атака рейтинг',    unit: '', digits: 1, primary: true, path: (p) => p.avgAttack },
  { id: 'goals',   group: 'attack', label: 'Голы',             unit: '', digits: 0, path: (p) => p.goals },
  { id: 'assists', group: 'attack', label: 'Голевые передачи', unit: '', digits: 0, path: (p) => p.assists },
  { id: 'shots',   group: 'attack', label: 'Удары',            unit: '', digits: 0, path: (p) => p.shots },
  { id: 'keyPass', group: 'attack', label: 'Ключевые пасы',    unit: '', digits: 0, path: (p) => p.keyPass },
  { id: 'dribble', group: 'attack', label: 'Обводки',          unit: '', digits: 0, path: (p) => p.dribble },

  // ── Защита ──
  { id: 'defence',      group: 'defence', label: 'Защита рейтинг', unit: '', digits: 1, primary: true, path: (p) => p.avgDefence },
  { id: 'tackle',       group: 'defence', label: 'Отборы',         unit: '', digits: 0, path: (p) => p.tackle },
  { id: 'interception', group: 'defence', label: 'Перехваты',      unit: '', digits: 0, path: (p) => p.interception },
  { id: 'recovery',     group: 'defence', label: 'Возвраты мяча',  unit: '', digits: 0, path: (p) => p.recovery },
  { id: 'duel',         group: 'defence', label: 'Единоборства',   unit: '', digits: 0, path: (p) => p.duel },
  { id: 'pressing',     group: 'defence', label: 'Прессинг',       unit: '', digits: 0, path: (p) => p.pressing },

  // ── Фитнес ──
  { id: 'fitness',    group: 'fitness', label: 'Фитнес рейтинг',  unit: '',   digits: 1, primary: true, path: (p) => p.avgFitness },
  { id: 'distance',   group: 'fitness', label: 'Дистанция',        unit: ' м', digits: 0, path: (p) => p.distance },
  { id: 'sprintDist', group: 'fitness', label: 'Спринт-дистанция', unit: ' м', digits: 0, path: (p) => p.sprintDistance },
];

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

  // СЕЗОН, не последний матч.
  const seasonRes = useApi(
    () => (selectedTeamId ? fetchPlayersSeason(selectedTeamId) : Promise.resolve({ players: [] })),
    [selectedTeamId],
  );
  const players = seasonRes.data?.players || [];

  const [metricId, setMetricId] = useState('overall');
  const [direction, setDirection] = useState('desc');
  const [posFilter, setPosFilter] = useState('all');

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

  const metricValues = useMemo(
    () => rows.map((r) => Number(r.value)).filter((v) => Number.isFinite(v)),
    [rows],
  );

  const Subnav = (
    <div className="players-rating__subnav">
      <NavLink to="/players" end className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Лидеры</NavLink>
      <NavLink to="/players/rating" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Рейтинг</NavLink>
      <NavLink to="/players/compare" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Сравнение</NavLink>
    </div>
  );

  if (seasonRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!players.length) {
    return (
      <div className="page players-rating kinetic">
        {Subnav}
        <div className="empty-state">Сезонная статистика появится после разбора матчей.</div>
      </div>
    );
  }

  return (
    <div className="page players-rating kinetic">
      {Subnav}

      <div className="players-leaders__scope" style={{ color: 'var(--text-faint)', fontSize: 13, margin: '4px 2px 14px' }}>
        Рейтинги — средние за сезон, действия — суммы за сезон
      </div>

      <Reveal variant="slide-up" duration={0.3}>
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
        </div>
      </div>
      </Reveal>

      <div className={'card players-rating__table' + (isPrimary ? ' players-rating__table--primary' : '')}>
        <div className="players-rating__head">
          <span className="col-rank">№</span>
          <span className="col-photo"></span>
          <span className="col-name">Игрок</span>
          <span className="col-pos">Позиция</span>
          <span className="col-minutes">Матчи</span>
          <span className="col-overall">Рейтинг</span>
          <span className="col-metric">{metric.label}</span>
        </div>
        <div className="players-rating__body">
          {rows.map(({ player, value }, i) => {
            const unlocked = canSeePlayer(player.id);
            const isFirst = i === 0;
            const numeric = typeof value === 'number' && !isNaN(value);
            const pr = percentileRank(metricValues, Number(value));

            const row = (
              <div
                className={'players-rating__row'
                  + (isFirst ? ' players-rating__row--first' : '')
                  + (unlocked ? '' : ' players-rating__row--locked')}
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
                <span className="col-minutes">{player.matches ?? '—'}</span>
                <span className="col-overall">
                  <RatingPill value={player.avgOverall} size="sm" />
                </span>
                <span className="col-metric">
                  <div className="players-rating__metric-bar">
                    <div
                      className="players-rating__metric-fill"
                      style={{
                        width: max > 0 && numeric
                          ? `${Math.max(0, Math.min(100, (value / max) * 100))}%`
                          : '0%',
                        background: isPrimary
                          ? ratingColor(value)
                          : 'linear-gradient(90deg, var(--brand-secondary), var(--brand-primary))',
                      }}
                    />
                  </div>
                  <span className="players-rating__metric-value">
                    {numeric ? (
                      <AnimatedNumber
                        className="players-rating__metric-value--animated"
                        value={Number(value)}
                        stiffness={200}
                        damping={25}
                        format={(v) => fmt(metric.digits === 0 ? Math.round(v) : v, metric.digits, metric.unit)}
                      />
                    ) : (
                      <span className="players-rating__metric-value--animated">—</span>
                    )}
                    {pr != null ? (
                      <span
                        className="players-rating__pct"
                        style={{ color: percentileColor(pr) }}
                        title={`Лучше ${pr}% состава по этой метрике`}
                      >
                        П{pr}
                      </span>
                    ) : null}
                  </span>
                </span>
              </div>
            );

            // Первая (максимальная) строка появляется fade+scale через CSS; остальные —
            // каскадный slide-right (delay = индекс × 40ms), без перегрузки на 50+ строках.
            if (isFirst) return <div key={player.id} className="players-rating__row-first-wrap">{row}</div>;
            return (
              <Reveal key={player.id} variant="slide-right" duration={0.25} delay={Math.min(0.2 + i * 0.04, 1.2)}>
                {row}
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}
