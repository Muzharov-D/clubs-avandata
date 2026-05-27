import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './SidebarNav.css';

export default function SidebarNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isPlayer, isCoach } = useAuth();

  // Аналитика и список Игроков — только тренеру (игроку нечего смотреть
  // в командных топах, MOTM и pivot-аналитике, по контракту он видит
  // только себя).
  const navItems = [
    { id: 'club',      label: 'Мой КЛУБ',  path: '/club',      icon: '🏆' },
    isCoach
      ? { id: 'analytics', label: 'Аналитика', path: '/analytics', icon: '◉' }
      : null,
    { id: 'matches',   label: 'Матч',      path: '/matches',   icon: '⚽' },
    { id: 'calendar',  label: 'Календарь', path: '/calendar',  icon: '📅' },
    isCoach
      ? { id: 'trainings', label: 'Тренировки', path: '/trainings', icon: '🎯' }
      : null,
    isPlayer && user?.playerId
      ? { id: 'me', label: 'Мой профиль', path: `/players/${user.playerId}`, icon: '👤' }
      : { id: 'players', label: 'Игроки', path: '/players', icon: '👤' },
  ].filter(Boolean);

  function isActive(item) {
    if (item.id === 'club')      return pathname === '/club' || pathname === '/';
    if (item.id === 'analytics') return pathname.startsWith('/analytics');
    if (item.id === 'matches')   return pathname.startsWith('/matches');
    if (item.id === 'calendar')  return pathname.startsWith('/calendar');
    if (item.id === 'trainings') return pathname.startsWith('/trainings');
    if (item.id === 'me')        return pathname === item.path;
    if (item.id === 'players')   return pathname.startsWith('/players');
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
        >
          <span className="sidebar-nav__icon">{it.icon}</span>
          <span className="sidebar-nav__label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
