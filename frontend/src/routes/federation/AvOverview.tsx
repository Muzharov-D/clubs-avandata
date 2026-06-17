import { useQuery } from '@tanstack/react-query';
import { StatTile } from '../../components/StatTile';
import { api } from '../../api/client';
import './federation.css';

interface TRef { key: string; title: string; category: string; divisionTitle: string }
interface Agg {
  ref: TRef; teams: number; players: number; matches: number; analyzed: number;
  goals: number; goalsPerMatch: number | null;
}
interface Overview {
  divisions: string[]; tournaments: number; teams: number; players: number;
  matches: number; analyzed: number; goals: number; byTournament: Agg[];
}

/**
 * Обзор Первенства из РЕАЛЬНОЙ базы (прокси /federation/av/overview).
 * Сумма по всем турнирам×дивизионам + разрез по турнирам.
 */
export function FederationAvOverview() {
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'overview'], queryFn: () => api<Overview>('/federation/av/overview') });

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Обзор Первенства</h1>
          <p className="fed-sub">Санкт-Петербург · реальная база разборов{data ? ` · ${data.divisions.join(' + ')}` : ''}</p>
        </div>
      </header>

      {isLoading && <div className="fed-census">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="fed-skeleton" style={{ height: 104 }} />)}</div>}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}

      {data && (
        <div className="fed-stack">
          <div className="fed-census fed-rise">
            <div className="fed-census__cell"><StatTile label="Турниры (возрасты)" value={data.tournaments} accent="cyan" big /></div>
            <div className="fed-census__cell"><StatTile label="Команды" value={data.teams} accent="muted" big /></div>
            <div className="fed-census__cell"><StatTile label="Игроки (разобр.)" value={data.players} accent="violet" big /></div>
            <div className="fed-census__cell"><StatTile label="Матчи" value={data.matches} extra={`${data.analyzed} разобрано`} accent="gold" big /></div>
            <div className="fed-census__cell"><StatTile label="Голы" value={data.goals} accent="green" big /></div>
          </div>

          <section className="fed-card fed-rise">
            <div className="fed-table__scroll">
              <table className="fed-dt">
                <thead>
                  <tr>
                    <th style={{ minWidth: 170 }}>Турнир</th>
                    <th style={{ textAlign: 'right' }}>Команды</th>
                    <th style={{ textAlign: 'right' }}>Матчи</th>
                    <th style={{ textAlign: 'right' }}>Разобр.</th>
                    <th style={{ textAlign: 'right' }}>Голы</th>
                    <th style={{ textAlign: 'right' }}>Голы/матч</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTournament.map((a) => (
                    <tr key={a.ref.key}>
                      <td>{a.ref.title}</td>
                      <td style={{ textAlign: 'right' }}>{a.teams}</td>
                      <td style={{ textAlign: 'right' }}>{a.matches}</td>
                      <td style={{ textAlign: 'right' }}>{a.analyzed}</td>
                      <td style={{ textAlign: 'right' }}>{a.goals}</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-cyan)' }}>{a.goalsPerMatch ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
