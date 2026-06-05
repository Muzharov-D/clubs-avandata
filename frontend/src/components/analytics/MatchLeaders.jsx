/**
 * Расширенные лидеры матча с переключателем Σ / на 90 минут и категориями,
 * которых раньше не было (угроза/прогрессия/дуэли/прессинг/бег). Покрывает
 * критики 1/14/29 и улучшения 34/48/61.
 */
import { useState } from 'react';
import { M, played } from '../../utils/analytics';
import { playerThreat } from '../../utils/analytics';
import { per90, fmtPer90 } from '../../utils/analytics';
import PlayerPhoto from '../PlayerPhoto';
import './analytics.css';

const METRICS = [
  { id: 'ga', label: 'Гол+пас', get: (p) => M.goals(p) + M.assists(p), digits: 0 },
  { id: 'threat', label: 'Угроза', model: true, get: (p) => playerThreat(p), digits: 1 },
  { id: 'progression', label: 'Прогрессия', get: (p) => M.progressivePass(p) + M.progressiveRun(p) + M.passToFinalThird(p), digits: 0 },
  { id: 'duel', label: 'Единоборства', get: (p) => M.duel(p), digits: 0 },
  { id: 'press', label: 'Прессинг', get: (p) => M.pressing(p) + M.counterpressing(p), digits: 0 },
  { id: 'dist', label: 'Интенс. бег', get: (p) => M.hsr(p), digits: 1 },
];

function fmt(v, digits) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (digits === 0) return Number.isInteger(n) ? String(n) : n.toFixed(1);
  return fmtPer90(n);
}

export default function MatchLeaders({ players, navigate, nameOf, basis = 90 }) {
  const [metricId, setMetricId] = useState('ga');
  const [per90Mode, setPer90Mode] = useState(false);
  const metric = METRICS.find((m) => m.id === metricId) || METRICS[0];

  const squad = (players || []).filter(played);
  const rows = squad
    .map((p) => {
      const raw = metric.get(p);
      const value = per90Mode ? per90(raw, p.minutes, 20, basis) : raw;
      return { p, raw, value };
    })
    .filter((r) => (per90Mode ? r.value != null : r.raw > 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5);

  const max = Math.max(1e-6, ...rows.map((r) => r.value ?? 0));

  return (
    <div className="card an">
      <div className="an-xg__head" style={{ marginBottom: 8 }}>
        <div className="page-section-title" style={{ margin: 0 }}>
          Лидеры матча {metric.model && <span className="an-model-tag">модель</span>}
        </div>
        <div className="an-toggle" role="group" aria-label="Режим значений">
          <button className={`an-toggle__btn${!per90Mode ? ' is-active' : ''}`} onClick={() => setPer90Mode(false)}>всего</button>
          <button className={`an-toggle__btn${per90Mode ? ' is-active' : ''}`} onClick={() => setPer90Mode(true)}>за матч</button>
        </div>
      </div>

      <div className="an-leaders__filterlabel">Ранжировать по показателю:</div>
      <div className="an-leaders__tabs" role="tablist">
        {METRICS.map((m) => (
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
            <span className="an-leaders__val">{fmt(r.value, per90Mode ? 2 : metric.digits)}</span>
          </div>
        ))
      )}
      {per90Mode && (
        <div className="an-note">За матч ({basis}′) — честное сравнение вышедших на разное время. Игроки с &lt;20′ скрыты (мало данных).</div>
      )}
    </div>
  );
}
