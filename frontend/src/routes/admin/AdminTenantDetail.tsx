import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { toast } from '../../components/Toast';

interface AdminTeam {
  id: string;
  name: string;
  ageGroup: string;
  ageLabel: string | null;
  year: number | null;
  isOurTeam: boolean;
  active: boolean;
  matchCount: number;
}

interface ProvisionResponse {
  created: string[];
  existing: string[];
}

type TeamPatch = { active?: boolean; name?: string; ageLabel?: string };

export function AdminTenantDetail() {
  const { slug = '' } = useParams();
  useDocumentTitle(`${slug} — команды`);
  const qc = useQueryClient();
  const teamsKey = ['admin', 'tenant', slug, 'teams'];

  const { data, isLoading, error } = useQuery({
    queryKey: teamsKey,
    queryFn: () => api<{ teams: AdminTeam[] }>(`/admin/tenants/${slug}/teams`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: teamsKey });

  const patch = useMutation({
    mutationFn: ({ teamId, body }: { teamId: string; body: TeamPatch }) =>
      api(`/admin/tenants/${slug}/teams/${teamId}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Не удалось обновить команду'),
  });

  const provision = useMutation({
    mutationFn: () =>
      api<ProvisionResponse>(`/admin/tenants/${slug}/provision-teams`, { method: 'POST' }),
    onSuccess: (res) => {
      invalidate();
      toast.success(`Создано команд: ${res.created.length}, уже было: ${res.existing.length}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'NO_TOURNAMENTS') {
        toast.info('В конфиге клуба нет турниров — заведите команду вручную');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Провижн не удался');
      }
    },
  });

  // Тариф клуба — из списка всех клубов (admin /tenants отдаёт plan). PATCH тенанта.
  const tenantsKey = ['admin', 'tenants'];
  const tenantQuery = useQuery({
    queryKey: tenantsKey,
    queryFn: () => api<{ tenants: Array<{ slug: string; plan?: string }> }>('/admin/tenants'),
  });
  const plan = (tenantQuery.data?.tenants.find((t) => t.slug === slug)?.plan ?? 'free') as 'free' | 'paid';
  const planMut = useMutation({
    mutationFn: (next: 'free' | 'paid') =>
      api(`/admin/tenants/${slug}`, { method: 'PATCH', body: { plan: next } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantsKey });
      toast.success('Тариф клуба обновлён');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Не удалось сменить тариф'),
  });

  const teams = data?.teams ?? [];

  return (
    <>
      <header className="admin-page-header">
        <div>
          <Link to="/admin" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            ← Все клубы
          </Link>
          <h1 className="admin-page-title">Команды клуба</h1>
          <div className="admin-page-sub">
            <code>{slug}</code>
          </div>
        </div>
        <button
          className="admin-btn"
          onClick={() => provision.mutate()}
          disabled={provision.isPending}
          title="Создать команды по возрастам из турниров клуба (скрытыми)"
        >
          {provision.isPending ? 'Провижн…' : 'Провизионировать из турниров'}
        </button>
      </header>

      <div
        className="surface"
        style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Тариф клуба</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            На «Бесплатном» платные блоки (xG, физнагрузка, тепловые карты, профиль передач) скрыты у клуба.
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Тариф клуба"
          style={{ display: 'inline-flex', gap: 2, padding: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 999 }}
        >
          {(['free', 'paid'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={plan === p}
              onClick={() => plan !== p && planMut.mutate(p)}
              disabled={planMut.isPending}
              style={{
                border: 0, cursor: planMut.isPending ? 'default' : 'pointer',
                padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                background: plan === p ? (p === 'paid' ? '#22c55e' : 'rgba(148,163,184,0.25)') : 'transparent',
                color: plan === p ? (p === 'paid' ? '#04210f' : '#e2e8f0') : '#94a3b8',
              }}
            >
              {p === 'free' ? 'Бесплатный' : 'Платный'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div style={{ color: '#94a3b8' }}>Загрузка…</div>}
      {error && <div style={{ color: '#f87171' }}>Ошибка загрузки команд</div>}

      {data && teams.length === 0 && (
        <div className="admin-empty">
          <div className="admin-empty__icon">👥</div>
          <div className="admin-empty__title">Команды не созданы</div>
          <div>Провизионируйте из турниров клуба или добавьте команду вручную.</div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              className="admin-btn"
              onClick={() => provision.mutate()}
              disabled={provision.isPending}
            >
              Провизионировать из турниров
            </button>
          </div>
        </div>
      )}

      {data && teams.length > 0 && (
        <div className="surface" style={{ display: 'grid', gap: 4, padding: 0, overflow: 'hidden' }}>
          {teams.map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              busy={patch.isPending}
              onToggle={() => patch.mutate({ teamId: team.id, body: { active: !team.active } })}
              onRename={(name) => patch.mutate({ teamId: team.id, body: { name } })}
            />
          ))}
        </div>
      )}

      <AddTeamForm slug={slug} onAdded={invalidate} />
    </>
  );
}

interface TeamRowProps {
  team: AdminTeam;
  busy: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
}

function TeamRow({ team, busy, onToggle, onRename }: TeamRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team.name);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== team.name) onRename(next);
    else setDraft(team.name);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        opacity: team.active ? 1 : 0.6,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              // Enter → снимаем фокус, commit отрабатывает в onBlur (без дубля PATCH).
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraft(team.name);
                setEditing(false);
              }
            }}
            autoFocus
            style={{ width: '100%' }}
            aria-label="Имя команды"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Переименовать"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              fontWeight: 600,
              fontSize: 15,
              padding: 0,
              cursor: 'text',
              textAlign: 'left',
            }}
          >
            {team.name}
          </button>
        )}
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {team.ageGroup}
          {team.ageLabel ? ` · ${team.ageLabel}` : ''} · <code>{team.id}</code>
        </div>
      </div>

      <span
        title={team.matchCount > 0 ? 'Есть загруженные разборы' : 'Нет данных'}
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: '3px 10px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
          background: team.matchCount > 0 ? 'rgba(34,197,94,0.16)' : 'rgba(148,163,184,0.12)',
          color: team.matchCount > 0 ? '#22c55e' : '#94a3b8',
        }}
      >
        {team.matchCount > 0 ? `${team.matchCount} разборов` : 'нет данных'}
      </span>

      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        title={team.active ? 'Скрыть от клуба' : 'Открыть клубу'}
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 14px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
          background: team.active ? 'rgba(34,211,238,0.18)' : 'transparent',
          border: team.active ? '1px solid rgba(34,211,238,0.5)' : '1px solid var(--border)',
          color: team.active ? '#22d3ee' : '#94a3b8',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        {team.active ? '● Открыта' : '○ Скрыта'}
      </button>
    </div>
  );
}

