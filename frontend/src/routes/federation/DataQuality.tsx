import { type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface DQRow {
  slug: string;
  name: string;
  players: number;
  birthPct: number | null;
  photoPct: number | null;
  positionPct: number | null;
  consentPct: number | null;
}

function pctColor(v: number): string {
  if (v >= 80) return 'var(--rating-excellent, #2e7d32)';
  if (v >= 60) return 'var(--rating-good, #7cb342)';
  if (v >= 40) return 'var(--rating-ok, #fbc02d)';
  if (v >= 20) return 'var(--rating-weak, #fb8c00)';
  return 'var(--rating-poor, #d32f2f)';
}

const DIMS: Array<{ key: 'birthPct' | 'photoPct' | 'positionPct' | 'consentPct'; label: string }> = [
  { key: 'birthPct', label: 'Дата рожд.' },
  { key: 'photoPct', label: 'Фото' },
  { key: 'positionPct', label: 'Позиция' },
  { key: 'consentPct', label: 'Согласие' },
];

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
  const consented = clubs.reduce(
    (a, c) => a + (c.consentPct == null ? 0 : Math.round((c.consentPct / 100) * c.players)),
    0,
  );
  const regionConsent = totalPlayers ? Math.round((consented / totalPlayers) * 100) : null;

  return (
    <div>
      <h1 style={titleStyle}>Целостность данных и согласия</h1>
      <p style={subStyle}>Полнота паспортизации по клубам · обезличенно</p>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && clubs.length === 0 && <div style={mutedBox}>Нет данных по клубам.</div>}

      {clubs.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, margin: '16px 0', flexWrap: 'wrap' }}>
            <Summary label="Игроков в реестре" value={String(totalPlayers)} />
            <Summary
              label="Согласий по региону"
              value={regionConsent == null ? '—' : `${regionConsent}%`}
              color={regionConsent == null ? undefined : pctColor(regionConsent)}
            />
          </div>

          <div style={tableCard}>
            {clubs.map((c) => (
              <div key={c.slug} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span style={{ color: 'var(--text-faint)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{c.players} игроков</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  {DIMS.map((d) => {
                    const v = c[d.key];
                    return (
                      <div key={d.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                          <span>{d.label}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : `${v}%`}</span>
                        </div>
                        <span style={barTrack}>
                          <span style={{ display: 'block', width: `${v ?? 0}%`, height: '100%', background: v == null ? 'transparent' : pctColor(v) }} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', minWidth: 150 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display, inherit)', fontWeight: 600, fontSize: 24, fontVariantNumeric: 'tabular-nums', color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

const titleStyle: CSSProperties = { fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 };
const subStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 };
const mutedBox: CSSProperties = { marginTop: 16, color: 'var(--text-muted)', fontSize: 14 };
const tableCard: CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 14px' };
const barTrack: CSSProperties = { display: 'block', height: 5, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden' };
