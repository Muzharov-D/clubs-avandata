/**
 * Перцентиль игрока против СЕЗОННОГО ПОЗИЦИОННОГО пула (на 90 минут), а не против
 * 11–17 партнёров одного матча. Это скаут-стандарт. Покрывает критики 2/14,
 * улучшения 35/44, вау 75/83/97. Деградирует, если season-данные недоступны
 * (эндпоинт только для тренеров) — тогда карточку не показываем.
 */
import { per90 } from '../../utils/analytics';
import { seasonPercentile, callout } from '../../utils/analytics';
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

function bucket(pct) {
  if (pct >= 66) return 'hi';
  if (pct >= 33) return 'mid';
  return 'lo';
}

export default function SeasonPercentileCard({ subject, seasonPlayers }) {
  if (!subject || !Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return null;
  const me = seasonPlayers.find((s) => s.id === subject.id);
  if (!me || !(me.minutes > 0)) return null;

  const getP90 = (m) => (s) => per90(m.get(s), s.minutes, 1);

  const rows = METRICS.map((m) => {
    const myVal = per90(m.get(me), me.minutes, 1);
    const res = seasonPercentile(subject, seasonPlayers, getP90(m), myVal);
    return { ...m, pct: res.pct, scope: res.scope, poolSize: res.poolSize, raw90: myVal };
  }).filter((r) => r.pct != null);

  if (rows.length === 0) return null;
  const scope = rows[0].scope === 'position' ? 'позиции' : 'команде';
  const poolSize = rows[0].poolSize;

  const callouts = rows
    .map((r) => callout(r.pct, r.label))
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="card an">
      <div className="page-section-title">Перцентиль по сезону <span className="an-model-tag">на 90′ · vs {scope}</span></div>
      {rows.map((r) => (
        <div className="an-pct__row" key={r.key}>
          <span className="an-pct__label">{r.label}</span>
          <span className="an-pct__track"><span className={`an-pct__fill an-pct__fill--${bucket(r.pct)}`} style={{ width: `${r.pct}%` }} /></span>
          <span className="an-pct__num">{r.pct}<span className="an-pct__raw"> · {r.raw90 != null ? r.raw90.toFixed(r.raw90 >= 10 ? 0 : 1) : '—'}/90</span></span>
        </div>
      ))}
      {callouts.length > 0 && (
        <div className="an-callouts">
          {callouts.map((c, i) => (
            <div className={`an-callout an-callout--${c.tone}`} key={i}>{c.text}</div>
          ))}
        </div>
      )}
      <div className="an-note">Сравнение на 90 минут против {poolSize} игроков ({scope}) по всему сезону. Заливка — перцентиль (зелёный — топ, красный — отстаёт).</div>
    </div>
  );
}
