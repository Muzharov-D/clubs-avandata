import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ratingColor, healthColor, tint } from './fedColors';
import './federation.css';

interface BenchRow {
  slug: string;
  name: string;
  plan: string;
  players: number;
  matches: number;
  coverage: number | null;
  avgRating: number | null;
  attack: number | null;
  defence: number | null;
  passing: number | null;
}

type SortKey = 'name' | 'players' | 'matches' | 'coverage' | 'avgRating' | 'attack' | 'defence' | 'passing';

function exportCsv(rows: BenchRow[]) {
  const header = ['Клуб', 'Тариф', 'Игроков', 'Матчей', 'Охват %', 'Ср. индекс', 'Атака', 'Оборона', 'Пас'];
  const lines = rows.map((r) =>
    [r.name, r.plan, r.players, r.matches, r.coverage ?? '', r.avgRating ?? '', r.attack ?? '', r.defence ?? '', r.passing ?? ''].join(';'),
  );
  // BOM — чтобы Excel правильно открыл кириллицу в UTF-8.
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
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ru') * dir;
      const an = a[sortKey] == null ? -Infinity : Number(a[sortKey]);
      const bn = b[sortKey] == null ? -Infinity : Number(b[sortKey]);
      return (an - bn) * dir;
    });
    return arr;
  }, [clubs, sortKey, dir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === 'name' ? 1 : -1); }
  };

  const cols: Array<{ key: SortKey; label: string }> = [
    { key: 'name', label: 'Клуб' },
    { key: 'players', label: 'Игроков' },
    { key: 'matches', label: 'Матчей' },
    { key: 'coverage', label: 'Охват' },
    { key: 'avgRating', label: 'Ср. индекс' },
    { key: 'attack', label: 'Атака' },
    { key: 'defence', label: 'Оборона' },
    { key: 'passing', label: 'Пас' },
  ];
  const arrow = (k: SortKey) => (sortKey === k ? (dir === -1 ? ' ↓' : ' ↑') : '');

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Бенчмаркинг клубов</h1>
          <p className="fed-sub">Сравнение по ключевым показателям · клик по столбцу сортирует</p>
        </div>
        {clubs.length > 0 && <button onClick={() => exportCsv(sorted)} className="fed-btn">Экспорт CSV</button>}
      </header>

      {isLoading && (
        <section className="fed-card"><div className="fed-card__pad">
          {[0, 1, 2, 3].map((i) => <div key={i} className="fed-skeleton" style={{ height: 40, marginBottom: 8 }} />)}
        </div></section>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && clubs.length === 0 && (
        <div className="fed-empty"><div className="fed-empty__icon">📊</div>Нет клубов для сравнения.</div>
      )}

      {sorted.length > 0 && (
        <section className="fed-card fed-rise">
          <div className="fed-table__scroll">
            <table className="fed-dt">
              <thead>
                <tr>
                  <th className="fed-dt__rank" style={{ cursor: 'default' }} />
                  {cols.map((c) => (
                    <th key={c.key} onClick={() => onSort(c.key)} className={sortKey === c.key ? 'is-sorted' : undefined}>
                      {c.label}{arrow(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.slug}>
                    <td className="fed-dt__rank">{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ fontWeight: 500 }}>{c.name}</span>
                        <span className={`fed-tag fed-tag--${c.plan === 'paid' ? 'deep' : 'base'}`}>
                          {c.plan === 'paid' ? 'глубина' : 'база'}
                        </span>
                      </div>
                    </td>
                    <td className="fed-muted">{c.players}</td>
                    <td className="fed-muted">{c.matches}</td>
                    <td style={{ color: c.coverage == null ? 'var(--text-faint)' : healthColor(c.coverage) }}>
                      {c.coverage == null ? '—' : `${c.coverage}%`}
                    </td>
                    <td>
                      {c.avgRating == null ? (
                        <span className="fed-faint">—</span>
                      ) : (
                        <span
                          className="fed-rate"
                          style={{ display: 'inline-block', minWidth: 46, color: ratingColor(c.avgRating), background: tint(ratingColor(c.avgRating)), borderColor: tint(ratingColor(c.avgRating), 38) }}
                        >
                          {c.avgRating.toFixed(1)}
                        </span>
                      )}
                    </td>
                    {([c.attack, c.defence, c.passing] as Array<number | null>).map((v, j) => (
                      <td key={j} style={{ color: v == null ? 'var(--text-faint)' : ratingColor(v), fontWeight: 600 }}>
                        {v == null ? '—' : v.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
