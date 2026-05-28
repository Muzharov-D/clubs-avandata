import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './AdminLayout.css';

interface LegacyAuthUser {
  email?: string;
  fullName?: string;
  username?: string;
  role?: string;
}

export function AdminLayout() {
  const { user, logout } = useAuth() as { user: LegacyAuthUser | null; logout: () => void };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-sidebar__brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <img src="/icons/avandata.png" alt="Avandata" className="admin-sidebar__brand-logo" />
          <div>
            <div className="admin-sidebar__brand-name">Avandata</div>
            <div className="admin-sidebar__brand-sub">Admin Console</div>
          </div>
        </Link>

        <nav className="admin-sidebar__nav">
          <div className="admin-sidebar__section-title">Платформа</div>
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => `admin-sidebar__link${isActive ? ' admin-sidebar__link--active' : ''}`}
          >
            <SvgIcon path="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
            Клубы
          </NavLink>
          <NavLink
            to="/admin/tenants/new"
            className={({ isActive }) => `admin-sidebar__link${isActive ? ' admin-sidebar__link--active' : ''}`}
          >
            <SvgIcon path="M12 5v14M5 12h14" />
            Добавить клуб
          </NavLink>
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__user">
            <div className="admin-sidebar__user-name">{user?.fullName ?? user?.email ?? '—'}</div>
            <div className="admin-sidebar__user-role">{user?.role ?? 'admin'}</div>
          </div>
          <button onClick={() => void logout()} className="admin-sidebar__logout">
            Выйти
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

function SvgIcon({ path }: { path: string }) {
  return (
    <svg className="admin-sidebar__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}
