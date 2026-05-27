import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface TenantRow {
  slug: string;
  name: string;
  displayName: string;
  status: 'active' | 'suspended' | 'archived';
  dataProvider: 'ffspb' | 'yfl' | 'manual';
  plan: string;
}

export function AdminTenantsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => api<{ tenants: TenantRow[] }>('/admin/tenants'),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Клубы</h1>
        <Link to="/admin/tenants/new">
          <button>+ Добавить клуб</button>
        </Link>
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Загрузка…</div>}
      {error && <div style={{ color: 'var(--danger)' }}>Ошибка загрузки</div>}

      {data && data.tenants.length === 0 && (
        <div className="surface" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Пока нет ни одного клуба. <Link to="/admin/tenants/new">Создать первый →</Link>
        </div>
      )}

      {data && data.tenants.length > 0 && (
        <div className="surface" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-2)', textAlign: 'left' }}>
                <th style={th}>Slug</th>
                <th style={th}>Название</th>
                <th style={th}>Provider</th>
                <th style={th}>Plan</th>
                <th style={th}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {data.tenants.map((t) => (
                <tr key={t.slug} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={td}>
                    <code style={{ color: 'var(--brand-accent)' }}>{t.slug}</code>
                  </td>
                  <td style={td}>{t.displayName}</td>
                  <td style={td}>{t.dataProvider}</td>
                  <td style={td}>{t.plan}</td>
                  <td style={td}>
                    <Badge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: 14 };

function Badge({ status }: { status: TenantRow['status'] }) {
  const color =
    status === 'active' ? 'var(--brand-accent)' : status === 'suspended' ? '#f59e0b' : 'var(--text-faint)';
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        background: `${color}22`,
        color,
      }}
    >
      {status}
    </span>
  );
}
