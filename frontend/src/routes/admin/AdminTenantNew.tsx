import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';

interface CreateTenantResponse {
  tenant: { slug: string; name: string };
  headCoach: { email: string; tempPassword: string };
}

export function AdminTenantNew() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    slug: '',
    name: '',
    displayName: '',
    dataProvider: 'manual' as 'ffspb' | 'yfl' | 'manual',
    primary: '#dc2626',
    headCoachEmail: '',
    headCoachName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTenantResponse | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<CreateTenantResponse>('/admin/tenants', { method: 'POST', body }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      setResult(data);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать клуб');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate({
      slug: form.slug,
      name: form.name,
      displayName: form.displayName,
      dataProvider: form.dataProvider,
      brand: { primary: form.primary },
      headCoach: { email: form.headCoachEmail, fullName: form.headCoachName },
    });
  }

  if (result) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1>Клуб создан</h1>
        <div className="surface" style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Slug</div>
            <code style={{ fontSize: 16 }}>{result.tenant.slug}</code>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Главный тренер</div>
            <div>{result.headCoach.email}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Временный пароль</div>
            <code
              style={{
                background: 'var(--bg-surface-2)',
                padding: '8px 12px',
                borderRadius: 8,
                display: 'inline-block',
                userSelect: 'all',
              }}
            >
              {result.headCoach.tempPassword}
            </code>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Передай этот пароль тренеру. В Фазе 1 — magic-link через Resend.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => nav('/admin')}>← К списку клубов</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Новый клуб</h1>
      <form onSubmit={onSubmit} className="surface" style={{ display: 'grid', gap: 16 }}>
        <div>
          <label>Slug (lowercase, dash)</label>
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
            placeholder="legirus"
            required
            pattern="[a-z0-9-]+"
          />
        </div>
        <div>
          <label>Название</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ФК Легирус"
            required
          />
        </div>
        <div>
          <label>Display name (короткое)</label>
          <input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Легирус"
            required
          />
        </div>
        <div>
          <label>Источник данных</label>
          <select
            value={form.dataProvider}
            onChange={(e) =>
              setForm({ ...form, dataProvider: e.target.value as 'ffspb' | 'yfl' | 'manual' })
            }
          >
            <option value="manual">Manual (ручной ввод)</option>
            <option value="ffspb">FFSPB (stat.ffspb.org)</option>
            <option value="yfl">YFL (yflrussia.ru)</option>
          </select>
        </div>
        <div>
          <label>Основной бренд-цвет</label>
          <input
            type="color"
            value={form.primary}
            onChange={(e) => setForm({ ...form, primary: e.target.value })}
            style={{ height: 44, padding: 4 }}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

        <div>
          <label>Email главного тренера</label>
          <input
            type="email"
            value={form.headCoachEmail}
            onChange={(e) => setForm({ ...form, headCoachEmail: e.target.value })}
            placeholder="coach@club.ru"
            required
          />
        </div>
        <div>
          <label>ФИО главного тренера</label>
          <input
            value={form.headCoachName}
            onChange={(e) => setForm({ ...form, headCoachName: e.target.value })}
            required
          />
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Создаю…' : 'Создать клуб'}
          </button>
          <button
            type="button"
            onClick={() => nav('/admin')}
            style={{ background: 'transparent', border: '1px solid var(--border)' }}
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}
