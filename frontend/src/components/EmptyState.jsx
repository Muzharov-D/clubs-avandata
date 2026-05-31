// Empty-state блок: иконка + заголовок + опциональная подпись + опциональный CTA.
// Используется когда список пустой (нет матчей, нет тренировок и т.п.).

import './EmptyState.css';

/** Тонкая SVG-иконка «пусто» по умолчанию (вместо эмодзи). */
function DefaultIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5 12 4l9 4.5M3 8.5v7L12 20l9-4.5v-7M3 8.5 12 13l9-4.5M12 13v7" />
    </svg>
  );
}

export default function EmptyState({
  icon,
  title = 'Пока пусто',
  subtitle,
  action,
}) {
  const iconNode = icon === undefined ? <DefaultIcon /> : icon;
  return (
    <div className="empty-state-card">
      {iconNode != null && <div className="empty-state-card__icon" aria-hidden>{iconNode}</div>}
      <div className="empty-state-card__title">{title}</div>
      {subtitle && <div className="empty-state-card__sub">{subtitle}</div>}
      {action && <div className="empty-state-card__action">{action}</div>}
    </div>
  );
}
