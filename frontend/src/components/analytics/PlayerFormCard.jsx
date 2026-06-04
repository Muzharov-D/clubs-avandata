/**
 * Форма игрока: взвешенный по свежести индекс последних матчей, отклонение от
 * своего сезонного среднего, горячая/холодная серия и траектория развития.
 * Покрывает критику 17/27, улучшения 45/47, вау 76/91.
 */
import { useApi } from '../../hooks/useApi';
import { fetchPlayerTrend } from '../../services/api';
import { formIndex, seasonMean, trajectorySlope, streak } from '../../utils/analytics';
import './analytics.css';

export default function PlayerFormCard({ playerId, series: propSeries }) {
  // Переиспользуем серию, если родитель её уже загрузил (см. PlayerTrendCard).
  const res = useApi(
    () => (propSeries ? Promise.resolve({ series: propSeries }) : fetchPlayerTrend(playerId)),
    [playerId, propSeries],
  );
  const series = res.data?.series || [];
  const rated = series.filter((s) => Number(s?.overall) > 0);
  if (rated.length < 3) return null;

  const form = formIndex(rated, 'overall', 5);
  const mean = seasonMean(rated, 'overall');
  const slope = trajectorySlope(rated, 'overall');
  const st = streak(rated, 'overall');
  if (form == null) return null;

  const delta = mean != null ? form - mean : null;
  const trend = slope == null ? null : slope > 0.04 ? 'растёт' : slope < -0.04 ? 'снижается' : 'стабильна';

  return (
    <div className="card an">
      <div className="page-section-title">Форма <span className="an-model-tag">последние {Math.min(5, rated.length)} матчей</span></div>
      <div className="an-form__row">
        <div>
          <div className="an-form__big">{form.toFixed(2)}</div>
          <div className="an-metric__sub">индекс формы (свежие матчи весомее)</div>
        </div>
        {delta != null && (
          <div>
            <div className={`an-form__delta an-form__delta--${delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : ''}`}>
              {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}{delta.toFixed(2)}
            </div>
            <div className="an-metric__sub">к своему среднему {mean.toFixed(2)}</div>
          </div>
        )}
      </div>
      <div className="an-chips" style={{ marginTop: 10 }}>
        {st && (
          <span className={`an-chip ${st.hot ? 'an-chip--pos' : 'an-chip--neg'}`}>
            <span className="an-chip__val">{st.hot ? '🔥' : '❄️'} {st.count} {plural(st.count, 'матч', 'матча', 'матчей')}</span>
            <span className="an-chip__label">{st.hot ? 'в форме' : 'спад'}</span>
          </span>
        )}
        {trend && (
          <span className="an-chip">
            <span className="an-chip__label">траектория сезона</span>
            <span className="an-chip__val">{trend}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
