import { useQuery } from '@tanstack/react-query';
import { StatTile } from '../../components/StatTile';
import { api } from '../../api/client';
import { FedScatter, type ScatterPoint } from './FedScatter';
import './federation.css';

interface ProdRow {
  slug: string;
  name: string;
  activePlayers: number;
  totalMinutes: number;
  youngPct: number | null;
}

/** Доля минут молодых: выше — лучше (клуб даёт играть на возраст старше). */
function youngColor(v: number | null): string {
  if (v == null) return 'var(--border-strong)';
  if (v >= 25) return 'var(--success)';
  if (v >= 12) return 'var(--accent-cyan)';
  if (v >= 5) return 'var(--warning)';
  return 'var(--danger)';
}

interface WinDevRow {
  slug: string; name: string; youngPct: number | null; totalMinutes: number; activePlayers: number;
  points: number | null; games: number | null; ppg: number | null; bestPos: number | null;
}

/** Зона квадранта: PPG ≥1.5 (верх таблицы) × доля молодых ≥15%. */
function zone(ppg: number, young: number): string {
  return ppg >= 1.5
    ? (young >= 15 ? 'побеждают и растят' : 'побеждают зрелостью состава')
    : (young >= 15 ? 'растят, но не побеждают' : 'ни результата, ни развития');
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
  const clubs = (data?.clubs ?? [])
    .filter((c) => c.totalMinutes > 0)
    .sort((a, b) => (b.youngPct ?? 0) - (a.youngPct ?? 0));

  const totalMin = clubs.reduce((s, c) => s + c.totalMinutes, 0);
  const youngMin = clubs.reduce((s, c) => s + ((c.youngPct ?? 0) / 100) * c.totalMinutes, 0);
  const regionYoung = totalMin ? Math.round((youngMin / totalMin) * 100) : 0;

  const wd = useQuery({ queryKey: ['federation', 'win-develop'], queryFn: () => api<{ clubs: WinDevRow[] }>('/federation/win-develop') });
  const plotted = (wd.data?.clubs ?? []).filter((c) => c.ppg != null && c.youngPct != null) as Array<WinDevRow & { ppg: number; youngPct: number }>;
  const points: ScatterPoint[] = plotted.map((c) => ({ label: c.name, x: c.ppg, y: c.youngPct }));
  const maxY = plotted.length ? Math.max(...plotted.map((c) => c.youngPct)) : 0;
  const yMax = Math.max(20, Math.ceil((maxY * 1.25) / 5) * 5);
  const matrixVerdict = (() => {
    if (plotted.length === 0) return null;
    if (plotted.length === 1) {
      const c = plotted[0];
      return `${c.name}: ${c.ppg} очка за игру, ${c.youngPct}% минут молодым — зона «${zone(c.ppg, c.youngPct)}».`;
    }
    const warn = plotted.filter((c) => c.ppg >= 1.5 && c.youngPct < 15).map((c) => c.name);
    return warn.length
      ? `${plotted.length} клубов на матрице. Берут результат зрелостью, а не развитием: ${warn.join(', ')}.`
      : `${plotted.length} клубов размещены по результату и развитию.`;
  })();

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Развитие и продуктивность</h1>
          <p className="fed-sub">Минуты молодых (играющих на возраст старше) и активная глубина состава</p>
        </div>
      </header>

      {isLoading && (
        <div className="fed-kpis">{[0, 1].map((i) => <div key={i} className="fed-skeleton" style={{ height: 96 }} />)}</div>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && clubs.length === 0 && (
        <div className="fed-empty">
          <div className="fed-empty__icon">📈</div>
          Нет данных о минутах. Нужны разобранные матчи с минутами и заполненный год команды.
        </div>
      )}

      {clubs.length > 0 && (
        <div className="fed-stack">
          <section className="fed-card fed-rise">
            <div className="fed-card__pad">
              <div className="fed-card__title">Победа vs развитие <span className="fed-faint" style={{ fontWeight: 400 }}>результат × минуты молодым</span></div>
              {points.length > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <FedScatter points={points} xMax={3} yMax={yMax} xMid={1.5} yMid={15} xLabel="Очки за игру" yLabel="Минуты молодым, %" quad={{ tr: 'растят и побеждают', tl: 'растят', br: 'зрелостью', bl: '—' }} />
                </div>
              ) : (
                <div className="fed-note">Результаты из турнирных таблиц пока не размечены как «наш клуб» — матрица оживёт с разметкой результатов и новыми клубами.</div>
              )}
              {matrixVerdict && (
                <p className="fed-finding__why" style={{ marginTop: 10 }}>
                  {matrixVerdict} Кто высоко в таблице и низко по развитию — берёт результат зрелостью состава, а не растит игроков. Эту связку не видит ни один клуб поодиночке.
                </p>
              )}
            </div>
          </section>

          <div className="fed-kpis">
            <div className="fed-rise"><StatTile label="Клубов с минутами" value={clubs.length} accent="muted" /></div>
            <div className="fed-rise"><StatTile label="Минут молодых по региону" value={regionYoung} unit="%" accent="cyan" /></div>
          </div>

          <section className="fed-card fed-rise">
            <div className="fed-table" style={{ padding: '0 8px' }}>
              <div className="fed-row fed-row--head">
                <span style={{ flex: 1 }}>Клуб</span>
                <span className="fed-num" style={{ width: 84 }}>Игроков</span>
                <span style={{ width: 168 }}>Минуты молодых</span>
              </div>
              {clubs.map((c) => (
                <div className="fed-row" key={c.slug}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fed-row__name">{c.name}</div>
                    <div className="fed-row__meta">{c.totalMinutes.toLocaleString('ru-RU')}′ всего</div>
                  </div>
                  <span className="fed-num fed-muted" style={{ width: 84 }}>{c.activePlayers}</span>
                  <span style={{ width: 168, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="fed-meter">
                      <span className="fed-meter__fill" style={{ width: `${Math.min(c.youngPct ?? 0, 100)}%`, background: youngColor(c.youngPct) }} />
                    </span>
                    <span className="fed-num fed-muted" style={{ width: 38 }}>
                      {c.youngPct == null ? '—' : `${c.youngPct}%`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
