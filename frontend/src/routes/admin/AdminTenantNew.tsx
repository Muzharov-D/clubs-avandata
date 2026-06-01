import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

interface CreateTenantResponse {
  tenant: { slug: string; name: string };
  headCoach: { email: string };
  invite: { setupUrl: string; expiresAt: string };
}

interface ProvisionResponse {
  created: string[];
  existing: string[];
}

/** Строка возраста в форме создания клуба. leagueId/cupId — только для FFSPB. */
interface AgeRow {
  age: string;
  leagueId: string;
  cupId: string;
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
  const [ages, setAges] = useState<AgeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTenantResponse | null>(null);
  const [provisioned, setProvisioned] = useState<ProvisionResponse | null>(null);

  function addAge() {
    setAges((rows) => [...rows, { age: '', leagueId: '', cupId: '' }]);
  }
  function removeAge(index: number) {
    setAges((rows) => rows.filter((_, i) => i !== index));
  }
  function updateAge(index: number, patch: Partial<AgeRow>) {
    setAges((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

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
    onSuccess: async (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      setResult(data);
      // Если заданы возрасты — сразу провизионируем команды (скрытыми, active=false).
      // Не блокируем результат: если провижн упал, клуб создан и команды можно
      // завести на странице клуба.
      const hasAges = ages.some((r) => r.age.trim());
      if (!hasAges) return;
      try {
        const prov = await api<ProvisionResponse>(
          `/admin/tenants/${data.tenant.slug}/provision-teams`,
          { method: 'POST' },
        );
        setProvisioned(prov);
      } catch {
        setProvisioned({ created: [], existing: [] });
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать клуб');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // providerConfig.tournaments — карта возраст → {leagueId, cupId}. Пустые id не
    // пишем; для manual/yfl остаётся пустой объект {} (команда всё равно создаётся).
    const tournaments: Record<string, { leagueId?: string; cupId?: string }> = {};
    for (const r of ages) {
      const age = r.age.trim();
      if (!age) continue;
      const t: { leagueId?: string; cupId?: string } = {};
      if (r.leagueId.trim()) t.leagueId = r.leagueId.trim();
      if (r.cupId.trim()) t.cupId = r.cupId.trim();
      tournaments[age] = t;
    }
    const providerConfig = Object.keys(tournaments).length > 0 ? { tournaments } : {};
    create.mutate({
      slug: form.slug,
      name: form.name,
      displayName: form.displayName,
      dataProvider: form.dataProvider,
      providerConfig,
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
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ссылка для установки пароля</div>
            <code
              style={{
                background: 'var(--bg-surface-2)',
                padding: '8px 12px',
                borderRadius: 8,
                display: 'block',
                userSelect: 'all',
                wordBreak: 'break-all',
                fontSize: 13,
              }}
            >
              {result.invite.setupUrl}
            </code>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Передай ссылку тренеру — по ней он задаёт пароль (действует 7 дней).
            </div>
          </div>
          {provisioned && (
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Команды</div>
              <div style={{ fontSize: 14 }}>
                Создано <strong>{provisioned.created.length}</strong>
                {provisioned.existing.length > 0 && <>, уже было {provisioned.existing.length}</>} —
                все скрыты, откроются при первом разборе или вручную на странице клуба.
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => nav(`/admin/tenants/${result.tenant.slug}`)}>
              К управлению клубом →
            </button>
            <button
              onClick={() => nav('/admin')}
              style={{ background: 'transparent', border: '1px solid var(--border)' }}
            >
              К списку клубов
            </button>
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

        {/* Возрасты команд → провижн (скрытыми). Для FFSPB — ещё ID лиги/кубка. */}
        <div>
          <label>Команды (возрасты)</label>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
            Создаются скрытыми. Открываются автоматически при первом разборе или вручную.
            Можно оставить пусто и завести позже.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {ages.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={row.age}
                  onChange={(e) => updateAge(i, { age: e.target.value })}
                  placeholder="2010"
                  style={{ flex: form.dataProvider === 'ffspb' ? '0 0 90px' : 1 }}
                  aria-label={`Возраст команды ${i + 1}`}
                />
                {form.dataProvider === 'ffspb' && (
                  <>
                    <input
                      value={row.leagueId}
                      onChange={(e) => updateAge(i, { leagueId: e.target.value })}
                      placeholder="ID лиги"
                      style={{ flex: 1 }}
                      aria-label={`ID лиги ${i + 1}`}
                    />
                    <input
                      value={row.cupId}
                      onChange={(e) => updateAge(i, { cupId: e.target.value })}
                      placeholder="ID кубка"
                      style={{ flex: 1 }}
                      aria-label={`ID кубка ${i + 1}`}
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeAge(i)}
                  aria-label="Удалить возраст"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: '#f87171',
                    padding: '8px 12px',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addAge}
            style={{
              marginTop: 8,
              background: 'transparent',
              border: '1px dashed var(--border)',
              color: '#22d3ee',
            }}
          >
            + Добавить возраст
          </button>
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
