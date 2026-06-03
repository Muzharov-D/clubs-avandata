/**
 * Сезонная пицца-витрина игрока — per-90 перцентиль против позиционного пула за
 * ВЕСЬ сезон (а не против состава одного матча). Это «общий» профиль игрока,
 * которого не хватало: одна узнаваемая радар-картинка отвечает на вопрос
 * «кто этот игрок по сезону». Деградирует, если season-данные недоступны
 * (эндпоинт только для тренеров) — тогда карточку не показываем.
 */
import { per90 } from '../../utils/analytics';
import { percentileRank } from '../../utils/num';
import PizzaChart from '../PizzaChart';
import './analytics.css';

// Сезонные метрики из /players/season (суммы за сезон + minutes). per-90 внутри.
// group → цвет слайса в пицце (attack/defence/fitness).
const SEASON_METRICS = [
  { key: 'goalContrib', label: 'Гол+пас',      group: 'attack',  get: (s) => (s.goals || 0) + (s.assists || 0) },
  { key: 'shots',       label: 'Удары',        group: 'attack',  get: (s) => s.shots || 0 },
  { key: 'keyPass',     label: 'Ключевые',     group: 'attack',  get: (s) => s.keyPass || 0 },
  { key: 'dribble',     label: 'Обводки',      group: 'attack',  get: (s) => s.dribble || 0 },
  { key: 'tackle',      label: 'Отборы',       group: 'defence', get: (s) => s.tackle || 0 },
  { key: 'interception',label: 'Перехваты',    group: 'defence', get: (s) => s.interception || 0 },
  { key: 'recovery',    label: 'Возвраты',     group: 'defence', get: (s) => s.recovery || 0 },
  { key: 'duel',        label: 'Единоборства', group: 'defence', get: (s) => s.duel || 0 },
  { key: 'pressing',    label: 'Прессинг',     group: 'defence', get: (s) => s.pressing || 0 },
  { key: 'distance',    label: 'Дистанция',    group: 'fitness', get: (s) => s.distance || 0 },
];

function fmt90(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(v >= 10 ? 0 : 1);
}

export default function SeasonProfileCard({ subject, seasonPlayers, basis = 90 }) {
  if (!subject || !Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return null;
  const me = seasonPlayers.find((s) => s.id === subject.id);
  if (!me || !(me.minutes > 0)) return null;

  // Пул = ВСЯ команда (сыгравшие минуты) — сравниваем с командой, а не с узким
  // позиционным срезом (явное требование тренера).
  const pool = seasonPlayers.filter((s) => s.minutes > 0);
  if (pool.length < 4) return null;

  // Слайс показываем только если в пуле хоть у кого-то метрика > 0 (иначе пустой
  // сектор: xG/xA для младших возрастов SportVisor не считает).
  const slices = SEASON_METRICS.map((m) => {
    const poolMax = Math.max(0, ...pool.map((s) => Number(m.get(s)) || 0));
    if (poolMax <= 0) return null;
    const my90 = per90(m.get(me), me.minutes, 1, basis);
    const poolVals = pool.map((s) => per90(m.get(s), s.minutes, 1, basis));
    const pct = percentileRank(my90, poolVals);
    if (pct == null) return null;
    return { axis: m.label, group: m.group, value: pct, displayValue: fmt90(my90) };
  }).filter(Boolean);

  if (slices.length < 3) return null;

  const poolSize = pool.length;

  return (
    <div className="card player-detail__pizza">
      <div className="player-detail__pizza-head">
        <div className="page-section-title">
          Профиль по сезону <span className="an-model-tag">за матч ({basis}′) · в сравнении с командой</span>
        </div>
      </div>
      <PizzaChart
        subjectName={`${subject.fullName || ''} · сезон`}
        subjectMeta={`Цифры — действия за матч (${basis}′), длина слайса — перцентиль в команде (${poolSize} чел.)`}
        vsLabel="команды"
        slices={slices}
      />
    </div>
  );
}
