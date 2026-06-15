import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import './federation.css';

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
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Соревнования региона</h1>
          <p className="fed-sub">Сводные турнирные таблицы по всем клубам турнира (открытый слой)</p>
        </div>
      </header>

      {isLoading && <div className="fed-skeleton" style={{ height: 240 }} />}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && comps.length === 0 && (
        <div className="fed-empty"><div className="fed-empty__icon">🏆</div>Турнирных таблиц пока нет. Синхронизируйте соревнования клубов.</div>
      )}

      {comps.length > 0 && (
        <div className="fed-stack">
          <div className="fed-tabs">
            {comps.map((c) => (
              <button key={c.ageGroup} onClick={() => setAge(c.ageGroup)} className={`fed-tab${selected?.ageGroup === c.ageGroup ? ' fed-tab--active' : ''}`}>
                {c.ageGroup}
              </button>
            ))}
          </div>
          {selected && <StandingsTable comp={selected} />}
        </div>
      )}
    </div>
  );
}

function StandingsTable({ comp }: { comp: Competition }) {
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">{comp.leagueName ?? 'Турнир'} · {comp.season}</div>
        <div className="fed-table__scroll">
          <table className="fed-dt">
            <thead>
              <tr>
                <th className="fed-dt__rank" style={{ cursor: 'default' }}>#</th>
                <th style={{ cursor: 'default' }}>Команда</th>
                {['И', 'В', 'Н', 'П', '±', 'О'].map((h) => (
                  <th key={h} style={{ cursor: 'default', width: 44 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comp.table.map((t, i) => {
                const diff = num(t.scored) - num(t.missed);
                return (
                  <tr key={i}>
                    <td className="fed-dt__rank">{str(t.pos) || i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{str(t.team) || str(t.name) || '—'}</td>
                    <td className="fed-muted">{str(t.games) || '—'}</td>
                    <td className="fed-muted">{str(t.wins) || '—'}</td>
                    <td className="fed-muted">{str(t.draws) || '—'}</td>
                    <td className="fed-muted">{str(t.losses) || '—'}</td>
                    <td style={{ color: diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td style={{ fontWeight: 700 }}>{str(t.points) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
