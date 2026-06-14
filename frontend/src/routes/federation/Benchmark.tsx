import { type CSSProperties, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface BenchRow {
  slug: string;
  name: string;
  plan: string;
  players: number;
  matches: number;
  coverage: number | null;
  avgRating: number | null;
}

type SortKey = 'name' | 'players' | 'matches' | 'coverage' | 'avgRating';

function exportCsv(rows: BenchRow[]) {
  const header = ['Клуб', 'Тариф', 'Игроков', 'Матчей', 'Охват %', 'Ср. рейтинг'];
  const lines = rows.map((r) => [r.name, r.plan, r.players, r.matches, r.coverage ?? '', r.avgRating ?? ''].join(';'));
  // BOM (﻿) — чтобы Excel правильно открыл кириллицу в UTF-8.
  const csv = ['﻿' + header.join(';'), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'benchmark-region.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Бенчмаркинг клубов (Эпик 7, FR24) — сортируемая таблица KPI + экспорт CSV (FR23).
 */
export function FederationBenchmark() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'benchmark'],
    queryFn: () => api<{ clubs: BenchRow[] }>('/federation/benchmark'),
  });
  const [sortKey, setSortKey] = useState<SortKey>('avgRating');
  const [dir, setDir] = useState<1 | -1>(-1);
  const clubs = data?.clubs ?? [];

  const sorted = useMemo(() => {
    const arr = [...clubs];
    arr.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = av == null ? -Infinity : Number(av);
      const bn = bv == null ? -Infinity : Number(bv);
      return (an - bn) * dir;
    });
    return arr;
  }, [clubs, sortKey, dir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === 'name' ? 1 : -1);
    }
  };

  const cols: Array<{ key: SortKey; label: string; w?: number; left?: boolean }> = [
    { key: 'name', label: 'Клуб', left: true },
    { key: 'players', label: 'Игроков', w: 84 },
    { key: 'matches', label: 'Матчей', w: 84 },
    { key: 'coverage', label: 'Охват', w: 84 },
    { key: 'avgRating', label: 'Ср. рейтинг', w: 104 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={titleStyle}>Бенчмаркинг клубов</h1>
          <p style={subStyle}>Сравнение по ключевым показателям · клик по колонке — сортировка</p>
        </div>
        {clubs.length > 0 && <button onClick={() => exportCsv(sorted)} style={exportBtn}>Экспорт CSV</button>}
      </div>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && clubs.length === 0 && <div style={mutedBox}>Нет клубов для сравнения.</div>}

      {sorted.length > 0 && (
        <div style={{ ...tableCard, marginTop: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    style={{ ...thStyle, textAlign: c.left ? 'left' : 'right', width: c.w, cursor: 'pointer' }}
                  >
                    {c.label}{sortKey === c.key ? (dir === -1 ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.slug} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={tdL}>
                    <span>{c.name}</span>
                    <span style={c.plan === 'paid' ? planDeep : planBase}>{c.plan === 'paid' ? 'глубина' : 'база'}</span>
                  </td>
                  <td style={tdN}>{c.players}</td>
                  <td style={tdN}>{c.matches}</td>
                  <td style={tdN}>{c.coverage == null ? '—' : `${c.coverage}%`}</td>
                  <td style={{ ...tdN, fontWeight: 600 }}>{c.avgRating == null ? '—' : c.avgRating.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const titleStyle: CSSProperties = { fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 };
const subStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 };
const mutedBox: CSSProperties = { marginTop: 16, color: 'var(--text-muted)', fontSize: 14 };
const tableCard: CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px' };
const thStyle: CSSProperties = { padding: '6px 8px', fontWeight: 400, userSelect: 'none' };
const tdL: CSSProperties = { padding: '9px 8px', textAlign: 'left', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 };
const tdN: CSSProperties = { padding: '9px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' };
const exportBtn: CSSProperties = {
  flex: 'none', background: 'transparent', color: 'var(--accent-cyan, #22d3ee)',
  border: '1px solid rgba(34,211,238,0.35)', borderRadius: 8, padding: '7px 14px',
  cursor: 'pointer', fontSize: 13, fontWeight: 500,
};
const planDeep: CSSProperties = {
  fontSize: 10, color: 'var(--ink-on-bright, #06283d)', background: 'var(--accent-cyan, #22d3ee)',
  borderRadius: 5, padding: '1px 6px', fontWeight: 500,
};
const planBase: CSSProperties = {
  fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px',
};
