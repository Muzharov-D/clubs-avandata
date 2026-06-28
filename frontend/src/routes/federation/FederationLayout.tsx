import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';
import { FedYearProvider, YearFilter, DivisionFilter } from './avYear';
import './federation.css';

interface FedAuth { user: { fullName?: string; email?: string } | null; logout: () => void }

/** Бейдж свежести региональных данных (синки гоняются вручную → могут протухнуть).
 *  Дата последнего снимка; краснеет, если данные старше 14 дней. Глобально, в подвале сайдбара. */
function FreshnessBadge() {
  const { data } = useQuery({
    queryKey: ['federation', 'freshness'],
    queryFn: () => api<{ capturedAt: string | null; ageDays: number | null; stale: boolean }>('/federation/freshness'),
    staleTime: 5 * 60_000,
  });
  if (!data || data.capturedAt == null) return null;
  const date = new Date(data.capturedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <div
      className={`fed-freshness${data.stale ? ' fed-freshness--stale' : ''}`}
      title={`Последний снимок региональных данных: ${date}${data.ageDays != null ? ` · ${data.ageDays} дн. назад` : ''}`}
    >
      <span className="fed-freshness__dot" />
      {data.stale ? `Данные устарели · ${data.ageDays} дн.` : `Данные: ${date}`}
    </div>
  );
}

const TABS: Array<{ to: string; end?: boolean; label: string }> = [
  { to: '/federation', end: true, label: 'Обзор' },
  { to: '/federation/talent-loss', label: 'Кого теряет регион' },
  { to: '/federation/talent', label: 'Таланты' },
  { to: '/federation/clubs', label: 'Клубы' },
  { to: '/federation/second-league', label: 'Вторая лига' },
];

export function FederationLayout() {
  const { user, logout } = useAuth() as FedAuth;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Обзор и «Потеря таланта» — сравнительные/обзорные экраны: год/лигу там нечем резать
  // (перепись, перекос по когортам и минуты — региональные/по-квартальные, без годового
  // среза в данных) → фильтр-бар на них НЕ показываем, чтобы не было мёртвых контролов.
  // Срезы по году/лиге — на drill-down экранах «Таланты» и «Клубы».
  const noFilters = /\/federation\/?$/.test(pathname) || pathname.includes('/talent-loss') || pathname.includes('/second-league');
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
          <Link to="/federation" className="fed-sidebar__brand" aria-label="АванData">
            <img src="/brand/logo-dark.svg" alt="АванData" className="fed-sidebar__logo" />
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
            <FreshnessBadge />
            <span className="fed-sidebar__who">{who}</span>
            <button className="fed-sidebar__out" onClick={handleLogout}>Выйти</button>
          </div>
          <img src="/brand/weeb.svg" alt="" aria-hidden="true" className="fed-sidebar__weeb" />
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
