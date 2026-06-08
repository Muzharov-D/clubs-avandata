/**
 * Расширенные лидеры матча по категориям (угроза/прогрессия/дуэли/прессинг/бег).
 * Только сырые суммы за матч — режим «за матч» (нормализация на 90/80′) убран:
 * тренерам дробные «Гол+пас» (3.48) непонятны. Вернём, когда будет запрос.
 */
import { useState } from 'react';
import { M, played } from '../../utils/analytics';
import { playerThreat } from '../../utils/analytics';
import { useAuth } from '../../contexts/AuthContext';
import PlayerPhoto from '../PlayerPhoto';
import './analytics.css';

// paid: true — модельные/платные показатели (угроза=xT, прогрессия с прогр.рывком/
// в фин.треть, дуэли, интенс. бег=физика). На free показываем только наши метрики.
const METRICS = [
  { id: 'ga', label: 'Гол+пас', get: (p) => M.goals(p) + M.assists(p), digits: 0 },
  { id: 'shots', label: 'Удары', get: (p) => M.shots(p), digits: 0 },
  { id: 'keyPass', label: 'Ключевые', get: (p) => M.keyPass(p), digits: 0 },
  { id: 'dribble', label: 'Обводки', get: (p) => M.dribble(p), digits: 0 },
  { id: 'tackle', label: 'Отборы', get: (p) => M.tackle(p), digits: 0 },
  { id: 'interception', label: 'Перехваты', get: (p) => M.interception(p), digits: 0 },
  { id: 'press', label: 'Прессинг', get: (p) => M.pressing(p) + M.counterpressing(p), digits: 0 },
  { id: 'threat', label: 'Угроза', model: true, paid: true, get: (p) => playerThreat(p), digits: 1 },
  { id: 'progression', label: 'Прогрессия', paid: true, get: (p) => M.progressivePass(p) + M.progressiveRun(p) + M.passToFinalThird(p), digits: 0 },
  { id: 'duel', label: 'Единоборства', paid: true, get: (p) => M.duel(p), digits: 0 },
  { id: 'dist', label: 'Интенс. бег', paid: true, get: (p) => M.hsr(p), digits: 1 },
];

function fmt(v, digits) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (digits === 0) return Number.isInteger(n) ? String(n) : n.toFixed(1);
  return n.toFixed(1);
}

export default function MatchLeaders({ players, navigate, nameOf }) {
  const { tenant } = useAuth();
  const isPaidPlan = tenant?.plan === 'paid';
  // На free — только наши (free) метрики; платные/модельные скрыты.
  const metrics = METRICS.filter((m) => isPaidPlan || !m.paid);
  const [metricId, setMetricId] = useState('ga');
  const selected = METRICS.find((m) => m.id === metricId);
  const metric = (selected && (isPaidPlan || !selected.paid)) ? selected : metrics[0];

  const squad = (players || []).filter(played);
  const rows = squad
    .map((p) => ({ p, value: metric.get(p) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5);

  const max = Math.max(1e-6, ...rows.map((r) => r.value ?? 0));

  return (
    <div className="card an">
      <div className="an-xg__head" style={{ marginBottom: 8 }}>
        <div className="page-section-title" style={{ margin: 0 }}>
          Лидеры матча {metric.model && <span className="an-model-tag">модель</span>}
        </div>
      </div>

      <div className="an-leaders__filterlabel">Ранжировать по показателю:</div>
      <div className="an-leaders__tabs" role="tablist">
        {metrics.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === metricId}
            className={`an-leaders__tab${m.id === metricId ? ' is-active' : ''}`}
            onClick={() => setMetricId(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">Нет данных по метрике</div>
      ) : (
        rows.map((r, i) => (
          <div key={r.p.id} className="an-leaders__row" onClick={() => navigate(`/players/${r.p.id}`)}>
            <span className="an-leaders__rank">{i + 1}</span>
            <PlayerPhoto player={r.p} size={30} />
            <span className="an-leaders__name">
              {nameOf(r.p)}
              <span className="an-leaders__sub"> · {r.p.minutes ?? 0}′</span>
            </span>
            <span className="an-leaders__bar"><span className="an-leaders__bar-fill" style={{ width: `${Math.round(((r.value ?? 0) / max) * 100)}%` }} /></span>
            <span className="an-leaders__val">{fmt(r.value, metric.digits)}</span>
          </div>
        ))
      )}
    </div>
  );
}
