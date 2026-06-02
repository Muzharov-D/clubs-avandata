import { useApi } from '../hooks/useApi';
import { fetchPlayerTrend } from '../services/api';
import { Sparkline } from './Sparkline';
import { ratingColor } from '../utils/colors';
import './PlayerTrendCard.css';

/**
 * Динамика игрока по матчам сезона (Phase 2) — суть академии: развитие во времени.
 * Спарклайны рейтингов + лента последних матчей с результатом.
 */
const LINES = [
  { key: 'overall', label: 'Общий', color: 'var(--brand-primary)' },
  { key: 'attack', label: 'Атака', color: 'var(--rating-weak)' },
  { key: 'defence', label: 'Защита', color: 'var(--rating-good)' },
];

export default function PlayerTrendCard({ playerId, series: propSeries }) {
  // Если родитель уже загрузил серию (PlayerDetail тянет trend на уровне страницы),
  // переиспользуем её и не делаем второй сетевой запрос.
  const trendRes = useApi(
    () => (propSeries ? Promise.resolve({ series: propSeries }) : playerId ? fetchPlayerTrend(playerId) : Promise.resolve(null)),
    [playerId, propSeries],
  );
  const series = trendRes.data?.series || [];
  if (trendRes.loading) return null;
  if (series.length < 2) return null; // тренд имеет смысл от 2 матчей

  return (
    <div className="card player-trend">
      <div className="page-section-title">Динамика по сезону · {series.length} матчей</div>
      <div className="player-trend__lines">
        {LINES.map((l) => {
          const vals = series.map((s) => Number(s[l.key]) || 0);
          const last = vals[vals.length - 1];
          const prev = vals.length > 1 ? vals[vals.length - 2] : last;
          const d = last - prev;
          return (
            <div className="player-trend__line" key={l.key}>
              <div className="player-trend__line-head">
                <span className="player-trend__line-label">{l.label}</span>
                <span className="player-trend__line-last" style={{ color: ratingColor(last) }}>{last.toFixed(1)}</span>
                <span className={`player-trend__line-delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}`}>
                  {d > 0.05 ? '▲' : d < -0.05 ? '▼' : '='} {d > 0 ? '+' : ''}{d.toFixed(1)}
                </span>
              </div>
              <Sparkline values={vals} width={260} height={36} color={l.color} />
            </div>
          );
        })}
      </div>
      <div className="player-trend__strip">
        {series.slice(-8).map((s) => (
          <div className={`player-trend__chip player-trend__chip--${(s.result || '').toLowerCase()}`} key={s.matchId} title={`${s.opponent} ${s.score || ''} · рейтинг ${s.overall.toFixed(1)}`}>
            <span className="player-trend__chip-res">{s.result || '–'}</span>
            <span className="player-trend__chip-rt">{s.overall ? s.overall.toFixed(1) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
