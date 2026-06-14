import { type CSSProperties, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface Competition {
  ageGroup: string;
  season: string;
  leagueName: string | null;
  table: Array<Record<string, unknown>>;
}

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' ? v : v == null || v === '' ? 0 : Number(v) || 0);

/**
 * Соревнования региона (Эпик 3, FR11) — открытый слой: сводные таблицы по
 * возрастам (все клубы турнира). Данные: /federation/competitions.
 */
export function FederationCompetitions() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'competitions'],
    queryFn: () => api<{ competitions: Competition[] }>('/federation/competitions'),
  });
  const comps = data?.competitions ?? [];
  const [age, setAge] = useState<string | null>(null);
  const selected = comps.find((c) => c.ageGroup === age) ?? comps[0] ?? null;

  return (
    <div>
      <h1 style={titleStyle}>Соревнования региона</h1>
      <p style={subStyle}>Сводные таблицы по всем клубам турнира</p>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && comps.length === 0 && (
        <div style={mutedBox}>Турнирных таблиц пока нет. Синхронизируйте соревнования клубов.</div>
      )}

      {comps.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0' }}>
            {comps.map((c) => (
              <button key={c.ageGroup} onClick={() => setAge(c.ageGroup)} style={tabStyle(selected?.ageGroup === c.ageGroup)}>
                {c.ageGroup}
              </button>
            ))}
          </div>
          {selected && <StandingsTable comp={selected} />}
        </>
      )}
    </div>
  );
}

function StandingsTable({ comp }: { comp: Competition }) {
  return (
    <div style={tableCard}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
        {comp.leagueName ?? 'Турнир'} · {comp.season}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--text-faint)', fontSize: 11 }}>
              <th style={thN}>#</th>
              <th style={thTeam}>Команда</th>
              <th style={thN}>И</th>
              <th style={thN}>В</th>
              <th style={thN}>Н</th>
              <th style={thN}>П</th>
              <th style={thN}>±</th>
              <th style={thN}>О</th>
            </tr>
          </thead>
          <tbody>
            {comp.table.map((t, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdN}>{str(t.pos) || i + 1}</td>
                <td style={tdTeam}>{str(t.team) || str(t.name) || '—'}</td>
                <td style={tdN}>{str(t.games) || '—'}</td>
                <td style={tdN}>{str(t.wins) || '—'}</td>
                <td style={tdN}>{str(t.draws) || '—'}</td>
                <td style={tdN}>{str(t.losses) || '—'}</td>
                <td style={tdN}>{num(t.scored) - num(t.missed)}</td>
                <td style={{ ...tdN, fontWeight: 600 }}>{str(t.points) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const titleStyle: CSSProperties = { fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 };
const subStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 };
const mutedBox: CSSProperties = { marginTop: 16, color: 'var(--text-muted)', fontSize: 14 };
const tableCard: CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px',
};
const thN: CSSProperties = { padding: '4px 6px', textAlign: 'right', fontWeight: 400 };
const thTeam: CSSProperties = { padding: '4px 6px', textAlign: 'left', fontWeight: 400 };
const tdN: CSSProperties = { padding: '7px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' };
const tdTeam: CSSProperties = { padding: '7px 6px', textAlign: 'left', color: 'var(--text)' };

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer',
    background: active ? 'rgba(37,99,235,0.16)' : 'transparent',
    border: active ? '1px solid rgba(37,99,235,0.42)' : '1px solid var(--border)',
    color: active ? 'var(--text)' : 'var(--text-muted)',
  };
}
