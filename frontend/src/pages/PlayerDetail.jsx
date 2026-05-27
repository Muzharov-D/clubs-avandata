import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchMatches, fetchMetrics, fetchPlayer } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import PlayerPhoto from '../components/PlayerPhoto';
import AttendanceBlock from '../components/AttendanceBlock';
import RatingCard from '../components/RatingCard';
import RatingPill from '../components/RatingPill';
import SoccerFieldImageMap from '../components/SoccerFieldImageMap';
import PizzaChart from '../components/PizzaChart';
import { ratingColor } from '../utils/colors';
import { num, percentileRank, formatRaw } from '../utils/num';
import { POSITION_OPTIONS, PIZZA_VS_LABEL, TEMPLATES, getStatValue, positionGroup } from '../utils/pizzaTemplates';
import './PlayerDetail.css';

// Ключевые метрики для бейджей "Лучший в команде" — топ-3 ранг по матчу.
const RANK_METRICS = [
  { id: 'goal',         label: 'голам',                getter: (p) => p.stats?.attack4?.goal },
  { id: 'shot',         label: 'ударам в створ',       getter: (p) => p.stats?.attack4?.shot },
  { id: 'assist',       label: 'ассистам',             getter: (p) => p.stats?.attack1?.assist },
  { id: 'keyPass',      label: 'ключевым пасам',       getter: (p) => p.stats?.attack1?.keyPass },
  { id: 'progPass',     label: 'прогрессивным пасам',  getter: (p) => p.stats?.attack2?.progressivePass },
  { id: 'finalThird',   label: 'передачам в финальную треть', getter: (p) => p.stats?.attack2?.passToFinalThird },
  { id: 'tackle',       label: 'отборам',              getter: (p) => p.stats?.defence1?.tackle },
  { id: 'interception', label: 'перехватам',           getter: (p) => p.stats?.defence1?.interception },
  { id: 'pressing',     label: 'прессингу',            getter: (p) => p.stats?.defence2?.pressing },
  { id: 'save',         label: 'сейвам',               getter: (p) => p.stats?.defence3?.save },
  { id: 'distance',     label: 'дистанции',            getter: (p) => p.stats?.fitness?.totalDistance },
  { id: 'sprints',      label: 'спринтам',             getter: (p) => p.stats?.fitness?.sprintsCount },
];

const RANK_ICONS = ['🏆', '🥈', '🥉'];

// Splits keys grouped (used to render Атака / Защита tables).
const ATTACK_SPLIT_KEYS = [
  'Goal', 'Shot', 'Shot by head', 'Free kick shot', 'Free kick with shot',
  'Assist', 'Second assist', 'Third assist', 'Shot on target assist', 'Key pass',
  'Pass with packing', 'Pass into pen. area', 'Cross', 'Entries in box',
  'Sprint forward', 'Progressive pass', 'Pass to final third',
  'Pass', 'Pass forward', 'Pass back', 'Pass sideways',
  'Pass short', 'Pass middle', 'Pass long',
  'Touches in pen. area', 'Received pass',
  'Dribble', 'Dribble packing', 'Goal actions',
  'Penalty', 'Throwing', 'Direct free kick',
  'Lose on own half', 'Dangerous loses on own half', 'Lost ball',
  'Technical mistake', 'Autogoal', 'Offside', 'Fouls suffered',
];

const DEFENCE_SPLIT_KEYS = [
  'Tackle', 'Sliding tackles', 'Tackle & recovery', 'Tackle & recovery on opp. half',
  'Interception', 'Recovery', 'Sprint back', 'Return', 'Return on opp. half',
  'Clearance', 'Blocked shot', 'Foul', 'Yellow card', 'Red card',
  'Duel', 'Ariel duel', 'Pressing', 'Contrpressing', 'Dribble against',
  'Save', 'Shots against', 'Goalkeeper exits', 'Goal kick',
  'Short goal kicks', 'Long goal kicks',
];

// Fitness comes from stats.fitness, not splits.
const FITNESS_ROWS = [
  ['Минут на поле',                'minutes'],
  ['Общая дистанция, м',           'totalDistance'],
  ['Дистанция 4–5.5 м/с, м',       'speed_4_5_5'],
  ['Дистанция 5.5–7 м/с, м',       'speed_5_5_7'],
  ['Дистанция 7+ м/с, м',          'speed_7plus'],
  ['Спринтерская дистанция, м',    'sprintDistance'],
  ['Спринты',                      'sprintsCount'],
  ['Интенсивный бег',              'intenseRunning'],
  ['Средняя скорость, м/с',        'averageSpeed'],
];

