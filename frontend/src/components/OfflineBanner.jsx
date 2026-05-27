// Маленький бейдж статуса сети. Показывается только когда оффлайн.
// Если есть lastUpdated (момент последнего успешного fetch) — показывает время.
import { useOnlineStatus } from '../hooks/useOnlineStatus';

function formatTimeAgo(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return diffMin + ' мин назад';
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return diffH + ' ч назад';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function OfflineBanner({ lastUpdated }) {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'linear-gradient(180deg, rgba(234, 88, 12, 0.95) 0%, rgba(194, 65, 12, 0.92) 100%)',
        color: '#fff',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 0.02,
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <span style={{ marginRight: 6 }}>📡</span>
      Нет связи
      {lastUpdated ? ' · данные от ' + formatTimeAgo(lastUpdated) : ''}
    </div>
  );
}
