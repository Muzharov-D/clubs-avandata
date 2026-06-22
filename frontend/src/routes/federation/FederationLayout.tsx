import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import { FedYearProvider, YearFilter, DivisionFilter } from './avYear';
import './avandata.css';

interface FedAuth { user: { fullName?: string; email?: string } | null; logout: () => void }

// Ровно 4 раздела (директива регулятора): без дублей, каждый — полный экран.
const TABS: Array<{ to: string; end?: boolean; label: string }> = [
  { to: '/federation', end: true, label: 'Обзор' },
  { to: '/federation/talent-loss', label: 'Потеря таланта' },
  { to: '/federation/talent', label: 'Таланты' },
  { to: '/federation/clubs', label: 'Клубы' },
];

/**
 * Оболочка кабинета (дизайн-язык клубного фронта): верхний нав + CSS-glow фон +
 * фильтр по году рождения, общий для всех экранов. Названия — чёткие, не эфемерные.
 */
export function FederationLayout() {
  const { user, logout } = useAuth() as FedAuth;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Когорта (год рождения) применима к 3 экранам; на «Обзоре» (перепись + вердикты)
  // когортного среза нет — фильтры там скрыты, чтобы не вводить в заблуждение.
  const onIndex = /\/federation\/?$/.test(pathname);
  const showYear = !onIndex;
  // Дивизион значим там, где данные режутся по лиге (Таланты — рейтинг/лидерборд,
  // Клубы — сила лиг/таблица). На «Потере таланта» срез по дате рождения, не по лиге.
  const showDivision = /\/federation\/(talent|clubs)$/.test(pathname);
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

          {showYear && (
            <div className="av-subbar">
              {showDivision && <DivisionFilter />}
              <YearFilter />
            </div>
          )}

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