// Ключи splits для блока «1 тайм vs 2 тайм» внутри PlayerDetail.
// (компонент HalfTimeBars удалён в Sprint 2 — рендер теперь inline).
const HALFTIME_KEYS = [
  'Pass', 'Shot', 'Tackle', 'Pressing',
  'Sprint forward', 'Recovery', 'Goal actions', 'Interception', 'Cross', 'Duel',
];

const RADAR_PALETTE = ['#22d3ee', '#7cb342', '#42a5f5', '#ef5350', '#ab47bc', '#26a69a', '#ff9800', '#03a9f4'];

function fmtNum(v, digits = 0) {
  const n = num(v);
  if (n === null || isNaN(n)) return '—';
  if (Number.isInteger(n) && digits === 0) return n.toString();
  return n.toFixed(digits);
}

function deltaArrow(first, second) {
  const f = num(first);
  const s = num(second);
  if (f === null || s === null || isNaN(f) || isNaN(s)) return null;
  if (Math.abs(s - f) < 0.001) return { dir: 'eq', text: '=' };
  if (s > f) return { dir: 'up', text: `+${(s - f).toFixed(s - f >= 1 ? 0 : 1)}` };
  return { dir: 'down', text: `${(s - f).toFixed(s - f <= -1 ? 0 : 1)}` };
}

