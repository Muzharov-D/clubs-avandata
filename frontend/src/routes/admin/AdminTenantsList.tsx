import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// @ts-ignore — legacy .js
import { enterTenant } from '../../services/api';

const STATUS_LABELS: Record<string, string> = {
  active: 'активен',
  suspended: 'приостановлен',
  archived: 'архив',
};
const PROVIDER_LABELS: Record<string, string> = {
  ffspb: 'FFSPB',
  yfl: 'ЮФЛ',
  manual: 'вручную',
};

interface TenantBrand {
  primary?: string;
  primaryHover?: string;
  secondary?: string;
  accent?: string;
  titleSuffix?: string;
}
interface TenantRow {
  slug: string;
  name: string;
  displayName: string;
  status: 'active' | 'suspended' | 'archived';
  dataProvider: 'ffspb' | 'yfl' | 'manual';
  plan: string;
  brand?: TenantBrand;
  createdAt?: string;
}

export function AdminTenantsList() {
  useDocumentTitle('Клубы — Админ');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'archived'>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => api<{ tenants: TenantRow[] }>('/admin/tenants'),
  });

  const allTenants = data?.tenants ?? [];
  const active = allTenants.filter((t) => t.status === 'active').length;
  const providerCounts = allTenants.reduce<Record<string, number>>((acc, t) => {
    acc[t.dataProvider] = (acc[t.dataProvider] ?? 0) + 1;
    return acc;
  }, {});

  const tenants = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allTenants.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.slug.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.displayName.toLowerCase().includes(q)
      );
    });
  }, [allTenants, search, statusFilter]);

  return (
    <>
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Клубы платформы</h1>
          <div className="admin-page-sub">Управление мульти-тенант инстансами</div>
        </div>
        <Link to="/admin/tenants/new">
          <button className="admin-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Добавить клуб
          </button>
        </Link>
      </header>

      {/* Stat cards */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Всего клубов</div>
          <div className="admin-stat-card__value">{tenants.length}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Активных</div>
          <div className="admin-stat-card__value">{active}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">FFSPB / YFL / Manual</div>
          <div className="admin-stat-card__value" style={{ fontSize: 24 }}>
            {(providerCounts.ffspb ?? 0)} · {(providerCounts.yfl ?? 0)} · {(providerCounts.manual ?? 0)}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">План</div>
          <div className="admin-stat-card__value" style={{ fontSize: 24 }}>Free</div>
        </div>
      </div>

      {/* Filter bar */}
      {data && allTenants.length > 0 && (
        <div className="admin-filterbar" style={{
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 18px',
        }}>
          <input
            type="search"
            placeholder="Поиск по названию или slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: '1 1 240px',
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 13, outline: 'none',
            }}
          />
          {(['all', 'active', 'suspended', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 12px', borderRadius: 999,
                background: statusFilter === s ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)',
                border: statusFilter === s ? '1px solid rgba(34,211,238,0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: statusFilter === s ? '#22d3ee' : '#94a3b8',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}
            >
              {s === 'all' ? 'все' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--text-muted, #94a3b8)' }}>Загрузка…</div>}
      {error && <div style={{ color: '#f87171' }}>Ошибка загрузки</div>}

      {data && allTenants.length === 0 && (
        <div className="admin-empty">
          <div className="admin-empty__icon">🏟️</div>
          <div className="admin-empty__title">Пока нет ни одного клуба</div>
          <div>Создай первый — это займёт меньше минуты.</div>
          <div style={{ marginTop: 16 }}>
            <Link to="/admin/tenants/new">
              <button className="admin-btn">Создать первый клуб →</button>
            </Link>
          </div>
        </div>
      )}

      {data && allTenants.length > 0 && tenants.length === 0 && (
        <div className="admin-empty" style={{ padding: '32px' }}>
          <div className="admin-empty__title">Ничего не найдено</div>
          <div style={{ color: '#94a3b8' }}>Попробуйте другой запрос или сбросьте фильтр статуса.</div>
        </div>
      )}

      {data && tenants.length > 0 && (
        <div className="tenants-grid">
          {tenants.map((t) => (
            <TenantCard key={t.slug} tenant={t} />
          ))}
        </div>
      )}
    </>
  );
}

function TenantCard({ tenant }: { tenant: TenantRow }) {
  const [entering, setEntering] = useState(false);
  const enter = async () => {
    setEntering(true);
    try {
      await enterTenant(tenant.slug);
      window.location.href = '/club';
    } catch {
      setEntering(false);
    }
  };
  const brand = tenant.brand?.primary ?? '#2563eb';
  const initials = tenant.displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="tenant-card" style={{ ['--card-brand' as string]: brand }}>
      <div className="tenant-card__header">
        <div className="tenant-card__brand">
          <div className="tenant-card__logo" style={{ background: brand }}>
            {initials}
          </div>
          <div>
            <div className="tenant-card__name">{tenant.displayName}</div>
            <div className="tenant-card__slug">{tenant.slug}</div>
          </div>
        </div>
        <span className={`tenant-card__badge tenant-card__badge--${tenant.status}`}>
          {STATUS_LABELS[tenant.status] ?? tenant.status}
        </span>
      </div>

      <div className="tenant-card__meta">
        <div className="tenant-card__meta-row">
          <span className="tenant-card__meta-label">Источник</span>
          <span className="tenant-card__meta-value">{PROVIDER_LABELS[tenant.dataProvider] ?? tenant.dataProvider}</span>
        </div>
        <div className="tenant-card__meta-row">
          <span className="tenant-card__meta-label">Тариф</span>
          <span className="tenant-card__meta-value">{tenant.plan || 'Free'}</span>
        </div>
        <div className="tenant-card__meta-row">
          <span className="tenant-card__meta-label">Юр. имя</span>
          <span className="tenant-card__meta-value" style={{ textAlign: 'right' }}>{tenant.name}</span>
        </div>
      </div>

      <div className="tenant-card__actions">
        <Link to={`/admin/tenants/${tenant.slug}`} className="tenant-card__action" aria-disabled>
          Настройки
        </Link>
        <button
          type="button"
          className="tenant-card__action"
          onClick={enter}
          disabled={entering || tenant.status !== 'active'}
          title={tenant.status !== 'active' ? 'Клуб не активен' : 'Войти в кабинет клуба как админ'}
        >
          {entering ? 'Вход…' : 'Войти в клуб →'}
        </button>
      </div>
    </div>
  );
}
