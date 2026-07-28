// Оболочка кабинета Lite — отдельный тариф для спортшкол.
//
// ПОЧЕМУ ОТДЕЛЬНАЯ. Обычный кабинет строился для аналитика: сайдбар на восемь
// разделов, конструктор, уведомления, переключатели эффектов. Тренеру СШ это
// мешает — он пришёл разобрать игрока и поговорить с ним. Здесь нет сайдбара
// вообще: в кабинете один экран, и навигация ему не нужна.
//
// Шапка — тонкая и липкая: клуб, команда, тренер, выход. Всё, что не помогает
// разобрать игрока, сюда не попадает.

import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTeam } from '../../contexts/TeamContext';
import { toast } from '../../components/Toast';
import './liteShell.css';

export default function LiteShell() {
  const { user, tenant, logout } = useAuth();
  const { teams, selectedTeamId, select } = useTeam();
  const navigate = useNavigate();

  const active = (teams || []).filter((t) => t.active && t.isOurTeam !== false);
  const club = tenant?.displayName || tenant?.name || 'Клуб';

  const onLogout = () => {
    logout();
    toast.info('Вы вышли из системы');
    navigate('/login', { replace: true });
  };

  return (
    <div className="ls">
      <header className="ls-top">
        <div className="ls-top__club">
          {tenant?.brand?.logoUrl
            ? <img className="ls-top__logo" src={tenant.brand.logoUrl} alt="" />
            : null}
          <span className="ls-top__name">{club}</span>
        </div>

        {active.length > 1 ? (
          <select
            className="ls-top__team"
            value={selectedTeamId ?? ''}
            onChange={(e) => select(e.target.value)}
            aria-label="Команда"
          >
            {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : (
          <span className="ls-top__team ls-top__team--static">{active[0]?.name ?? ''}</span>
        )}

        <div className="ls-top__right">
          <span className="ls-top__user">{user?.fullName}</span>
          <button type="button" className="ls-top__out" onClick={onLogout}>Выход</button>
        </div>
      </header>

      <main className="ls-body">
        <Outlet />
      </main>
    </div>
  );
}
