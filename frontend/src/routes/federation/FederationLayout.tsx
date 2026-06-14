import { type CSSProperties, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';

interface FedAuth {
  user: { fullName?: string; email?: string } | null;
  federation: { name?: string } | null;
  logout: () => void;
}

interface NavItem {
  to?: string;
  end?: boolean;
  label: string;
  soon?: string;
}
const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Обзор',
    items: [
      { to: '/federation', end: true, label: 'Обзор региона' },
      { to: '/federation/clubs', label: 'Клубы' },
      { to: '/federation/competitions', label: 'Соревнования' },
    ],
  },
  {
    title: 'Качество',
    items: [
      { to: '/federation/data-quality', label: 'Целостность данных' },
      { to: '/federation/benchmark', label: 'Бенчмаркинг' },
    ],
  },
  {
    title: 'Талант и развитие',
    items: [
      { to: '/federation/talent', label: 'Игроки' },
      { to: '/federation/development', label: 'Развитие' },
      { to: '/federation/age-effect', label: 'Возрастной эффект' },
    ],
  },
];

/**
 * Оболочка кабинета федерации (federation_admin) — read-only, тёмная тема.
 * Навигация из 8 модулей: 3 активны (F1), остальные — «Скоро» (F2/F3).
 * Цвета через CSS-токены (var(--bg-page) и т.д.).
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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text)' }}>
      <aside style={asideStyle}>
        <Link to="/federation" style={brandStyle}>
          <div style={crestStyle}>ФФ</div>
          <div style={{ lineHeight: 1.25, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fedName}</div>
            <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>Кабинет региона</div>
          </div>
        </Link>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }} aria-label="Меню федерации">
          {NAV.map((group) => (
            <div key={group.title}>
              <GroupTitle>{group.title}</GroupTitle>
              {group.items.map((it) =>
                it.to ? (
                  <NavLink key={it.label} to={it.to} end={it.end} style={({ isActive }) => navStyle(isActive)}>
                    {it.label}
                  </NavLink>
                ) : (
                  <SoonItem key={it.label} label={it.label} phase={it.soon ?? ''} />
                ),
              )}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={who}>{who}</div>
          <button onClick={handleLogout} style={logoutStyle}>Выйти</button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: '20px 24px' }}>
        <Outlet />
      </main>
    </div>
  );
}

const asideStyle: CSSProperties = {
  width: 240, flex: 'none', background: 'var(--bg-surface)',
  borderRight: '1px solid var(--border)', display: 'flex',
  flexDirection: 'column', padding: '16px 12px',
};
const brandStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  textDecoration: 'none', color: 'inherit', marginBottom: 18,
};
const crestStyle: CSSProperties = {
  width: 34, height: 34, borderRadius: 9, flex: 'none',
  background: 'var(--brand-primary)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  fontWeight: 700, fontSize: 13, color: '#fff',
};
const logoutStyle: CSSProperties = {
  width: '100%', background: 'transparent', color: 'var(--text-muted)',
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 10px', cursor: 'pointer', fontSize: 13,
};

function navStyle(isActive: boolean): CSSProperties {
  return {
    display: 'block', padding: '8px 10px', borderRadius: 8, fontSize: 14,
    textDecoration: 'none',
    color: isActive ? 'var(--text)' : 'var(--text-muted)',
    background: isActive ? 'rgba(37,99,235,0.16)' : 'transparent',
    border: isActive ? '1px solid rgba(37,99,235,0.42)' : '1px solid transparent',
  };
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-faint)', textTransform: 'uppercase', padding: '12px 8px 4px' }}>
      {children}
    </div>
  );
}

function SoonItem({ label, phase }: { label: string; phase: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', color: 'var(--text-faint)', fontSize: 14 }}>
      <span>{label}</span>
      <span style={{ fontSize: 9, border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px' }}>{phase}</span>
    </div>
  );
}
