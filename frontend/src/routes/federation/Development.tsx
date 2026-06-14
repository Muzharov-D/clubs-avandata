import { type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface ProdRow {
  slug: string;
  name: string;
  activePlayers: number;
  totalMinutes: number;
  youngPct: number | null;
}

function youngColor(v: number): string {
  if (v >= 25) return 'var(--rating-excellent, #2e7d32)';
  if (v >= 15) return 'var(--rating-good, #7cb342)';
  if (v >= 7) return 'var(--rating-ok, #fbc02d)';
  if (v >= 2) return 'var(--rating-weak, #fb8c00)';
  return 'var(--rating-poor, #d32f2f)';
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
  const clubs = (data?.clubs ?? []).filter((c) => c.totalMinutes > 0).sort((a, b) => (b.youngPct ?? 0) - (a.youngPct ?? 0));

  return (
    <div>
      <h1 style={titleStyle}>Развитие и продуктивность</h1>
      <p style={subStyle}>Минуты молодых (играющих на возраст старше) и активная глубина состава</p>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && clubs.length === 0 && (
        <div style={mutedBox}>Нет данных о минутах. Нужны разобранные матчи с минутами и заполненный год команды.</div>
      )}

      {clubs.length > 0 && (
        <div style={{ ...tableCard, marginTop: 16 }}>
          <div style={{ ...row, color: 'var(--text-faint)', fontSize: 11, borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1 }}>Клуб</span>
            <span style={{ width: 70, textAlign: 'right' }}>Игроков</span>
            <span style={{ width: 160 }}>Минуты молодых</span>
          </div>
          {clubs.map((c) => (
            <div key={c.slug} style={{ ...row, borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.totalMinutes.toLocaleString('ru-RU')}′ всего</div>
              </div>
              <span style={{ width: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{c.activePlayers}</span>
              <span style={{ width: 160, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${c.youngPct ?? 0}%`, height: '100%', background: youngColor(c.youngPct ?? 0) }} />
                </span>
                <span style={{ width: 38, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {c.youngPct == null ? '—' : `${c.youngPct}%`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const titleStyle: CSSProperties = { fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 };
const subStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 };
const mutedBox: CSSProperties = { marginTop: 16, color: 'var(--text-muted)', fontSize: 14 };
const tableCard: CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 14px' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' };
