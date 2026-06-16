import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import './federation.css';

interface Scorer {
  player: string;
  club: string | null;
  goals: number;
  assists: number;
}

/**
 * Бомбардиры и ассистенты региона — открытый слой FFSPB (события матчей всех
 * клубов-членов). Имена открытые (не PII), рейтинга нет. Дедуп общих матчей — на бэке.
 */
export function FederationScorers() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'scorers'],
    queryFn: () => api<{ scorers: Scorer[]; assisters: Scorer[] }>('/federation/scorers'),
  });
  const scorers = data?.scorers ?? [];
  const assisters = data?.assisters ?? [];
  const empty = !isLoading && !error && scorers.length === 0 && assisters.length === 0;

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Бомбардиры и ассистенты региона</h1>
          <p className="fed-sub">Открытые данные FFSPB · по протоколам матчей всех клубов региона</p>
        </div>
      </header>

      {isLoading && <div className="fed-cols">{[0, 1].map((i) => <div key={i} className="fed-skeleton" style={{ height: 300 }} />)}</div>}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {empty && (
        <div className="fed-empty">
          <div className="fed-empty__icon">⚽</div>
          Событий матчей пока нет — бомбардиры появятся, когда подтянутся протоколы из FFSPB.
        </div>
      )}

      {!empty && !isLoading && !error && (
        <div className="fed-cols">
          <ScorerCard title="Бомбардиры · голы" rows={scorers} field="goals" />
          <ScorerCard title="Ассистенты · передачи" rows={assisters} field="assists" />
        </div>
      )}
    </div>
  );
}

function ScorerCard({ title, rows, field }: { title: string; rows: Scorer[]; field: 'goals' | 'assists' }) {
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">{title}</div>
        {rows.length === 0 ? (
          <div className="fed-note">Нет данных</div>
        ) : (
          <div>
            {rows.map((r, i) => {
              const v = r[field];
              const max = rows[0][field] || 1;
              return (
                <div key={`${r.player}-${i}`} className="fed-row" style={{ gap: 10 }}>
                  <span className="fed-faint fed-num" style={{ width: 18, fontSize: 12 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fed-row__name">{r.player}</div>
                    {r.club && <div className="fed-row__meta">{r.club}</div>}
                  </div>
                  <span className="fed-num" style={{ fontWeight: 700, color: 'var(--accent-cyan)', width: 28 }}>{v}</span>
                  <span className="fed-meter" style={{ width: 44, flex: 'none' }}>
                    <span className="fed-meter__fill" style={{ width: `${max > 0 ? (v / max) * 100 : 0}%`, background: 'var(--accent-cyan)' }} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