export default function PlayerDetail() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { user, isPlayer } = useAuth();

  useEffect(() => {
    if (isPlayer && user?.playerId && user.playerId !== playerId) {
      navigate(`/players/${user.playerId}`, { replace: true });
    }
  }, [isPlayer, user, playerId, navigate]);

  const { selectedTeamId, select } = useTeam();

  // Сначала тянем самого игрока (по нему узнаём teamId), потом синхронизируем
  // выбранную команду в шапке. Это чинит навигацию head_coach'а с КЛУБА на игрока
  // другой возрастной группы.
  const playerLookupRes = useApi(() => fetchPlayer(playerId).catch(() => null), [playerId]);
  const lookedUpPlayer = playerLookupRes.data?.player;

  useEffect(() => {
    if (lookedUpPlayer?.teamId && lookedUpPlayer.teamId !== selectedTeamId) {
      select(lookedUpPlayer.teamId);
    }
  }, [lookedUpPlayer, selectedTeamId, select]);

  // teamId, по которому тянем матчи — приоритет: teamId игрока, затем выбранная в шапке.
  const effectiveTeamId = lookedUpPlayer?.teamId || selectedTeamId;
  const matchesRes = useApi(
    () => (effectiveTeamId ? fetchMatches(effectiveTeamId) : Promise.resolve({ matches: [] })),
    [effectiveTeamId]
  );
  const lastMatchId = matchesRes.data?.matches?.[0]?.id;
  const matchRes = useApi(() => (lastMatchId ? fetchMatch(lastMatchId) : Promise.resolve(null)), [lastMatchId]);
  const metricsRes = useApi(fetchMetrics, []);

  const match = matchRes.data;
  const metrics = metricsRes.data || {};
  const radarAxes = metrics.radarAxes || [];
  const labels = metrics.metricLabels || {};

  const player = useMemo(
    () => (match?.players || []).find((p) => p.id === playerId),
    [match, playerId]
  );

  const samePos = useMemo(() => {
    if (!match || !player) return [];
    return match.players.filter((p) => p.position === player.position);
  }, [match, player]);

  const badges = useMemo(() => {
    if (!match || !player) return [];
    const all = match.players;
    const out = [];
    for (const m of RANK_METRICS) {
      const ranked = [...all]
        .map((p) => ({ p, v: num(m.getter(p)) }))
        .filter((r) => r.v !== null && !isNaN(r.v) && r.v > 0)
        .sort((a, b) => b.v - a.v);
      const idx = ranked.findIndex((r) => r.p.id === player.id);
      if (idx >= 0 && idx < 3) {
        const my = ranked[idx];
        out.push({
          rank: idx + 1,
          label: m.label,
          value: my.v,
          icon: RANK_ICONS[idx],
        });
      }
    }
    return out.sort((a, b) => a.rank - b.rank);
  }, [match, player]);

  // Pizza chart: выбор позиционного шаблона.
  // Дефолт — позиция самого игрока. Если он не классифицирован — MID.
  const [pizzaPos, setPizzaPos] = useState(() => positionGroup(player) || 'MID');
  // Фильтр группы: 'all' | 'attack' | 'defence' | 'fitness'.
  const [pizzaGroup, setPizzaGroup] = useState('all');
  useEffect(() => {
    const next = positionGroup(player) || 'MID';
    setPizzaPos(next);
    setPizzaGroup('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  if (matchesRes.loading || matchRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!match) return <div className="empty-state">Нет данных о матче</div>;
  if (!player) return <div className="empty-state">Игрок не найден</div>;

  const ratings = player.ratings || {};
  const splits = player.splits || {};
  const fitnessStats = player.stats?.fitness || {};

  const attackRows = ATTACK_SPLIT_KEYS.filter((k) => splits[k]);
  const defenceRows = DEFENCE_SPLIT_KEYS.filter((k) => splits[k]);

  // Pizza slices: для каждой метрики шаблона считаем percentile vs ВСЕЙ команды
  // (peer-pool = все игроки матча, не только позиционная подгруппа).
  // - длина слайса = percentile (0–100, насколько игрок впереди команды)
  // - подпись = реальное «сырое» значение метрики (голы, отборы, xG…)
  // inverse=true в шаблоне (Фолы, ЖК, потери) флипает percentile — меньше = лучше.
  const pizzaTemplate = TEMPLATES[pizzaPos];
  const peers = match.players || [];
  const allSlices = pizzaTemplate
    ? pizzaTemplate.slices.map((s) => {
        const myValue = getStatValue(player, s.key);
        const allValues = peers.map((p) => getStatValue(p, s.key));
        const pct = percentileRank(myValue, allValues, !!s.inverse);
        return {
          axis: s.axis,
          group: s.group,
          value: pct ?? 0,
          displayValue: formatRaw(myValue),
        };
      })
    : [];
  const pizzaSlices = pizzaGroup === 'all'
    ? allSlices
    : allSlices.filter((s) => s.group === pizzaGroup);

  // Количество слайсов на каждую группу — для бейджей на табах.
  const groupCounts = allSlices.reduce(
    (acc, s) => { acc[s.group] = (acc[s.group] || 0) + 1; return acc; },
    { attack: 0, defence: 0, fitness: 0 },
  );
  const GROUP_TABS = [
    { value: 'all',     label: 'Все',     count: allSlices.length },
    { value: 'attack',  label: 'Атака',   count: groupCounts.attack },
    { value: 'defence', label: 'Оборона', count: groupCounts.defence },
    { value: 'fitness', label: 'Фитнес',  count: groupCounts.fitness },
  ];

  return (
    <div className="page player-detail">
      {/* HEADER */}
      <div className="card player-detail__hero">
        <PlayerPhoto player={player} size={132} />
        <div className="player-detail__hero-info">
          <div className="player-detail__hero-pos">№{player.number} · {player.positionFull}</div>
          <h1 className="player-detail__hero-name">{player.fullName}</h1>
          <div className="player-detail__hero-meta">
            <span>Минут на поле: <b>{player.minutes ?? '—'}</b></span>
            <span>Голы: <b>{num(player.stats?.attack4?.goal) ?? 0}</b></span>
            <span>Ассисты: <b>{num(player.stats?.attack1?.assist) ?? 0}</b></span>
            <span>Перехваты: <b>{num(player.stats?.defence1?.interception) ?? 0}</b></span>
          </div>
        </div>
        <div className="player-detail__hero-rating">
          <RatingPill value={ratings.overall} size="xl" />
          <div className="player-detail__hero-rating-100">
            {ratings.overall ? Math.round(ratings.overall * 10) : '—'}/100
          </div>
        </div>
      </div>

      {/* Блок посещаемости тренировок (Sprint 5.E) — появляется только если есть данные */}
      <AttendanceBlock teamId={player.teamId} playerId={player.id} />

      {/* 4 RATING CARDS */}
      <div className="player-detail__ratings">
        <RatingCard label="Общий" value={ratings.overall} />
        <RatingCard label="Фитнес" value={ratings.fitness} />
        <RatingCard label="Атака" value={ratings.attack} />
        <RatingCard label="Защита" value={ratings.defence} />
      </div>

      {/* RIBBON: Лучший в команде */}
      {badges.length > 0 && (
        <div className="card player-detail__ribbon">
          <div className="page-section-title">Лучший в команде</div>
          <div className="player-detail__ribbon-row">
            {badges.map((b, i) => (
              <div className={`badge badge--rank-${b.rank}`} key={i}>
                <span className="badge__icon">{b.icon}</span>
                <div className="badge__body">
                  <div className="badge__rank">
                    {b.rank === 1 ? 'Лучший по' : `#${b.rank} по`}
                  </div>
                  <div className="badge__label">{b.label}</div>
                </div>
                <div className="badge__value">{Number.isInteger(b.value) ? b.value : b.value.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PIZZA CHART — фронт-витрина профиля игрока */}
      <div className="card player-detail__pizza">
        <div className="player-detail__pizza-head">
          <div className="page-section-title">Профиль игрока</div>
          <div className="player-detail__pizza-pos">
            <label htmlFor="pizza-pos">Шаблон:</label>
            <select
              id="pizza-pos"
              value={pizzaPos}
              onChange={(e) => { setPizzaPos(e.target.value); setPizzaGroup('all'); }}
            >
              {POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Табы: фильтр по группе метрик. Все | Атака | Оборона | Фитнес. */}
        <div className="player-detail__pizza-tabs" role="tablist">
          {GROUP_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={pizzaGroup === t.value}
              className={`player-detail__pizza-tab player-detail__pizza-tab--${t.value}${pizzaGroup === t.value ? ' is-active' : ''}`}
              onClick={() => setPizzaGroup(t.value)}
              disabled={t.count === 0}
            >
              {t.label}<span className="player-detail__pizza-tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        {peers.length < 2 ? (
          // Если в матче меньше 2 игроков — percentile бессмысленен.
          // Не показываем диаграмму, объясняем причину.
          <div className="empty-state">
            Недостаточно данных для сравнения с командой (нужны рейтинги
            хотя бы 2 игроков матча).
          </div>
        ) : (
          <PizzaChart
            subjectName={`${player.fullName} · ${player.positionFull || ''} · ${player.minutes ?? '?'} мин`}
            subjectMeta={`Цифры — реальные значения, длина слайса — percentile vs ${PIZZA_VS_LABEL} (${peers.length} чел.)`}
            vsLabel={PIZZA_VS_LABEL}
            slices={pizzaSlices}
          />
        )}
      </div>

      {/* RATINGS vs TEAM AVG — оставил, нагляднее по 4 общим осям */}
      {/* (радары удалены — pizza заменила и 14-осевой radar, и position-сравнение) */}

      {/* MAPS */}
      <div className="player-detail__maps">
        <div className="card player-detail__map-card player-detail__map-card--attack">
          <SoccerFieldImageMap
            src={player.maps?.attackMap}
            title="Карта пасов и ударов"
            height={420}
          />
        </div>
        <div className="card player-detail__map-card player-detail__map-card--heat">
          <SoccerFieldImageMap
            src={player.maps?.fitnessHeatmap}
            title="Тепловая карта движения"
            height={420}
          />
        </div>
      </div>

      {/* FITNESS */}
      <div className="card">
        <div className="page-section-title">Фитнес</div>
        <div className="player-detail__fitness-grid">
          {FITNESS_ROWS.map(([label, key]) => (
            <div className="fitness-cell" key={key}>
              <div className="fitness-cell__value">
                {fmtNum(fitnessStats[key], key === 'averageSpeed' || key === 'intenseRunning' ? 2 : 0)}
              </div>
              <div className="fitness-cell__label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ПОЛНАЯ ТАБЛИЦА МЕТРИК — свёрнута по умолчанию.
          Раскрывается по клику. Внутри — две большие сплит-таблицы. */}
      <details className="card player-detail__splits-toggle">
        <summary className="player-detail__splits-summary">
          <span>Раскрыть полную таблицу метрик</span>
          <span className="player-detail__splits-summary-meta">
            {attackRows.length} атака · {defenceRows.length} защита · по таймам
          </span>
        </summary>
        <div className="player-detail__splits-body">
          <SplitsTable
            title="Атака — раскладка по таймам"
            keys={attackRows}
            splits={splits}
            labels={labels}
          />
          <SplitsTable
            title="Защита — раскладка по таймам"
            keys={defenceRows}
            splits={splits}
            labels={labels}
          />
        </div>
      </details>
    </div>
  );
}

function SplitsTable({ title, keys, splits, labels }) {
  if (!keys.length) return null;
  return (
    <div className="card splits-table">
      <div className="page-section-title">{title}</div>
      <div className="splits-table__head">
        <span>Метрика</span>
        <span className="splits-table__col-num">Матч</span>
        <span className="splits-table__col-num">1 тайм</span>
        <span className="splits-table__col-num">2 тайм</span>
        <span className="splits-table__col-num">Дельта</span>
      </div>
      <div className="splits-table__body">
        {keys.map((k) => {
          const row = splits[k];
          const m = num(row.match);
          const f = num(row.first);
          const s = num(row.second);
          const d = deltaArrow(row.first, row.second);
          return (
            <div className="splits-table__row" key={k}>
              <span className="splits-table__label">{labels[k] || k}</span>
              <span className="splits-table__val splits-table__val--match">{m === null || isNaN(m) ? '—' : m}</span>
              <span className="splits-table__val">{f === null || isNaN(f) ? '—' : f}</span>
              <span className="splits-table__val">{s === null || isNaN(s) ? '—' : s}</span>
              <span className={`splits-table__delta splits-table__delta--${d?.dir || 'eq'}`}>
                {d ? d.text : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
