import { type CSSProperties, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface PlayerRow {
  name: string | null;
  club: string;
  ageGroup: string;
  position: string | null;
  matches: number;
  minutes: number;
  rating: number | null;
}

function ratingColor(v: number): string {
  if (v >= 7.5) return 'var(--rating-excellent, #2e7d32)';
  if (v >= 6.5) return 'var(--rating-good, #7cb342)';
  if (v >= 5.5) return 'var(--rating-ok, #fbc02d)';
  if (v >= 4) return 'var(--rating-weak, #fb8c00)';
  return 'var(--rating-poor, #d32f2f)';
}

const MIN_OPTIONS = [0, 90, 270, 450];

/**
 * Игроки региона / талант-пул (Эпик 5, FR18–19). Рейтинг по индексу
 * эффективности (0–10) из match_players, фильтры мин.минут и возраст. Имя — только
 * при согласии; без согласия игрок ранжируется обезличенно.
 */
export function FederationTalent() {
  const [minMinutes, setMinMinutes] = useState(0);
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'talent', minMinutes],
    queryFn: () => api<{ players: PlayerRow[] }>(`/federation/talent?minMinutes=${minMinutes}`),
  });
  const players = data?.players ?? [];
  const ages = useMemo(() => Array.from(new Set(players.map((p) => p.ageGroup))).sort(), [players]);
  const shown = useMemo(
    () => (ageFilter === 'all' ? players : players.filter((p) => p.ageGroup === ageFilter)),
    [players, ageFilter],
  );

  return (
    <div>
      <h1 style={titleStyle}>Игроки региона</h1>
      <p style={subStyle}>Рейтинг по индексу эффективности · против пула региона</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Мин. минут:</span>
        {MIN_OPTIONS.map((m) => (
          <button key={m} onClick={() => setMinMinutes(m)} style={chip(minMinutes === m)}>
            {m === 0 ? 'все' : m}
          </button>
        ))}
        {ages.length > 1 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Возраст:</span>
            <button onClick={() => setAgeFilter('all')} style={chip(ageFilter === 'all')}>все</button>
            {ages.map((a) => (
              <button key={a} onClick={() => setAgeFilter(a)} style={chip(ageFilter === a)}>{a}</button>
            ))}
          </>
        )}
      </div>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && shown.length === 0 && <div style={mutedBox}>Нет игроков с рейтингом по этим фильтрам.</div>}

      {shown.length > 0 && (
        <div style={tableCard}>
          {shown.map((p, i) => (
            <div key={i} style={row}>
              <span style={{ width: 26, color: 'var(--text-faint)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <span
                style={{
                  ...ratingPill,
                  background: p.rating == null ? 'var(--bg-surface-2)' : ratingColor(p.rating),
                  color: p.rating == null ? 'var(--text-muted)' : 'var(--ink-on-bright, #06283d)',
                }}
              >
                {p.rating == null ? '—' : p.rating.toFixed(1)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name ?? <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>без согласия</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {p.club} · {p.ageGroup}{p.position ? ` · ${p.position}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {p.matches} м · {p.minutes}′
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
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' };
const ratingPill: CSSProperties = {
  width: 38, textAlign: 'center', borderRadius: 6, padding: '3px 0', fontSize: 13, fontWeight: 600,
  fontVariantNumeric: 'tabular-nums', flex: 'none',
};

function chip(active: boolean): CSSProperties {
  return {
    padding: '4px 11px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer',
    background: active ? 'rgba(37,99,235,0.16)' : 'transparent',
    border: active ? '1px solid rgba(37,99,235,0.42)' : '1px solid var(--border)',
    color: active ? 'var(--text)' : 'var(--text-muted)',
  };
}
