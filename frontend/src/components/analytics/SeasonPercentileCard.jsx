/**
 * Перцентиль игрока ПРОТИВ ВСЕЙ КОМАНДЫ за сезон (на 90 минут). Сравнение с
 * командой, а не с узким позиционным пулом из 3–4 человек — так требует тренер:
 * «в сравнении с командой». Показываем топ-5 сильных и топ-5 слабых сторон —
 * скаут-стандарт «где игрок выделяется / где проседает». Деградирует, если
 * сезонных данных нет (эндпоинт только для тренеров) — тогда карточку не рисуем.
 */
import { per90, MIN_RANK_MINUTES } from '../../utils/analytics';
import { percentileRank } from '../../utils/num';
import './analytics.css';

// Метрики из /players/season (сезонные суммы + minutes). per-90 внутри.
const METRICS = [
  { key: 'goalContrib', label: 'Гол+пас', get: (s) => (s.goals || 0) + (s.assists || 0) },
  { key: 'shots', label: 'Удары', get: (s) => s.shots || 0 },
  { key: 'keyPass', label: 'Ключевые пасы', get: (s) => s.keyPass || 0 },
  { key: 'dribble', label: 'Обводки', get: (s) => s.dribble || 0 },
  { key: 'tackle', label: 'Отборы', get: (s) => s.tackle || 0 },
  { key: 'interception', label: 'Перехваты', get: (s) => s.interception || 0 },
  { key: 'recovery', label: 'Возвраты', get: (s) => s.recovery || 0 },
  { key: 'duel', label: 'Единоборства', get: (s) => s.duel || 0 },
  { key: 'pressing', label: 'Прессинг', get: (s) => s.pressing || 0 },
  { key: 'distance', label: 'Дистанция', get: (s) => s.distance || 0 },
];

// 5 корзин по порогам 20/40/60/80 (стиль Opta/StatsBomb).
function bucket(pct) {
  if (pct >= 80) return 'hi';        // топ-20% — насыщенный зелёный
  if (pct >= 60) return 'good';      // топ-40% — зелёный
  if (pct >= 40) return 'neutral';   // середина — серый, без сигнала
  if (pct >= 20) return 'mid';       // ниже среднего — янтарный
  return 'lo';                       // нижние 20% — красный
}

function PctRow({ r, basis }) {
  return (
    <div className="an-pct__row">
      <span className="an-pct__label">{r.label}</span>
      <span className="an-pct__track">
        <span className={`an-pct__fill an-pct__fill--${bucket(r.pct)}`} style={{ width: `${Math.max(4, r.pct)}%` }} />
      </span>
      <span className="an-pct__num">
        {r.pct}
        <span className="an-pct__raw"> · {r.raw90 != null ? r.raw90.toFixed(r.raw90 >= 10 ? 0 : 1) : '—'}/{basis}</span>
      </span>
    </div>
  );
}

export default function SeasonPercentileCard({ subject, seasonPlayers, basis = 90 }) {
  if (!subject || !Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return null;
  const me = seasonPlayers.find((s) => s.id === subject.id);
  if (!me || !(me.minutes > 0)) return null;

  // Пул = ВСЯ команда (сыгравшие минуты), без позиционного среза.
  const pool = seasonPlayers.filter((s) => s.minutes > 0);
  if (pool.length < 4) return null;

  const rows = METRICS.map((m) => {
    const myVal = per90(m.get(me), me.minutes, MIN_RANK_MINUTES, basis);
    const poolVals = pool.map((s) => per90(m.get(s), s.minutes, MIN_RANK_MINUTES, basis));
    const pct = percentileRank(myVal, poolVals);
    return { ...m, pct, raw90: myVal };
  }).filter((r) => r.pct != null);

  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  // Топ-5 сильных и топ-5 слабых, без пересечения по середине.
  const half = Math.min(5, Math.floor(sorted.length / 2));
  const top = sorted.slice(0, half);
  const worst = sorted.slice(sorted.length - half).reverse(); // от самого слабого
  const fewMetrics = half === 0; // <2 валидных метрик — показываем всё списком

  return (
    <div className="card an">
      <div className="page-section-title">
        Перцентиль по сезону <span className="an-model-tag">за матч ({basis}′) · в сравнении с командой</span>
      </div>

      {fewMetrics ? (
        sorted.map((r) => <PctRow key={r.key} r={r} basis={basis} />)
      ) : (
        <div className="an-pct__split">
          <div className="an-pct__col">
            <div className="an-pct__col-title an-pct__col-title--pos">Сильнее всего</div>
            {top.map((r) => <PctRow key={r.key} r={r} basis={basis} />)}
          </div>
          <div className="an-pct__col">
            <div className="an-pct__col-title an-pct__col-title--neg">Слабее всего</div>
            {worst.map((r) => <PctRow key={r.key} r={r} basis={basis} />)}
          </div>
        </div>
      )}

      <div className="an-note">
        Перцентиль за матч ({basis}′) против {pool.length} игроков команды по всему сезону.
        Заливка: зелёный — топ команды, серый — в норме, красный — отстаёт.
      </div>
    </div>
  );
}
