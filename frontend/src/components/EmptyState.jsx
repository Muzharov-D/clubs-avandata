// Empty-state блок: иконка + заголовок + опциональная подпись + опциональный CTA.
// Используется когда список пустой (нет матчей, нет тренировок и т.п.).

import './EmptyState.css';

export default function EmptyState({
  icon = '⚽',
  title = 'Пока пусто',
  subtitle,
  action,
}) {
  return (
    <div className="empty-state-card">
      <div className="empty-state-card__icon" aria-hidden>{icon}</div>
      <div className="empty-state-card__title">{title}</div>
      {subtitle && <div className="empty-state-card__sub">{subtitle}</div>}
      {action && <div className="empty-state-card__action">{action}</div>}
    </div>
  );
}
