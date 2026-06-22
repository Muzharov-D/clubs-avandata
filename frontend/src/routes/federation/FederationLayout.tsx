import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import { FedYearProvider, YearFilter, DivisionFilter } from './avYear';
import './federation.css';

interface FedAuth { user: { fullName?: string; email?: string } | null; logout: () => void }

const TABS: Array<{ to: string; end?: boolean; label: string }> = [
  { to: '/federation', end: true, label: 'Обзор' },
  { to: '/federation/talent-loss', label: 'Потеря таланта' },
  { to: '/federation/talent', label: 'Таланты' },
  { to: '/federation/clubs', label: 'Клубы' },
  { to: '/federation/leagues', label: 'Управление лигами' },
];

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
      <div className="fed-root">
        <header className="fed-bar">
          <Link to="/federation" className="fed-bar__brand">
            Avan<span>Data</span>
          </Link>
          <nav className="fed-bar__nav" aria-label="Разделы">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => `fed-tab${isActive ? ' fed-tab--active' : ''}`}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <span className="fed-bar__who">{who}</span>
          <button className="fed-bar__out" onClick={handleLogout}>Выйти</button>
        </header>

        <div className="fed-filter">
          <DivisionFilter />
          <YearFilter />
        </div>

        <main className="fed-page">
          <Suspense fallback={<div className="fed-skeleton" style={{ height: 400 }} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </FedYearProvider>
  );
}
