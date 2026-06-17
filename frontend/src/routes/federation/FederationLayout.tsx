import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import './avandata.css';

interface FedAuth {
  user: { fullName?: string; email?: string } | null;
  federation: { name?: string } | null;
  logout: () => void;
}
interface NavItem { to: string; end?: boolean; label: string; icon: string }

const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Первенство',
    items: [
      { to: '/federation', end: true, label: 'Обзор', icon: 'M3 13h2l2-7 4 15 3-9 2 5h5' },
      { to: '/federation/compare', label: 'Сравнение турниров', icon: 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4zM15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4zM12 3v18' },
    ],
  },
  {
    title: 'Талант',
    items: [
      { to: '/federation/players', label: 'Игроки', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87' },
      { to: '/federation/insights', label: 'Открытия региона', icon: 'M12 2a7 7 0 0 0-4 12.6c.6.5 1 1.2 1 2V17h6v-.4c0-.8.4-1.5 1-2A7 7 0 0 0 12 2zM9 21h6M10 18h4' },
    ],
  },
];

/**
 * Оболочка кабинета федерации в дизайн-языке AvanData: брендовый волновой фон,
 * стеклянная навигация, премиальный спорт-терминал. Данные — реальное Первенство
 * СПб (прокси к back.avandata.ru). Авторизация/логаут прежние.
 */
export function FederationLayout() {
  const { user, logout } = useAuth() as FedAuth;
  const navigate = useNavigate();
  function handleLogout() {
    logout();
    toast.info('Вы вышли из кабинета');
    navigate('/login', { replace: true });
  }
  const who = user?.fullName || user?.email || 'Федерация';

  return (
    <div className="av-root">
      <div className="av-bg" aria-hidden />
      <div className="av-shell">
        <aside className="av-aside">
          <Link to="/federation" className="av-brand">
            <img src="/brand/avandata-logo.png" alt="AvanData" />
            <div style={{ minWidth: 0 }}>
              <div className="av-brand__name">Avan<b>Data</b></div>
              <div className="av-brand__sub">Футбол Петербурга</div>
            </div>
          </Link>

          <nav className="av-nav" aria-label="Меню">
            {NAV.map((g) => (
              <div key={g.title}>
                <div className="av-nav__group">{g.title}</div>
                {g.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.end}
                    className={({ isActive }) => `av-nav__link${isActive ? ' av-nav__link--active' : ''}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d={it.icon} />
                    </svg>
                    <span>{it.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="av-aside__foot">
            <div className="av-aside__who" title={who}>{who}</div>
            <button className="av-logout" onClick={handleLogout}>Выйти</button>
          </div>
        </aside>

        <main className="av-main">
          <div className="av-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
