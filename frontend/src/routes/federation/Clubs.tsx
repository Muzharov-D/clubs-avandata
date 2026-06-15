import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { healthColor } from './fedColors';
import './federation.css';

interface ClubRow {
  slug: string;
  name: string;
  plan: string;
  teams: number;
  players: number;
  matches: number;
  coverage: number | null;
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
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Клубы федерации</h1>
          <p className="fed-sub">Реестр клубов-членов региона{data ? ` · ${clubs.length}` : ''}</p>
        </div>
      </header>

      {isLoading && (
        <section className="fed-card"><div className="fed-card__pad">
          {[0, 1, 2, 3].map((i) => <div key={i} className="fed-skeleton" style={{ height: 40, marginBottom: 8 }} />)}
        </div></section>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить реестр</div>}
      {data && clubs.length === 0 && (
        <div className="fed-empty">
          <div className="fed-empty__icon">⚽</div>
          В регионе пока нет клубов-членов. Заведите членство через админку или запустите сид.
        </div>
      )}

      {clubs.length > 0 && (
        <section className="fed-card fed-rise">
          <div className="fed-table__scroll">
            <div className="fed-table" style={{ padding: '0 8px' }}>
              <div className="fed-row fed-row--head">
                <span style={{ flex: 1 }}>Клуб</span>
                <span className="fed-num" style={{ width: 72 }}>Команд</span>
                <span className="fed-num" style={{ width: 72 }}>Игроков</span>
                <span style={{ width: 156 }}>Охват данными</span>
                <span className="fed-num" style={{ width: 72 }}>Матчей</span>
              </div>
              {clubs.map((c) => (
                <div className="fed-row" key={c.slug}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fed-row__name">{c.name}</div>
                    <span className={`fed-tag fed-tag--${c.plan === 'paid' ? 'deep' : 'base'}`} style={{ marginTop: 5, display: 'inline-block' }}>
                      {c.plan === 'paid' ? 'глубина' : 'базовый слой'}
                    </span>
                  </div>
                  <span className="fed-num fed-muted" style={{ width: 72 }}>{c.teams}</span>
                  <span className="fed-num fed-muted" style={{ width: 72 }}>{c.players}</span>
                  <span style={{ width: 156, display: 'flex', alignItems: 'center', gap: 9 }}>
                    {c.coverage == null ? (
                      <span className="fed-faint">нет матчей</span>
                    ) : (
                      <>
                        <span className="fed-meter">
                          <span className="fed-meter__fill" style={{ width: `${c.coverage}%`, background: healthColor(c.coverage) }} />
                        </span>
                        <span className="fed-num fed-muted" style={{ width: 34 }}>{c.coverage}%</span>
                      </>
                    )}
                  </span>
                  <span className="fed-num fed-muted" style={{ width: 72 }}>{c.matches}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
