import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardLayout } from '../constructor/DashboardLayoutContext';
import './SidebarNav.css';

export default function SidebarNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isPlayer, isCoach, isHeadCoach, tenant } = useAuth();
  const { isVisible } = useDashboardLayout();
  // На free тариф — только аналитический core. Календарь / Тренировки / Нагрузка
  // — платные модули, в меню не показываем (и роуты закрыты, см. App.tsx).
  const isPaidPlan = tenant?.plan === 'paid';

  // Аналитика и список Игроков — только тренеру (игроку нечего смотреть
  // в командных топах, MOTM и pivot-аналитике, по контракту он видит только себя).
  // Старший тренер (включая бывшего спортдиректора — роли слиты) видит весь клуб:
  // единый кабинет «Обзор клуба» + те же командные экраны.
  const navItems = [
    // Старший тренер: единый клубный кабинет над командными экранами.
    isHeadCoach
      ? { id: 'hub', label: 'Обзор клуба', path: '/club-hub', icon: '🏛️' }
      : null,
    { id: 'club',      label: isHeadCoach ? 'Команда' : 'Клуб', path: '/club', icon: '🏆' },
    // Lite — упрощённый разбор игрока по амплуа (6 осей, 3 главных).
    isCoach
      ? { id: 'lite', label: 'Разбор игрока', path: '/lite', icon: '🎯' }
      : null,
    isCoach
      ? { id: 'analytics', label: 'Аналитика', path: '/analytics', icon: '◉' }
      : null,
    { id: 'matches',   label: 'Матчи',      path: '/matches',   icon: '⚽' },
    isPaidPlan
      ? { id: 'calendar',  label: 'Календарь',  path: '/calendar',  icon: '📅' }
      : null,
    isCoach && isPaidPlan
      ? { id: 'trainings', label: 'Тренировки', path: '/trainings', icon: '🎯' }
      : null,
    isPlayer && user?.playerId
      ? { id: 'me', label: 'Мой профиль', path: `/players/${user.playerId}`, icon: '👤' }
      : isCoach
        ? { id: 'players', label: 'Игроки', path: '/players', icon: '👤' }
        : null,
    isCoach && isPaidPlan
      ? { id: 'load', label: 'Нагрузка', path: '/load', icon: '🏃' }
      : null,
  ].filter(Boolean)
    // Конструктор: тренер может спрятать любой пункт меню (раздел «Левое меню»).
    .filter((it) => isVisible('nav', it.id));

  function isActive(item) {
    if (item.id === 'hub')       return pathname.startsWith('/club-hub');
    if (item.id === 'director')  return pathname.startsWith('/director');
    if (item.id === 'club')      return pathname === '/club' || pathname === '/';
    if (item.id === 'lite')      return pathname.startsWith('/lite');
    if (item.id === 'analytics') return pathname.startsWith('/analytics');
    if (item.id === 'matches')   return pathname.startsWith('/matches');
    if (item.id === 'calendar')  return pathname.startsWith('/calendar');
    if (item.id === 'trainings') return pathname.startsWith('/trainings');
    if (item.id === 'me')        return pathname === item.path;
    if (item.id === 'players')   return pathname.startsWith('/players');
    if (item.id === 'load')      return pathname.startsWith('/load');
    return false;
  }

  return (
    <nav className="sidebar-nav">
      {navItems.map((it) => (
        <button
          key={it.id}
          data-nav-id={it.id}
          className={`sidebar-nav__item ${isActive(it) ? 'sidebar-nav__item--active' : ''}`}
          onClick={() => navigate(it.path)}
          title={it.label}
          aria-label={it.label}
          aria-current={isActive(it) ? 'page' : undefined}
        >
          <span className="sidebar-nav__icon">{it.icon}</span>
          <span className="sidebar-nav__label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
