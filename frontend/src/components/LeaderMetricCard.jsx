import { useNavigate } from 'react-router-dom';
import PlayerPhoto from './PlayerPhoto';
import { shortNameFromPlayer } from '../utils/players';
import './LeaderMetricCard.css';

export default function LeaderMetricCard({ label, value, suffix = '', player, locked = false }) {
  const navigate = useNavigate();
  function go() {
    if (locked) return;
    if (player?.id) navigate(`/players/${player.id}`);
  }
  return (
    <div
      className={'leader-card' + (locked ? ' leader-card--locked' : '')}
      onClick={go}
      role={locked ? undefined : 'button'}
      title={locked ? 'Доступно только тренеру' : undefined}
    >
      <div className="leader-card__label">{label}</div>
      <div className="leader-card__body">
        {player ? (
          <>
            <PlayerPhoto player={player} size={48} />
            <div className="leader-card__info">
              <div className="leader-card__name">{shortNameFromPlayer(player) || player.shortName}</div>
              <div className="leader-card__pos">№{player.number} · {player.positionFull || player.position}</div>
            </div>
          </>
        ) : (
          <div className="leader-card__empty">Нет данных</div>
        )}
        <div className="leader-card__value">
          {value === null || value === undefined ? '—' : value}{suffix}
        </div>
      </div>
    </div>
  );
}
