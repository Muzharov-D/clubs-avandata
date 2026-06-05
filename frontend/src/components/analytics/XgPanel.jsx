/**
 * xG-панель матча: командный xG (наш vs соперник) + контекст, который раньше
 * отсутствовал — xG-разница, реализация (G−xG), xG/удар, вероятность исхода
 * (Пуассон), ожидаемые очки и «заслуженный счёт» с индексом везения.
 * Покрывает критики 5/31/32 и улучшения 37/52/70/71/78.
 */
import { num } from '../../utils/num';
import {
  teamXg, ourSideKey, finishing, xgPerShot,
  winProbFromXg, expectedPoints, deservedResult,
} from '../../utils/analytics';
import './analytics.css';

function f2(v) { return v == null ? '—' : Number(v).toFixed(2); }
function f1(v) { return v == null ? '—' : Number(v).toFixed(1); }
function signed(v, d = 2) { if (v == null) return '—'; const n = Number(v); return `${n > 0 ? '+' : ''}${n.toFixed(d)}`; }

export default function XgPanel({ match }) {
  if (!match) return null;
  const { our, opp } = ourSideKey(match);
  const xgFor = teamXg(match, our);
  const xgAgainst = teamXg(match, opp);
  if (xgFor == null && xgAgainst == null) return null;

  const score = match.score || {};
  const goalsFor = our === 'home' ? score.home : score.away;
  const goalsAgainst = our === 'home' ? score.away : score.home;
  const shotsFor = num(match.teamSummaryStats?.[our]?.shots?.total);

  const diff = xgFor != null && xgAgainst != null ? xgFor - xgAgainst : null;
  const fin = finishing(goalsFor, xgFor);
  const xps = xgPerShot(xgFor, shotsFor);
  const prob = xgFor != null && xgAgainst != null ? winProbFromXg(xgFor, xgAgainst) : null;
  const xpts = xgFor != null && xgAgainst != null ? expectedPoints(xgFor, xgAgainst) : null;
  const dr = xgFor != null && xgAgainst != null
    ? deservedResult({ xgFor, xgAgainst, goalsFor, goalsAgainst })
    : null;

  const pct = (x) => Math.round((x || 0) * 100);

  return (
    <div className="card an">
      <div className="an-xg__head">
        <div className="page-section-title">Ожидаемые голы (xG) <span className="an-model-tag">отчёт + модель</span></div>
      </div>

      <div className="an-xg__big">
        <div className="an-xg__side">
          <div className="an-xg__val an-xg__val--us">{f2(xgFor)}</div>
          <div className="an-xg__cap">мы</div>
        </div>
        <div className="an-xg__sep">:</div>
        <div className="an-xg__side">
          <div className="an-xg__val an-xg__val--them">{f2(xgAgainst)}</div>
          <div className="an-xg__cap">соперник</div>
        </div>
      </div>

      <div className="an-chips">
        {diff != null && (
          <span className={`an-chip ${diff > 0 ? 'an-chip--pos' : diff < 0 ? 'an-chip--neg' : ''}`}>
            <span className="an-chip__label">xG-разница</span>
            <span className="an-chip__val">{signed(diff)}</span>
          </span>
        )}
        {fin != null && (
          <span className={`an-chip ${fin > 0.3 ? 'an-chip--pos' : fin < -0.3 ? 'an-chip--neg' : 'an-chip--warn'}`}>
            <span className="an-chip__label">реализация (G−xG)</span>
            <span className="an-chip__val">{signed(fin)}</span>
          </span>
        )}
        {xps != null && (
          <span className="an-chip">
            <span className="an-chip__label">xG / удар</span>
            <span className="an-chip__val">{f2(xps)}</span>
          </span>
        )}
        {xpts != null && (
          <span className="an-chip">
            <span className="an-chip__label">ожидаемые очки</span>
            <span className="an-chip__val">{f1(xpts)}</span>
          </span>
        )}
      </div>

      {prob && (
        <div className="an-prob">
          {/* Полоса — ВИЗУАЛЬНАЯ пропорция (читается как «примерно»), без печатных
              процентов: точный «67%» из двойного Пуассона по двум xG на ~5–10
              моментах создаёт ложную точность. */}
          <div className="an-prob__bar" role="img"
            aria-label={`По xG исход примерно: победа ${pct(prob.win)}%, ничья ${pct(prob.draw)}%, поражение ${pct(prob.loss)}%`}>
            {prob.win > 0.04 && <div className="an-prob__seg an-prob__seg--win" style={{ width: `${pct(prob.win)}%` }} />}
            {prob.draw > 0.04 && <div className="an-prob__seg an-prob__seg--draw" style={{ width: `${pct(prob.draw)}%` }} />}
            {prob.loss > 0.04 && <div className="an-prob__seg an-prob__seg--loss" style={{ width: `${pct(prob.loss)}%` }} />}
          </div>
          <div className="an-prob__legend">
            <span>победа</span><span>ничья</span><span>поражение</span>
          </div>
        </div>
      )}

      {dr && (
        <div className="an-deserved">
          <span className="an-chip__label">По моментам (xG):</span>
          <span className="an-deserved__score">{f1(dr.xgFor)} — {f1(dr.xgAgainst)}</span>
          {dr.luck != null && Math.abs(dr.luck) >= 1.0 && (
            <span className={`an-badge ${dr.luck > 0 ? 'an-badge--pos' : 'an-badge--neg'}`}>
              {dr.luck > 0 ? `взяли больше, чем наиграли (+${dr.luck.toFixed(1)} очка)` : `недобрали по игре (${dr.luck.toFixed(1)} очка)`}
            </span>
          )}
          {dr.luck != null && Math.abs(dr.luck) < 1.0 && (
            <span className="an-badge an-badge--neutral">результат по игре</span>
          )}
        </div>
      )}

      <div className="an-note">
        Командный xG — из отчёта SportVisor. Вероятности и ожидаемые очки — модель
        (двойной Пуассон по xG): грубая оценка того, насколько исход заслужен по
        созданным моментам, а не прогноз. На малом числе моментов — ориентир, не цифра.
      </div>
    </div>
  );
}
