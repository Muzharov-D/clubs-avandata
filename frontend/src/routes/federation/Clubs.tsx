import { type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface ClubRow {
  slug: string;
  name: string;
  plan: string;
  teams: number;
  players: number;
  matches: number;
  coverage: number | null;
}

function coverageColor(v: number): string {
  if (v >= 80) return 'var(--rating-excellent, #2e7d32)';
  if (v >= 65) return 'var(--rating-good, #7cb342)';
  if (v >= 45) return 'var(--rating-ok, #fbc02d)';
  if (v >= 25) return 'var(--rating-weak, #fb8c00)';
  return 'var(--rating-poor, #d32f2f)';
}

/**
 * Клубы федерации (Эпик 2, FR7) — реестр клубов-членов: тариф-слой (база/глубина),
 * команды, игроки, охват данными, матчи. Данные: /federation/clubs.
 */
export function FederationClubs() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'clubs'],
    queryFn: () => api<{ clubs: ClubRow[] }>('/federation/clubs'),
  });
  const clubs = data?.clubs ?? [];

  return (
    <div>
      <h1 style={titleStyle}>Клубы федерации</h1>
      <p style={subStyle}>Реестр клубов-членов региона{data ? ` · ${clubs.length}` : ''}</p>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить реестр</div>}
      {data && clubs.length === 0 && (
        <div style={mutedBox}>В федерации пока нет клубов. Заведите членство (админ) или запустите сид.</div>
      )}

      {clubs.length > 0 && (
        <div style={tableCard}>
          <div style={{ ...rowStyle, color: 'var(--text-faint)', fontSize: 11, borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1 }}>Клуб</span>
            <span style={colNum}>Команд</span>
            <span style={colNum}>Игроков</span>
            <span style={{ width: 124 }}>Охват данными</span>
            <span style={colNum}>Матчей</span>
          </div>
          {clubs.map((c) => (
            <div key={c.slug} style={{ ...rowStyle, borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={clubName}>{c.name}</div>
                <span style={c.plan === 'paid' ? planDeep : planBase}>
                  {c.plan === 'paid' ? 'глубина' : 'базовый'}
                </span>
              </div>
              <span style={colNumVal}>{c.teams}</span>
              <span style={colNumVal}>{c.players}</span>
              <span style={{ width: 124, display: 'flex', alignItems: 'center', gap: 6 }}>
                {c.coverage == null ? (
                  <span style={{ color: 'var(--text-faint)' }}>—</span>
                ) : (
                  <>
                    <span style={barTrack}>
                      <span style={{ display: 'block', width: `${c.coverage}%`, height: '100%', background: coverageColor(c.coverage) }} />
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{c.coverage}%</span>
                  </>
                )}
              </span>
              <span style={colNumVal}>{c.matches}</span>
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
const tableCard: CSSProperties = {
  marginTop: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '4px 14px',
};
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' };
const colNum: CSSProperties = { width: 64, textAlign: 'right' };
const colNumVal: CSSProperties = { width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 };
const clubName: CSSProperties = { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const barTrack: CSSProperties = { flex: 1, height: 5, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden' };
const planDeep: CSSProperties = {
  fontSize: 10, color: 'var(--ink-on-bright, #06283d)', background: 'var(--accent-cyan, #22d3ee)',
  borderRadius: 5, padding: '1px 6px', fontWeight: 500,
};
const planBase: CSSProperties = {
  fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '1px 6px',
};
