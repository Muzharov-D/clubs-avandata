import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import PushOptInButton from './PushOptInButton';
import EffectsToggle from './EffectsToggle';
import ConstructorToggle from '../constructor/ConstructorToggle';
import ChangePasswordModal from './ChangePasswordModal';
import { toast } from './Toast';
import './AppHeader.css';

const ROLE_LABELS = {
  head_coach: 'Главный тренер',
  team_coach: 'Тренер команды',
  sporting_director: 'Спортивный директор',
  player: 'Игрок',
};

export default function AppHeader() {
  const { user, logout } = useAuth();
  const { teams, selectedTeam, selectedTeamId, select } = useTeam();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    toast.info('Вы вышли из системы');
    navigate('/login', { replace: true });
  }
  // Спортдиректор тоже видит весь клуб → даём переключатель команд (для командных экранов).
  const canSwitch = user?.role === 'head_coach' || user?.role === 'sporting_director';
  const activeTeams = (teams || []).filter((t) => t.active && t.isOurTeam !== false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className={'app-header' + (mobileMenuOpen ? ' app-header--menu-open' : '')}>
      <div className="app-header__left">
        <img
          src="/assets/logos/log-3_white.png"
          alt="АванDата"
          className="app-header__brand-logo"
        />
      </div>
      <button
        className="app-header__burger"
        aria-label="Меню"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>
      <div className="app-header__right">
        {user && (
          <div className="app-header__user">
            <div className="app-header__user-name">{user.fullName}</div>
            <div className="app-header__user-role">
              {ROLE_LABELS[user.role] || user.role || ''}
            </div>
          </div>
        )}
        {user && (
          <button
            className="app-header__btn"
            onClick={() => { closeMenu(); setShowChangePassword(true); }}
            title="Сменить пароль"
          >🔒 Пароль</button>
        )}
        {user && (
          <button
            className="app-header__btn app-header__btn--logout"
            onClick={() => { closeMenu(); handleLogout(); }}
            title="Выйти"
          >Выход</button>
        )}
        <div className={'app-header__team-selector' + (canSwitch ? ' app-header__team-selector--switchable' : '')}>
          {canSwitch && activeTeams.length > 1 ? (
            <select
              className="app-header__team-select"
              value={selectedTeamId || ''}
              onChange={(e) => { select(e.target.value); closeMenu(); }}
              aria-label="Выбрать команду"
            >
              {activeTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.ageGroup ? ` · ${t.ageGroup}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="app-header__team-name" title="Текущая команда">
              {selectedTeam?.name
                ? selectedTeam.name + (selectedTeam.ageGroup ? ` · ${selectedTeam.ageGroup}` : '')
                : (activeTeams.length === 0 ? 'Команды не созданы' : '—')}
            </span>
          )}
        </div>
        <ConstructorToggle />
        <PushOptInButton />
        <EffectsToggle />
        <button
          className="app-header__btn app-header__btn--refresh"
          onClick={() => window.location.reload()}
          title="Перечитать данные с сервера"
          aria-label="Обновить"
        >↻</button>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </header>
  );
}
