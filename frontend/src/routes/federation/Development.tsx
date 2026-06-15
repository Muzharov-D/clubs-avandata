import { useQuery } from '@tanstack/react-query';
import { StatTile } from '../../components/StatTile';
import { api } from '../../api/client';
import './federation.css';

interface ProdRow {
  slug: string;
  name: string;
  activePlayers: number;
  totalMinutes: number;
  youngPct: number | null;
}

/** Доля минут молодых: выше — лучше (клуб даёт играть на возраст старше). */
function youngColor(v: number | null): string {
  if (v == null) return 'var(--border-strong)';
  if (v >= 25) return 'var(--success)';
  if (v >= 12) return 'var(--accent-cyan)';
  if (v >= 5) return 'var(--warning)';
  return 'var(--danger)';
}

/**
 * Развитие и продуктивность (Эпик 6, FR22). Минуты молодых (игроки моложе года
 * команды → играют на возраст старше, признак развития) + активная глубина.
 */
export function FederationDevelopment() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'development'],
    queryFn: () => api<{ clubs: ProdRow[] }>('/federation/development'),
  });
  const clubs = (data?.clubs ?? [])
    .filter((c) => c.totalMinutes > 0)
    .sort((a, b) => (b.youngPct ?? 0) - (a.youngPct ?? 0));

  const totalMin = clubs.reduce((s, c) => s + c.totalMinutes, 0);
  const youngMin = clubs.reduce((s, c) => s + ((c.youngPct ?? 0) / 100) * c.totalMinutes, 0);
  const regionYoung = totalMin ? Math.round((youngMin / totalMin) * 100) : 0;

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Развитие и продуктивность</h1>
          <p className="fed-sub">Минуты молодых (играющих на возраст старше) и активная глубина состава</p>
        </div>
      </header>

      {isLoading && (
        <div className="fed-kpis">{[0, 1].map((i) => <div key={i} className="fed-skeleton" style={{ height: 96 }} />)}</div>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && clubs.length === 0 && (
        <div className="fed-empty">
          <div className="fed-empty__icon">📈</div>
          Нет данных о минутах. Нужны разобранные матчи с минутами и заполненный год команды.
        </div>
      )}

      {clubs.length > 0 && (
        <div className="fed-stack">
          <div className="fed-kpis">
            <div className="fed-rise"><StatTile label="Клубов с минутами" value={clubs.length} accent="muted" /></div>
            <div className="fed-rise"><StatTile label="Минут молодых по региону" value={regionYoung} unit="%" accent="cyan" /></div>
          </div>

          <section className="fed-card fed-rise">
            <div className="fed-table" style={{ padding: '0 8px' }}>
              <div className="fed-row fed-row--head">
                <span style={{ flex: 1 }}>Клуб</span>
                <span className="fed-num" style={{ width: 84 }}>Игроков</span>
                <span style={{ width: 168 }}>Минуты молодых</span>
              </div>
              {clubs.map((c) => (
                <div className="fed-row" key={c.slug}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fed-row__name">{c.name}</div>
                    <div className="fed-row__meta">{c.totalMinutes.toLocaleString('ru-RU')}′ всего</div>
                  </div>
                  <span className="fed-num fed-muted" style={{ width: 84 }}>{c.activePlayers}</span>
                  <span style={{ width: 168, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="fed-meter">
                      <span className="fed-meter__fill" style={{ width: `${Math.min(c.youngPct ?? 0, 100)}%`, background: youngColor(c.youngPct) }} />
                    </span>
                    <span className="fed-num fed-muted" style={{ width: 38 }}>
                      {c.youngPct == null ? '—' : `${c.youngPct}%`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