interface AddTeamFormProps {
  slug: string;
  onAdded: () => void;
}

function AddTeamForm({ slug, onAdded }: AddTeamFormProps) {
  const [age, setAge] = useState('');
  const [name, setName] = useState('');

  const add = useMutation({
    mutationFn: (body: { age: string; name?: string }) =>
      api(`/admin/tenants/${slug}/teams`, { method: 'POST', body }),
    onSuccess: () => {
      setAge('');
      setName('');
      onAdded();
      toast.success('Команда добавлена (скрыта)');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'TEAM_EXISTS') {
        toast.info('Команда с таким возрастом уже есть');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось добавить команду');
      }
    },
  });

  function submit() {
    const a = age.trim();
    if (!a) return;
    add.mutate(name.trim() ? { age: a, name: name.trim() } : { age: a });
  }

  return (
    <div className="surface" style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div>
        <label style={{ fontSize: 12, color: '#94a3b8' }}>Возраст</label>
        <input
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="2011"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ width: 110 }}
          aria-label="Возраст новой команды"
        />
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={{ fontSize: 12, color: '#94a3b8' }}>Имя (необязательно)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="по умолчанию «{Клуб} {возраст}»"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ width: '100%' }}
          aria-label="Имя новой команды"
        />
      </div>
      <button onClick={submit} disabled={add.isPending || !age.trim()}>
        {add.isPending ? 'Добавляю…' : '+ Добавить команду'}
      </button>
    </div>
  );
}
