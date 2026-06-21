import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import { FedYearProvider, YearFilter, DivisionFilter } from './avYear';
import './avandata.css';

interface FedAuth { user: { fullName?: string; email?: string } | null; logout: () => void }

const TABS: Array<{ to: string; end?: boolean; label: string }> = [
  { to: '/federation', end: true, label: 'Обзор региона' },
  { to: '/federation/discoveries', label: 'Открытия региона' },
  { to: '/federation/region-map', label: 'Карта региона' },
  { to: '/federation/pyramid', label: 'Пирамида лиг' },
  { to: '/federation/age-effect', label: 'Возрастной эффект' },
  { to: '/federation/opportunity', label: 'Карта возможностей' },
  { to: '/federation/scorers', label: 'Бомбардиры' },
  { to: '/federation/best-xi', label: 'Сборная региона' },
  { to: '/federation/talent-production', label: 'Производство талантов' },
  { to: '/federation/players', label: 'Лучшие игроки' },
  { to: '/federation/fairness', label: 'Эффект возраста' },
  { to: '/federation/loss-map', label: 'Потери' },
  { to: '/federation/clubs', label: 'Клубы' },
  { to: '/federation/compare', label: 'Турниры' },
];

/**
 * Оболочка кабинета (дизайн-язык клубного фронта): верхний нав + CSS-glow фон +
 * фильтр по году рождения, общий для всех экранов. Названия — чёткие, не эфемерные.
 */
export function FederationLayout() {
  const { user, logout } = useAuth() as FedAuth;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Дивизион инертен на телескопе когорт (region-wide) и на сравнении турниров (там лиги уже рядом).
  const showDivision = !/\/federation\/(cohorts|compare)$/.test(pathname);
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
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `av-navtab${isActive ? ' av-navtab--active' : ''}`}>
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
            {showDivision && <DivisionFilter />}
            <YearFilter />
          </div>

          <main className="av-content">
            <div className="av-page">
              <Suspense fallback={<div className="av-skeleton" style={{ height: 400 }} />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </FedYearProvider>
  );
}
