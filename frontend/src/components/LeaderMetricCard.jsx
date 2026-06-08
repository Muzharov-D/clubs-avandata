import { useNavigate } from 'react-router-dom';
import PlayerPhoto from './PlayerPhoto';
import { shortNameFromPlayer, numberWithPos } from '../utils/players';
import './LeaderMetricCard.css';

// Карточка лидера по метрике. По умолчанию — клик ведёт в профиль топ-1 игрока.
// Если передан onSelect — клик раскрывает топ-5 команды по метрике (модалка);
// тогда карточка показывает топ-1 как превью и подпись «топ-5 →».
export default function LeaderMetricCard({ label, value, suffix = '', player, locked = false, onSelect }) {
  const navigate = useNavigate();
  function go() {
    if (onSelect) { onSelect(); return; }
    if (locked) return;
    if (player?.id) navigate(`/players/${player.id}`);
  }
  const clickable = !!onSelect || !locked;
  return (
    <div
      className={'leader-card' + (locked && !onSelect ? ' leader-card--locked' : '')}
      onClick={go}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } }}
      title={!onSelect && locked ? 'Доступно только тренеру' : undefined}
    >
      <div className="leader-card__label">{label}</div>
      <div className="leader-card__body">
        {player ? (
          <>
            <PlayerPhoto player={player} size={48} />
            <div className="leader-card__info">
              <div className="leader-card__name">{shortNameFromPlayer(player) || player.shortName}</div>
              <div className="leader-card__pos">{numberWithPos(player.number, player.positionFull || player.position)}</div>
            </div>
          </>
        ) : (
          <div className="leader-card__empty">Нет данных</div>
        )}
        <div className="leader-card__value">
          {value === null || value === undefined
            ? '—'
            // Целые группируем разрядами (36348 → «36 348»); дроби не трогаем,
            // чтобы не получить запятую вместо точки (правило «дроби с точкой»).
            : (typeof value === 'number' && Number.isInteger(value) ? value.toLocaleString('ru-RU') : value)}{suffix}
        </div>
      </div>
      {onSelect && <div className="leader-card__more">топ-5 →</div>}
    </div>
  );
}
