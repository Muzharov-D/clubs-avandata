import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import './AdminLayout.css';

interface LegacyAuthUser {
  email?: string;
  fullName?: string;
  username?: string;
  role?: string;
}

const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Супер-админ',
  head_coach: 'Главный тренер',
  team_coach: 'Тренер команды',
  player: 'Игрок',
};

export function AdminLayout() {
  const { user, logout } = useAuth() as { user: LegacyAuthUser | null; logout: () => void };
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    toast.info('Вы вышли из админки');
    navigate('/login', { replace: true });
  }

  const displayName = user?.fullName || user?.email || user?.username || 'Без имени';
  const roleLabel = user?.role ? (ROLE_LABELS[user.role] || user.role) : 'admin';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-sidebar__brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <img src="/icons/avandata.png" alt="Avandata" className="admin-sidebar__brand-logo" />
          <div>
            <div className="admin-sidebar__brand-name">Avandata</div>
            <div className="admin-sidebar__brand-sub">Админ-консоль</div>
          </div>
        </Link>

        <nav className="admin-sidebar__nav" aria-label="Главное меню админки">
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
          <Link to="/" className="admin-sidebar__link" style={{ marginTop: 'auto', opacity: 0.7 }}>
            <SvgIcon path="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6" />
            Открыть лендинг
          </Link>
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__user">
            <div className="admin-sidebar__user-name" title={displayName}>{displayName}</div>
            <div className="admin-sidebar__user-role">{roleLabel}</div>
          </div>
          <button onClick={handleLogout} className="admin-sidebar__logout">
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
