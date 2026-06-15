import { useQuery } from '@tanstack/react-query';
import { StatTile } from '../../components/StatTile';
import { api } from '../../api/client';
import { healthColor } from './fedColors';
import './federation.css';

interface DQRow {
  slug: string;
  name: string;
  players: number;
  birthPct: number | null;
  photoPct: number | null;
  positionPct: number | null;
  consentPct: number | null;
}

const DIMS: Array<{ key: 'birthPct' | 'photoPct' | 'positionPct' | 'consentPct'; label: string }> = [
  { key: 'consentPct', label: 'Согласие 152-ФЗ' },
  { key: 'birthPct', label: 'Дата рождения' },
  { key: 'positionPct', label: 'Позиция' },
  { key: 'photoPct', label: 'Фото' },
];

function weighted(rows: DQRow[], sel: (r: DQRow) => number | null): number | null {
  const total = rows.reduce((s, r) => s + r.players, 0);
  if (total === 0) return null;
  return Math.round(rows.reduce((s, r) => s + r.players * (sel(r) ?? 0), 0) / total);
}

/**
 * Целостность данных и согласия (Эпик 4, FR14–16) — полнота паспортизации по
 * клубам, обезличенно. Именные данные детей не выводятся (гейт FR17 by design).
 */
export function FederationDataQuality() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'data-quality'],
    queryFn: () => api<{ clubs: DQRow[] }>('/federation/data-quality'),
  });
  const clubs = data?.clubs ?? [];
  const totalPlayers = clubs.reduce((a, c) => a + c.players, 0);
  const regionConsent = weighted(clubs, (r) => r.consentPct);
  const regionProfile = weighted(clubs, (r) => {
    const vals = [r.birthPct, r.positionPct, r.photoPct].filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Целостность данных и согласия</h1>
          <p className="fed-sub">Полнота паспортизации по клубам · обезличенно (152-ФЗ)</p>
        </div>
      </header>

      {isLoading && (
        <div className="fed-kpis">{[0, 1, 2].map((i) => <div key={i} className="fed-skeleton" style={{ height: 96 }} />)}</div>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && clubs.length === 0 && (
        <div className="fed-empty"><div className="fed-empty__icon">🗂️</div>Нет данных по клубам.</div>
      )}

      {clubs.length > 0 && (
        <div className="fed-stack">
          <div className="fed-kpis">
            <div className="fed-rise"><StatTile label="Игроков в реестре" value={totalPlayers} accent="muted" /></div>
            <div className="fed-rise"><StatTile label="Согласие 152-ФЗ" value={regionConsent ?? 0} unit="%" accent="cyan" /></div>
            <div className="fed-rise"><StatTile label="Полнота профилей" value={regionProfile ?? 0} unit="%" accent="violet" /></div>
          </div>

          <section className="fed-card fed-rise">
            <div className="fed-card__pad">
              <div className="fed-card__title">Паспортизация по клубам</div>
              {clubs.map((c, idx) => (
                <div key={c.slug} style={{ padding: '14px 0', borderBottom: idx < clubs.length - 1 ? '1px solid var(--border)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 }}>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    <span className="fed-faint fed-num" style={{ fontSize: 12 }}>{c.players} игроков</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px 22px' }}>
                    {DIMS.map((d) => {
                      const v = c[d.key];
                      return (
                        <div key={d.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                            <span className="fed-muted">{d.label}</span>
                            <span className="fed-num" style={{ color: v == null ? 'var(--text-faint)' : healthColor(v), fontWeight: 600 }}>
                              {v == null ? '—' : `${v}%`}
                            </span>
                          </div>
                          <span className="fed-meter">
                            <span className="fed-meter__fill" style={{ width: `${v ?? 0}%`, background: healthColor(v) }} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="fed-faint" style={{ fontSize: 11.5, margin: '14px 0 0', lineHeight: 1.5 }}>
                Согласие 152-ФЗ открывает имя ребёнка только внутри клуба. Федерация видит
                исключительно обезличенные доли — имена и контакты детей закрыты.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
