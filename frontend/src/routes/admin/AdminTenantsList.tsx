import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

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
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => api<{ tenants: TenantRow[] }>('/admin/tenants'),
  });

  const tenants = data?.tenants ?? [];
  const active = tenants.filter((t) => t.status === 'active').length;
  const providerCounts = tenants.reduce<Record<string, number>>((acc, t) => {
    acc[t.dataProvider] = (acc[t.dataProvider] ?? 0) + 1;
    return acc;
  }, {});

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

      {isLoading && <div style={{ color: 'var(--text-muted, #94a3b8)' }}>Загрузка…</div>}
      {error && <div style={{ color: '#f87171' }}>Ошибка загрузки</div>}

      {data && tenants.length === 0 && (
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
          {tenant.status}
        </span>
      </div>

      <div className="tenant-card__meta">
        <div className="tenant-card__meta-row">
          <span className="tenant-card__meta-label">Провайдер</span>
          <span className="tenant-card__meta-value">{tenant.dataProvider}</span>
        </div>
        <div className="tenant-card__meta-row">
          <span className="tenant-card__meta-label">План</span>
          <span className="tenant-card__meta-value">{tenant.plan}</span>
        </div>
        <div className="tenant-card__meta-row">
          <span className="tenant-card__meta-label">Полное имя</span>
          <span className="tenant-card__meta-value" style={{ textAlign: 'right' }}>{tenant.name}</span>
        </div>
      </div>

      <div className="tenant-card__actions">
        <Link to={`/admin/tenants/${tenant.slug}`} className="tenant-card__action">
          Редактировать
        </Link>
        <a href="#" className="tenant-card__action">
          В кабинет →
        </a>
      </div>
    </div>
  );
}
