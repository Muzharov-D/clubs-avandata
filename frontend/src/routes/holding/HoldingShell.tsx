import { Suspense, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
// @ts-ignore — legacy .jsx
import ChangePasswordModal from '../../components/ChangePasswordModal';
import { ClubShield } from '../federation/ClubShield';
import { useHoldingProfile, useSlugQuery, useCanNote, shortClub } from './api';
import { useNotes } from './Notes';
import '../federation/federation.css';
import '../federation/holding.css';
import './holdingShell.css';

interface HoldingCtx { slug: string; name: string; short: string; region: string; brand: { primary: string; bright: string; soft: string; onPrimary: string }; members: Array<{ key: string; label: string }>; years: number[] }

/**
 * Оболочка кабинета холдинга: левая колонка в цветах клуба — бренд, разделы, список
 * команд по школам и возрастам, подвал с пользователем. Никакой навигации федерации.
 */
export function HoldingShell() {
  const { user, holding, logout } = useAuth() as { user: { fullName?: string; email?: string } | null; holding: HoldingCtx | null; logout: () => void };
  const navigate = useNavigate();
  const slugQ = useSlugQuery();
  const profile = useHoldingProfile();
  const [pwd, setPwd] = useState(false);
  const canNote = useCanNote();
  const notes = useNotes();
  const due = notes.data?.notes.filter((n) => n.due).length ?? 0;

  // Бренд: у руководства — из контекста входа; у федерации (смотрит по ссылке) — из профиля.
  const brand = holding?.brand ?? profile.data?.brand;
  const name = holding?.name ?? profile.data?.name ?? 'Холдинг';
  const members = profile.data?.members ?? holding?.members.map((m) => ({ ...m, logo: null, teams: 0 })) ?? [];
  const teams = profile.data?.teams ?? [];
  const vars = brand ? ({ '--hold-primary': brand.primary, '--hold-bright': brand.bright, '--hold-soft': brand.soft, '--hold-on': brand.onPrimary } as CSSProperties) : undefined;

  function onLogout() { logout(); toast.info('Вы вышли из кабинета'); navigate('/login', { replace: true }); }
  const q = slugQ; // сохраняем ?slug= в ссылках, когда кабинет смотрит федерация

  return (
    <div className="hs fed-root hold" style={vars}>
      <aside className="hs-side">
        <Link to={`/holding${q}`} className="hs-brand">
          <div className="hs-brand__logos">
            {members.map((m) => <ClubShield key={m.key} name={m.label} logoUrl={m.logo} size={34} />)}
          </div>
          <div className="hs-brand__text">
            <div className="hs-brand__kicker">Кабинет холдинга</div>
            <div className="hs-brand__name">{name}</div>
          </div>
        </Link>

        <nav className="hs-nav" aria-label="Разделы">
          <NavLink to={`/holding${q}`} end className={({ isActive }) => `fed-tab${isActive ? ' fed-tab--active' : ''}`}>Обзор</NavLink>
          <NavLink to={`/holding/decisions${q}`} className={({ isActive }) => `fed-tab${isActive ? ' fed-tab--active' : ''}`}>Решения</NavLink>
          <NavLink to={`/holding/changes${q}`} className={({ isActive }) => `fed-tab${isActive ? ' fed-tab--active' : ''}`}>Что изменилось</NavLink>
          <NavLink to={`/holding/compare${q}`} className={({ isActive }) => `fed-tab${isActive ? ' fed-tab--active' : ''}`}>Сравнение</NavLink>
          {canNote && <NavLink to={`/holding/journal${q}`} className={({ isActive }) => `fed-tab hs-tab-count${isActive ? ' fed-tab--active' : ''}`}>Журнал решений{due > 0 && <span className="hs-due" title="напоминания, у которых подошла дата">{due}</span>}</NavLink>}
          <NavLink to={`/holding/players${q}`} className={({ isActive }) => `fed-tab${isActive ? ' fed-tab--active' : ''}`}>Игроки</NavLink>

          {members.map((m) => {
            const mine = teams.filter((t) => t.clubKey === m.key).sort((a, b) => b.year - a.year);
            if (!mine.length) return null;
            return (
              <div key={m.key} className="hs-group">
                <div className="fed-sidebar__group">{shortClub(m.label)}</div>
                {mine.map((t) => (
                  <NavLink key={t.key} to={`/holding/teams/${encodeURIComponent(t.key)}${q}`} className={({ isActive }) => `fed-tab hs-team${isActive ? ' fed-tab--active' : ''}`}>
                    <span className="hs-team__year">{t.year}</span>
                    <span className="hs-team__meta">{t.ageTitle} · {t.division.replace(/\s*лига\s*/i, ' лига')}</span>
                    {t.standing && <span className="hs-team__place">#{t.standing.place}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="hs-foot">
          <span className="fed-sidebar__who">{user?.fullName || user?.email || 'Руководство'}</span>
          <button type="button" className="fed-sidebar__out" onClick={() => setPwd(true)}>Сменить пароль</button>
          <button type="button" className="fed-sidebar__out" onClick={onLogout}>Выйти</button>
        </div>
      </aside>

      <main className="hs-main">
        <Suspense fallback={<div className="fed-skeleton" style={{ height: 400 }} />}>
          <Outlet />
        </Suspense>
      </main>

      {pwd && <ChangePasswordModal onClose={() => setPwd(false)} />}
    </div>
  );
}
