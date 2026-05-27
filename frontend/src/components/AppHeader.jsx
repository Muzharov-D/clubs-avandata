import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import PushOptInButton from './PushOptInButton';
import ChangePasswordModal from './ChangePasswordModal';
import './AppHeader.css';

const ROLE_LABELS = {
  head_coach: 'Главный тренер',
  team_coach: 'Тренер команды',
  player: 'Игрок',
};

export default function AppHeader() {
  const { user, logout } = useAuth();
  const { teams, selectedTeam, selectedTeamId, select } = useTeam();
  const canSwitch = user?.role === 'head_coach';
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
            onClick={() => { closeMenu(); logout(); }}
            title="Выйти"
          >Выход</button>
        )}
        <div className={'app-header__team-selector' + (canSwitch ? ' app-header__team-selector--switchable' : '')}>
          {canSwitch ? (
            <select
              className="app-header__team-select"
              value={selectedTeamId || ''}
              onChange={(e) => { select(e.target.value); closeMenu(); }}
              disabled={activeTeams.length === 0}
            >
              {activeTeams.length === 0 && <option value="">Нет активных команд</option>}
              {activeTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.ageGroup ? ` · ${t.ageGroup}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="app-header__team-name">
              {selectedTeam?.name || '—'}
            </span>
          )}
        </div>
        <PushOptInButton />
        <button className="app-header__btn" disabled title="Язык">РУС</button>
        <button
          className="app-header__btn app-header__btn--refresh"
          onClick={() => window.location.reload()}
          title="Обновить данные"
        >↻</button>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </header>
  );
}
