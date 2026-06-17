import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import './federation.css';

interface FedAuth {
  user: { fullName?: string; email?: string } | null;
  federation: { name?: string } | null;
  logout: () => void;
}
interface NavItem { to?: string; end?: boolean; label: string; icon: string; soon?: string }

const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Первенство · реальные данные',
    items: [
      { to: '/federation/live', label: 'Обзор Первенства', icon: 'M3 13h2l2-8 4 16 3-10 2 4h4' },
      { to: '/federation/compare', label: 'Сравнение турниров', icon: 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4zM15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4zM12 3v18' },
      { to: '/federation/live/players', label: 'Игроки (реальные)', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87' },
    ],
  },
  {
    title: 'Обзор',
    items: [
      { to: '/federation/map', label: 'Карта региона', icon: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15' },
      { to: '/federation', end: true, label: 'Открытия региона', icon: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.6c.6.5 1 1.2 1 2V17h6v-.4c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z' },
      { to: '/federation/summary', label: 'Сводка', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10' },
      { to: '/federation/clubs', label: 'Клубы', icon: 'M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7l8-4z' },
      { to: '/federation/competitions', label: 'Соревнования', icon: 'M7 4h10v4a5 5 0 0 1-10 0V4zM5 6H3v1a3 3 0 0 0 3 3m12-4h2v1a3 3 0 0 1-3 3M9 21h6M12 14v7' },
      { to: '/federation/scorers', label: 'Бомбардиры', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
    ],
  },
  {
    title: 'Качество',
    items: [
      { to: '/federation/data-quality', label: 'Целостность данных', icon: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7' },
      { to: '/federation/benchmark', label: 'Бенчмаркинг', icon: 'M4 20V10M10 20V4M16 20v-7M2 20h20' },
    ],
  },
  {
    title: 'Талант и развитие',
    items: [
      { to: '/federation/talent', label: 'Игроки', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87' },
      { to: '/federation/leaderboards', label: 'Лидерборды', icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 6H3v1a3 3 0 0 0 3 3m12-4h2v1a3 3 0 0 1-3 3' },
      { to: '/federation/best-xi', label: 'Сборная региона', icon: 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z' },
      { to: '/federation/development', label: 'Развитие', icon: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6' },
      { to: '/federation/age-effect', label: 'Возрастной эффект', icon: 'M3 3v18h18M7 13l3-3 3 3 5-6' },
    ],
  },
];

/**
 * Оболочка кабинета федерации (federation_admin) — read-only, тёмная тема.
 * Все цвета/тени/мотиво — токены проекта (federation.css).
 */
export function FederationLayout() {
  const { user, federation, logout } = useAuth() as FedAuth;
  const navigate = useNavigate();
  function handleLogout() {
    logout();
    toast.info('Вы вышли из кабинета федерации');
    navigate('/login', { replace: true });
  }
  const fedName = federation?.name ?? 'Кабинет региона';
  const who = user?.fullName || user?.email || 'Федерация';

  return (
    <div className="fed-shell">
      <aside className="fed-aside">
        <Link to="/federation" className="fed-brand">
          <div className="fed-brand__crest">ФФ</div>
          <div style={{ minWidth: 0 }}>
            <div className="fed-brand__name">{fedName}</div>
            <div className="fed-brand__sub">Кабинет региона</div>
          </div>
        </Link>

        <nav className="fed-nav" aria-label="Меню федерации">
          {NAV.map((g) => (
            <div key={g.title}>
              <div className="fed-nav__group">{g.title}</div>
              {g.items.map((it) =>
                it.to ? (
                  <NavLink
                    key={it.label}
                    to={it.to}
                    end={it.end}
                    className={({ isActive }) => `fed-nav__link${isActive ? ' fed-nav__link--active' : ''}`}
                  >
                    <NavIcon d={it.icon} />
                    <span>{it.label}</span>
                  </NavLink>
                ) : (
                  <div key={it.label} className="fed-nav__soon">
                    <span>{it.label}</span>
                    <span className="fed-nav__tag">{it.soon}</span>
                  </div>
                ),
              )}
            </div>
          ))}
        </nav>

        <div className="fed-aside__foot">
          <div className="fed-aside__who" title={who}>{who}</div>
          <button className="fed-aside__logout" onClick={handleLogout}>Выйти</button>
        </div>
      </aside>

      <main className="fed-main">
        <div className="fed-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
