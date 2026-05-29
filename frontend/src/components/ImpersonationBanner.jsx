import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { exitImpersonation, logout } from '../services/api';
import './ImpersonationBanner.css';

/**
 * Плашка режима «просмотр клуба» (platform_admin вошёл в клуб через админку).
 * Видна только при user.impersonating. Кнопка возвращает в админку (refresh по
 * admin-cookie вернёт платформенный токен).
 */
export default function ImpersonationBanner() {
  const { user, tenant } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user?.impersonating) return null;

  const exit = async () => {
    setBusy(true);
    try {
      await exitImpersonation();
      window.location.href = '/admin';
    } catch {
      // refresh не сработал — выходим начисто
      logout();
      window.location.href = '/login';
    }
  };

  return (
    <div className="imp-banner" role="status">
      <span className="imp-banner__text">
        👁 Просмотр клуба <b>{tenant?.displayName || tenant?.name || ''}</b> с мастер-аккаунта
      </span>
      <button className="imp-banner__exit" onClick={exit} disabled={busy}>
        {busy ? 'Выход…' : 'Вернуться в админку'}
      </button>
    </div>
  );
}
