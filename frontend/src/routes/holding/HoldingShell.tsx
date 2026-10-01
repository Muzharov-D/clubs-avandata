import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
// @ts-ignore — legacy .jsx
import ChangePasswordModal from '../../components/ChangePasswordModal';
import { ClubShield } from '../federation/ClubShield';
import { useHoldingProfile, useSlugQuery, useCanNote, shortClub } from './api';
import { useNotes } from './Notes';
import { ScopeBar, useNavQuery } from './scope';
import '../federation/federation.css';
import '../federation/holding.css';
import './holdingShell.css';
import './hd.css';

interface HoldingCtx { slug: string; name: string; short: string; region: string; brand: { primary: string; bright: string; soft: string; onPrimary: string }; members: Array<{ key: string; label: string; logo?: string | null }>; years: number[] }

/**
 * Оболочка кабинета холдинга — «брифинг руководителя»: синяя полоса клуба сверху,
 * разделы в одну строку, команды — выпадающей сеткой «школа × год», ниже — бумага.
 */
export function HoldingShell() {
  const { user, holding, logout } = useAuth() as { user: { fullName?: string; email?: string } | null; holding: HoldingCtx | null; logout: () => void };
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const q = useNavQuery();
  const slugQ = useSlugQuery();
  const profile = useHoldingProfile();
  const canNote = useCanNote();
  const notes = useNotes();
  const due = notes.data?.notes.filter((n) => n.due).length ?? 0;
  const [pwd, setPwd] = useState(false);
  const [open, setOpen] = useState<'teams' | 'user' | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Закрываем выпадашки при переходе и по клику мимо.
  useEffect(() => { setOpen(null); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const brand = holding?.brand ?? profile.data?.brand;
  const name = holding?.name ?? profile.data?.name ?? 'Холдинг';
  // Логотипы школ — из конфига холдинга (приходят при входе), не ждём профиль.
  const members = (holding?.members ?? profile.data?.members ?? []).map((m) => ({ ...m, logo: m.logo ?? profile.data?.members.find((x) => x.key === m.key)?.logo ?? null }));
  const teams = profile.data?.teams ?? [];
  const vars = brand ? ({ '--hold-primary': brand.primary } as CSSProperties) : undefined;
  const onTeam = pathname.startsWith('/holding/teams/');

  function onLogout() { logout(); toast.info('Вы вышли из кабинета'); navigate('/login', { replace: true }); }
  const item = ({ isActive }: { isActive: boolean }) => `hd-nav__item${isActive ? ' hd-nav__item--on' : ''}`;

  return (
    <div className="hd" style={vars}>
      <header className="hd-top">
        <div className="hd-top__inner" ref={navRef}>
          <Link to={`/holding${q}`} className="hd-brand" aria-label="Брифинг">
            <span className="hd-brand__logos">{members.map((m) => <ClubShield key={m.key} name={m.label} logoUrl={m.logo} size={30} />)}</span>
            <span className="hd-brand__name">{name}<span className="hd-brand__sub">кабинет руководства</span></span>
          </Link>

          <nav className="hd-nav" aria-label="Разделы">
            <NavLink to={`/holding${q}`} end className={item}>Брифинг</NavLink>
            <NavLink to={`/holding/board${q}`} className={item}>Комплектование</NavLink>
            <NavLink to={`/holding/decisions${q}`} className={item}>Решения</NavLink>
            <NavLink to={`/holding/changes${q}`} className={item}>Динамика</NavLink>
            <div className="hd-navwrap">
              <button type="button" className={`hd-nav__item${onTeam || open === 'teams' ? ' hd-nav__item--on' : ''}`} aria-expanded={open === 'teams'} onClick={() => setOpen(open === 'teams' ? null : 'teams')}>Команды ▾</button>
            </div>
            <NavLink to={`/holding/players${q}`} className={item}>Игроки</NavLink>
            <NavLink to={`/holding/compare${q}`} className={item}>Сравнение</NavLink>
            {canNote && <NavLink to={`/holding/journal${q}`} className={item}>Журнал{due > 0 && <span className="hd-nav__badge" title="напоминания, у которых подошла дата">{due}</span>}</NavLink>}
          </nav>

          <div className="hd-user">
            <button type="button" className="hd-user__btn" aria-expanded={open === 'user'} onClick={() => setOpen(open === 'user' ? null : 'user')}>
              <span className="hd-user__name">{user?.fullName?.split(' ')[0] || 'Руководство'}</span> ▾
            </button>
            {open === 'user' && (
              <div className="hd-menu" role="menu">
                <div className="hd-menu__who">{user?.fullName || 'Руководство'}<br />{user?.email}</div>
                <button type="button" role="menuitem" onClick={() => { setOpen(null); setPwd(true); }}>Сменить пароль</button>
                <button type="button" role="menuitem" onClick={onLogout}>Выйти</button>
              </div>
            )}
          </div>

          {open === 'teams' && (
            <div className="hd-teams" role="menu" style={{ left: 'max(16px, calc(50% - 320px))' }}>
              {members.map((m) => {
                const mine = teams.filter((t) => t.clubKey === m.key).sort((a, b) => b.year - a.year);
                return (
                  <div key={m.key} className="hd-teams__col">
                    <h4>{shortClub(m.label)} · {mine[0]?.division ?? ''}</h4>
                    {mine.length === 0 && <div className="hd-muted hd-small" style={{ padding: 8 }}>загружаем…</div>}
                    {mine.map((t) => (
                      <Link key={t.key} to={`/holding/teams/${encodeURIComponent(t.key)}${slugQ}`} className="hd-teams__row" role="menuitem">
                        <span className="hd-teams__year">{t.year}</span>
                        <span className="hd-teams__meta">{t.ageTitle}</span>
                        <span className="hd-teams__place">{t.standing ? `${t.standing.place}-е из ${t.standing.size}` : '—'}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </header>
      <ScopeBar />

      <main className="hd-main">
        <Suspense fallback={<HdLoading />}>
          <Outlet />
        </Suspense>
      </main>

      {pwd && <ChangePasswordModal onClose={() => setPwd(false)} />}
    </div>
  );
}

/** Единое состояние загрузки: спокойная фраза вместо стены серых плашек. */
export function HdLoading({ title = 'Готовим брифинг', text = 'Собираем протоколы ФФСПб и разборы матчей по всем возрастам. После обновления сервера это занимает до пары минут — страница откроется сама.' }: { title?: string; text?: string }) {
  return (
    <div className="hd-loading" role="status" aria-live="polite">
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="hd-progress" />
    </div>
  );
}
