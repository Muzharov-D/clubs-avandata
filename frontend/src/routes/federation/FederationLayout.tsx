import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import { FedYearProvider, YearFilter } from './avYear';
import './avandata.css';

interface FedAuth { user: { fullName?: string; email?: string } | null; logout: () => void }

const TABS: Array<{ to: string; end?: boolean; label: string }> = [
  { to: '/federation', end: true, label: 'Когорты' },
  { to: '/federation/overview', label: 'Обзор' },
  { to: '/federation/clubs', label: 'Сила клубов' },
  { to: '/federation/compare', label: 'Сравнение' },
  { to: '/federation/players', label: 'Игроки' },
  { to: '/federation/insights', label: 'Открытия' },
];

/**
 * Оболочка кабинета в языке AvanData: ВЕРХНИЙ нав (полная ширина под контент) +
 * брендовый волновой фон + фильтр возрастов (год рождения), общий для всех экранов.
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
    <FedYearProvider>
      <div className="av-root">
        <div className="av-bg" aria-hidden />
        <div className="av-app">
          <header className="av-topbar">
            <Link to="/federation" className="av-brand">
              <img src="/brand/avandata-logo.png" alt="AvanData" />
              <div>
                <div className="av-brand__name">Avan<b>Data</b></div>
                <div className="av-brand__sub">Футбол Петербурга</div>
              </div>
            </Link>
            <nav className="av-topnav" aria-label="Разделы">
              {TABS.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `av-tab${isActive ? ' av-tab--active' : ''}`}>
                  {t.label}
                </NavLink>
              ))}
            </nav>
            <div className="av-topbar__right">
              <span className="av-topbar__who" title={who}>{who}</span>
              <button className="av-logout" onClick={handleLogout}>Выйти</button>
            </div>
          </header>

          <div className="av-subbar">
            <YearFilter />
          </div>

          <main className="av-content">
            <div className="av-page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </FedYearProvider>
  );
}
