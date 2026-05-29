import { useApi } from '../hooks/useApi';
import { fetchPlayersSeason } from '../services/api';
import { predictLineup } from '../utils/lineup';
import { playerLabel } from '../utils/players';
import './PredictedLineup.css';

/**
 * Прогноз стартового состава (Phase 5) — эвристика по сезонным минутам и рейтингу.
 * Подсказка тренеру на следующий матч, не догма.
 */
export default function PredictedLineup({ teamId }) {
  const res = useApi(() => (teamId ? fetchPlayersSeason(teamId) : Promise.resolve(null)), [teamId]);
  const players = res.data?.players || [];
  if (res.loading || players.length < 11) return null;

  const { starters, bench } = predictLineup(players);
  if (!starters.length) return null;

  return (
    <div className="card predicted-lineup">
      <div className="page-section-title">Вероятный стартовый состав</div>
      <div className="predicted-lineup__sub">По минутам и среднему рейтингу за сезон</div>
      <div className="predicted-lineup__grid">
        {starters.map((p) => (
          <div className="pl-player" key={p.id} title={`${p.minutesPerMatch} мин/матч · рейтинг ${p.avgOverall}`}>
            <span className="pl-player__num">{p.number ?? '—'}</span>
            <span className="pl-player__name">{playerLabel(p)}</span>
            <span className="pl-player__pos">{p.position || ''}</span>
          </div>
        ))}
      </div>
      {bench.length > 0 && (
        <div className="predicted-lineup__bench">
          <span className="predicted-lineup__bench-label">Скамейка:</span>
          {bench.map((p) => (
            <span className="pl-bench-chip" key={p.id}>{playerLabel(p)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
