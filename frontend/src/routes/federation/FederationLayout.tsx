import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
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
];

export function FederationLayout() {
  const { user, logout } = useAuth() as FedAuth;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Обзор и «Потеря таланта» — сравнительные/обзорные экраны: год/лигу там нечем резать
  // (перепись, перекос по когортам и минуты — региональные/по-квартальные, без годового
  // среза в данных) → фильтр-бар на них НЕ показываем, чтобы не было мёртвых контролов.
  // Срезы по году/лиге — на drill-down экранах «Таланты» и «Клубы».
  const noFilters = /\/federation\/?$/.test(pathname) || pathname.includes('/talent-loss');
  function handleLogout() {
    logout();
    toast.info('Вы вышли из кабинета');
    navigate('/login', { replace: true });
  }
  const who = user?.fullName || user?.email || 'Федерация';

  return (
    <FedYearProvider>
      <div className="fed-root">
        <aside className="fed-sidebar">
          <Link to="/federation" className="fed-sidebar__brand">
            Avan<span>Data</span>
          </Link>
          <nav className="fed-sidebar__nav" aria-label="Разделы">
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
          <div className="fed-sidebar__foot">
            <span className="fed-sidebar__who">{who}</span>
            <button className="fed-sidebar__out" onClick={handleLogout}>Выйти</button>
          </div>
        </aside>

        <div className="fed-main">
          {!noFilters && (
            <div className="fed-filter">
              <DivisionFilter />
              <YearFilter />
            </div>
          )}

          <main className="fed-page">
            <Suspense fallback={<div className="fed-skeleton" style={{ height: 400 }} />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </FedYearProvider>
  );
}
