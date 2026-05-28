import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

interface CreateTenantResponse {
  tenant: { slug: string; name: string };
  headCoach: { email: string; tempPassword: string };
}

/** Транслит «ФК Зенит» → "fk-zenit" — для авто-генерации slug. */
const RU_TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
function autoSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => RU_TRANSLIT[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function AdminTenantNew() {
  useDocumentTitle('Новый клуб — Админ');
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    slug: '',
    slugManual: false,    // флаг — пользователь сам исправил slug → больше не автогеним
    name: '',
    displayName: '',
    dataProvider: 'manual' as 'ffspb' | 'yfl' | 'manual',
    primary: '#1FB6FF',
    accent:  '#22d3ee',
    headCoachEmail: '',
    headCoachName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTenantResponse | null>(null);

  // Авто-генерация slug из name пока пользователь сам его не исправил.
  useEffect(() => {
    if (form.slugManual) return;
    const candidate = autoSlug(form.name);
    if (candidate !== form.slug) {
      setForm((f) => ({ ...f, slug: candidate }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  // displayName тоже автогеним из name, если пустой.
  useEffect(() => {
    if (form.displayName.trim() === '' && form.name.trim() !== '') {
      setForm((f) => ({ ...f, displayName: f.name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

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
      brand: { primary: form.primary, accent: form.accent },
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
          <label>Полное название клуба</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ФК Зенит"
            required
            autoFocus
          />
        </div>
        <div>
          <label>Короткое имя <span style={{ color: '#94a3b8', fontWeight: 400 }}>(в шапке кабинета)</span></label>
          <input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Зенит"
            required
          />
        </div>
        <div>
          <label>
            URL-идентификатор <span style={{ color: '#94a3b8', fontWeight: 400 }}>
              ({form.slugManual ? 'правишь вручную' : 'генерируется автоматически'})
            </span>
          </label>
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), slugManual: true })}
            placeholder="zenit-fk"
            required
            pattern="[a-z0-9-]+"
          />
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            будет URL: <code style={{ color: '#22d3ee' }}>clubs.avandata.ru/m/{form.slug || '...'}</code>
          </div>
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
          <label>Бренд-цвета</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                type="color"
                value={form.primary}
                onChange={(e) => setForm({ ...form, primary: e.target.value })}
                style={{ width: '100%', height: 44, padding: 2, cursor: 'pointer' }}
                aria-label="Основной бренд-цвет"
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' }}>Основной</div>
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="color"
                value={form.accent}
                onChange={(e) => setForm({ ...form, accent: e.target.value })}
                style={{ width: '100%', height: 44, padding: 2, cursor: 'pointer' }}
                aria-label="Акцентный цвет"
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' }}>Акцент (цифры/кнопки)</div>
            </div>
            {/* Live preview */}
            <div style={{
              flex: 1,
              padding: 10,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${form.primary}22, transparent)`,
              border: `1px solid ${form.primary}66`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Превью</div>
              <div style={{ color: form.accent, fontWeight: 800, fontSize: 24 }}>8.7</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Рейтинг</div>
            </div>
          </div>
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
