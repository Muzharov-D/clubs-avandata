/**
 * Перцентиль игрока ПРОТИВ ВСЕЙ КОМАНДЫ за сезон (на 90 минут). Сравнение с
 * командой, а не с узким позиционным пулом из 3–4 человек — так требует тренер:
 * «в сравнении с командой». Показываем топ-5 сильных и топ-5 слабых сторон —
 * скаут-стандарт «где игрок выделяется / где проседает». Деградирует, если
 * сезонных данных нет (эндпоинт только для тренеров) — тогда карточку не рисуем.
 */
import { seasonPercentiles } from '../../utils/playerRoles';
import './analytics.css';

// Метрики — только label для строк. КЛЮЧ совпадает с движком ролей; перцентиль и
// raw90 берём из ЕДИНОГО источника seasonPercentiles (тот же пул/порог/сглаживание,
// что у «ДНК» и пиццы), чтобы «лучший» игрок не получал то 96, то 97, то 79, то 81.
const METRICS = [
  { key: 'gi', label: 'Гол+пас' },
  { key: 'shots', label: 'Удары' },
  { key: 'keyPass', label: 'Ключевые пасы' },
  { key: 'dribble', label: 'Обводки' },
  { key: 'tackle', label: 'Отборы' },
  { key: 'interception', label: 'Перехваты' },
  { key: 'recovery', label: 'Возвраты' },
  { key: 'duel', label: 'Единоборства' },
  { key: 'pressing', label: 'Прессинг' },
  { key: 'distance', label: 'Дистанция' },
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

export default function SeasonPercentileCard({ subject, seasonPlayers, basis = 90, isPaidPlan = true }) {
  if (!subject || !Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return null;

  // Единый источник: тот же пул/порог/сглаживание, что у «ДНК» и пиццы.
  const sp = seasonPercentiles(subject, seasonPlayers, basis);
  if (!sp) return null;

  // На free дистанцию (физика — платная) не показываем.
  const metrics = isPaidPlan ? METRICS : METRICS.filter((m) => m.key !== 'distance');
  const rows = metrics.map((m) => {
    const r = sp.byKey[m.key];
    if (!r) return null;
    return { ...m, pct: r.pct, raw90: r.raw90 };
  }).filter(Boolean);

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
        Перцентиль за матч ({basis}′) против {sp.poolSize} {sp.meIsGk ? 'игроков команды' : 'полевых игроков команды'} по всему сезону.
        Заливка: зелёный — топ команды, серый — в норме, красный — отстаёт.
      </div>
    </div>
  );
}
