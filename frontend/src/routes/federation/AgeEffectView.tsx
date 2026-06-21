import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './federation.css';

/**
 * Возрастной эффект (relative-age) — ТРЕТИЙ взгляд на тот же снимок region_census,
 * что и Карта региона / Пирамида лиг (никакого нового обхода FFSPB). Показывает
 * перекос даты рождения Q1÷Q4 ПО КОГОРТАМ Первенства (год рождения 2009..2016):
 * где воронка отбора жёстче всего давит поздно-рождённых.
 */

interface AgeCohort {
  year: number;
  players: number;
  q1pct: number;
  q4pct: number;
  skew: number | null;
}
interface PyramidPayload {
  season: string;
  ageEffect: AgeCohort[];
  capturedAt?: string | null;
}
interface RegionMapData {
  /** Пирамида лиг FFSPB (ВСЕ лиги региона) — последний месячный снимок, null если ещё нет. */
  pyramid: PyramidPayload | null;
}

const num = (n: number): string => Math.round(n).toLocaleString('ru-RU');

export function FederationAgeEffect() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'region-map'],
    queryFn: () => api<RegionMapData>('/federation/region-map'),
  });

  const cohorts = data?.pyramid?.ageEffect ?? [];
  const totalPlayers = cohorts.reduce((a, c) => a + c.players, 0);

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Перекос по когортам</h1>
          <p className="fed-sub">
            {data && cohorts.length > 0
              ? `Перекос даты рождения по годам · вся регистрация ФФСПб · ${num(totalPlayers)} игроков`
              : (federation?.region ?? federation?.name ?? 'Регион')}
          </p>
        </div>
      </header>

      {isLoading && <div className="fed-skeleton" style={{ height: 320 }} />}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить возрастной эффект</div>}

      {data && <AgeEffectBody p={data.pyramid} />}
    </div>
  );
}

function AgeEffectBody({ p }: { p: PyramidPayload | null }) {
  const cohorts = p?.ageEffect ?? [];
  if (!p || cohorts.length === 0) {
    return (
      <div className="fed-empty">
        <div className="fed-empty__icon" aria-hidden>📅</div>
        Перепись по когортам ещё не снята — данные появятся после ближайшего обхода FFSPB.
      </div>
    );
  }

  // Когорты с известным перекосом — для поиска крайних.
  const withSkew = cohorts.filter((c): c is AgeCohort & { skew: number } => c.skew != null);
  const maxC = withSkew.reduce<(AgeCohort & { skew: number }) | null>((m, c) => (m == null || c.skew > m.skew ? c : m), null);
  const minC = withSkew.reduce<(AgeCohort & { skew: number }) | null>((m, c) => (m == null || c.skew < m.skew ? c : m), null);

  // Высота столбика ∝ (skew − 1): паритет 1.0× = пол. Нормируем по максимальному избытку.
  const maxExcess = Math.max(0.1, ...withSkew.map((c) => c.skew - 1));

  const captured = p.capturedAt ? new Date(p.capturedAt).toLocaleDateString('ru-RU') : null;

  return (
    <div className="fed-stack">
      {maxC && minC && (
        <section className="fed-finding fed-finding--hero fed-rise">
          <div className="fed-finding__kicker">⚠ Перекос по когортам</div>
          <p className="fed-finding__verdict">
            Ярче всех — {maxC.year}: {maxC.skew}×. Ровнее всех — {minC.year}: {minC.skew}×.
          </p>
          <p className="fed-finding__why">
            Перекос Q1÷Q4 — во сколько раз больше игроков рождено в начале года (январь–март),
            чем в конце (октябрь–декабрь). Паритет — 1.0×.
          </p>
        </section>
      )}

      <section className="fed-card fed-rise">
        <div className="fed-card__pad">
          <div className="fed-card__title">
            Перекос Q1÷Q4 по когортам
            <span className="fed-faint" style={{ fontWeight: 400 }}>Первенство · паритет 1.0×</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cohorts.length}, 1fr)`, gap: 10, alignItems: 'end' }}>
            {cohorts.map((c) => {
              const isMax = maxC != null && c.year === maxC.year;
              const isMin = minC != null && c.year === minC.year;
              const excess = c.skew != null ? Math.max(0, c.skew - 1) : 0;
              const heightPct = (excess / maxExcess) * 100;
              const barColor = isMax ? 'var(--accent-cyan)' : 'var(--brand-gradient)';
              return (
                <div key={c.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span
                    className="fed-num"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: isMax ? 'var(--accent-cyan)' : 'var(--text)',
                      opacity: isMin ? 0.5 : 1,
                    }}
                  >
                    {c.skew != null ? `${c.skew}×` : '—'}
                  </span>
                  <span
                    style={{
                      width: '100%',
                      height: 160,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface-3)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: '100%',
                        height: `${heightPct}%`,
                        background: barColor,
                        borderRadius: 'var(--radius-sm)',
                        opacity: isMin ? 0.45 : 1,
                        transition: 'height var(--dur) var(--ease-out)',
                      }}
                    />
                  </span>
                  <span
                    className="fed-faint"
                    style={{ fontSize: 11.5, fontWeight: isMax ? 700 : 400, color: isMax ? 'var(--accent-cyan)' : undefined }}
                  >
                    {c.year}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="fed-faint" style={{ fontSize: 11.5, margin: '16px 0 0', lineHeight: 1.55 }}>
            Перекос нарастает к воротам отбора (13–16 лет) — точка вмешательства регулятора.
            Сезон {p.season} · тот же снимок, что и «Карта региона»{captured ? ` · данные с ${captured}` : ''}.
          </p>
        </div>
      </section>
    </div>
  );
}
