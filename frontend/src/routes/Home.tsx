import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useTenant } from '../tenant/TenantProvider';

export function HomePage() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();

  if (!user) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 20px' }}>
        <h1>Clubs · Avandata</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          SaaS-платформа для футбольных клубов. Расписание, статистика,
          состав, тренировки, push родителям — всё в одном кабинете.
        </p>
        <p>
          <Link to="/login">Войти →</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {tenant?.displayName ?? 'Платформа'} · {user.role}
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: 24 }}>
            Привет, {user.fullName ?? user.email}
          </h1>
        </div>
        <button onClick={() => void logout()} style={{ background: 'transparent', border: '1px solid var(--border)' }}>
          Выйти
        </button>
      </div>

      <div className="surface">
        <p style={{ marginTop: 0 }}>
          Каркас платформы готов. Дальше — модули:
        </p>
        <ul style={{ color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <li>Teams / Players CRUD (Фаза 2)</li>
          <li>Data providers — FFSPB / YFL / Manual (Фаза 3)</li>
          <li>Matches / Calendar / Standings (Фаза 4)</li>
          <li>Public родительский экран (Фаза 5)</li>
        </ul>
      </div>

      {user.role === 'platform_admin' && (
        <p style={{ marginTop: 20 }}>
          <Link to="/admin">→ Админ-панель</Link>
        </p>
      )}
    </div>
  );
}
