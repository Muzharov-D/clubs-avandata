import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Защищает приватные роуты. Особенности:
 *  - Показывает спиннер на время `loading` (с таймаутом 8с → fallback на /login).
 *  - При отсутствии user → редирект на /login с сохранением исходного маршрута.
 *  - При несоответствии роли → редирект на /club (cabin клуба, без `/analytics`-кика).
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!loading) { setStuck(false); return; }
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    if (stuck) {
      return (
        <div className="empty-state" style={{ flexDirection: 'column', gap: 14 }}>
          <div>Не удаётся проверить авторизацию.</div>
          <button
            onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#22d3ee', color: '#0a1020', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Сбросить сессию и войти заново
          </button>
        </div>
      );
    }
    return <div className="empty-state">Проверка авторизации…</div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && roles.length && !roles.includes(user.role)) {
    return <Navigate to="/club" replace />;
  }
  return children;
}
