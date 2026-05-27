import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';

export function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh' }}>
      <aside
        style={{
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 18 }}>
          <Link to="/admin" style={{ color: 'var(--text)' }}>
            Avandata Admin
          </Link>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavLink to="/admin" end style={navStyle}>
            Клубы
          </NavLink>
          <NavLink to="/admin/tenants/new" style={navStyle}>
            + Добавить клуб
          </NavLink>
        </nav>

        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          <div>{user?.email}</div>
          <button
            onClick={() => void logout()}
            style={{
              marginTop: 8,
              background: 'transparent',
              border: '1px solid var(--border)',
              padding: '6px 10px',
              fontSize: 12,
              width: '100%',
            }}
          >
            Выйти
          </button>
        </div>
      </aside>

      <main style={{ padding: 32 }}>
        <Outlet />
      </main>
    </div>
  );
}

function navStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    color: isActive ? '#fff' : 'var(--text-muted)',
    background: isActive ? 'var(--brand-primary)' : 'transparent',
    textDecoration: 'none',
    fontSize: 14,
  };
}
