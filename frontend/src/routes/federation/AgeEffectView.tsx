import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useFedYear } from './avYear';
import { num } from './utils';
import './federation.css';

export interface AgeCohort { year: number; players: number; q1pct: number; q4pct: number; skew: number | null }
interface PyramidPayload { season: string; ageEffect: AgeCohort[]; capturedAt?: string | null }
interface RegionMapData { pyramid: PyramidPayload | null }

export const useRegionMap = () => useQuery({ queryKey: ['federation', 'region-map'], queryFn: () => api<RegionMapData>('/federation/region-map') });

export function FederationAgeEffect() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data } = useRegionMap();
  const cohorts = data?.pyramid?.ageEffect ?? [];
  const totalPlayers = cohorts.reduce((a, c) => a + c.players, 0);
  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Возрастной эффект</div>
        <h1 className="fed-hero__title">Перекос по когортам</h1>
        <p className="fed-hero__sub">
          {data && cohorts.length > 0
            ? `Перекос даты рождения по годам · ${num(totalPlayers)} игроков`
            : (federation?.region ?? federation?.name ?? 'Регион')}
        </p>
      </div>
      <AgeEffectBody />
    </div>
  );
}

export function AgeEffectBody() {
  const { year } = useFedYear();
  const { data, isLoading, error } = useRegionMap();
  if (isLoading) return <div className="fed-skeleton" style={{ height: 320 }} />;
  if (error) return <div className="fed-empty" style={{ color: 'var(--danger)' }}>Не удалось загрузить возрастной эффект</div>;
  const p = data?.pyramid ?? null;
  const cohorts = p?.ageEffect ?? [];
  if (!p || cohorts.length === 0) {
    return <div className="fed-empty">Данные по когортам ещё не сформированы.</div>;
  }

  const withSkew = cohorts.filter((c): c is AgeCohort & { skew: number } => c.skew != null);
  const maxC = withSkew.reduce<(AgeCohort & { skew: number }) | null>((m, c) => (m == null || c.skew > m.skew ? c : m), null);
  const minC = withSkew.reduce<(AgeCohort & { skew: number }) | null>((m, c) => (m == null || c.skew < m.skew ? c : m), null);
  const selected = year != null ? cohorts.find((c) => c.year === year) ?? null : null;
  const focusYear = selected?.year ?? maxC?.year ?? null;
  const maxExcess = Math.max(0.1, ...withSkew.map((c) => c.skew - 1));

  return (
    <div>
      {/* Hero finding */}
      {selected ? (
        <div className="fed-card" style={{ marginBottom: 32, borderLeft: '3px solid var(--accent)' }}>
          <div className="fed-badge fed-badge--accent" style={{ marginBottom: 12 }}>Перекос · {selected.year} г.р.</div>
          <h3 style={{ fontSize: 24, fontWeight: 300, margin: '0 0 8px' }}>
            {selected.year}: перекос {selected.skew != null ? `${selected.skew}×` : '—'} · Q1 {selected.q1pct}% — Q4 {selected.q4pct}%
          </h3>
          <p className="fed-note">
            Расчёт по {num(selected.players)} игрокам когорты.
            {maxC && minC ? ` В регионе наибольший перекос — ${maxC.year} (${maxC.skew}×), наименьший — ${minC.year} (${minC.skew}×).` : ''}
          </p>
        </div>
      ) : maxC && minC ? (
        <div className="fed-card" style={{ marginBottom: 32, borderLeft: '3px solid var(--accent)' }}>
          <div className="fed-badge fed-badge--accent" style={{ marginBottom: 12 }}>Перекос по когортам</div>
          <h3 style={{ fontSize: 24, fontWeight: 300, margin: '0 0 8px' }}>
            Наибольший перекос — {maxC.year}: {maxC.skew}×. Наименьший — {minC.year}: {minC.skew}×.
          </h3>
          <p className="fed-note">Перекос Q1÷Q4 — отношение числа рождённых в начале года к рождённым в конце.</p>
        </div>
      ) : null}

      {/* Chart */}
      <div className="fed-card">
        <div className="fed-card__title">Перекос Q1÷Q4 по когортам</div>
        <div className="fed-card__sub">Первенство · паритет 1.0×</div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cohorts.length}, 1fr)`, gap: 12, alignItems: 'end', marginTop: 32 }}>
          {cohorts.map((c) => {
            const isFocus = focusYear != null && c.year === focusYear;
            const isMin = !selected && minC != null && c.year === minC.year;
            const dim = selected ? !isFocus : isMin;
            const excess = c.skew != null ? Math.max(0, c.skew - 1) : 0;
            const heightPct = (excess / maxExcess) * 100;
            return (
              <div key={c.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: isFocus ? 'var(--accent)' : 'var(--text)', opacity: dim ? 0.4 : 1 }}>
                  {c.skew != null ? `${c.skew}×` : '—'}
                </span>
                <div style={{ height: 160, width: '100%', display: 'flex', alignItems: 'flex-end', background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: `${heightPct}%`, background: isFocus ? 'var(--accent)' : 'var(--text-secondary)', opacity: dim ? 0.4 : 1, transition: 'all 0.5s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: isFocus ? 600 : 400, color: isFocus ? 'var(--accent)' : 'var(--text-secondary)' }}>{c.year}</span>
              </div>
            );
          })}
        </div>

        <p className="fed-note" style={{ marginTop: 24 }}>
          Перекос усиливается к возрасту отбора (13–16 лет). Сезон {p.season}.
        </p>
      </div>
    </div>
  );
}
