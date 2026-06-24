import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
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
        <div className="fed-hero__kicker">Перекос по дате рождения</div>
        <h1 className="fed-hero__title">Перекос по возрастам</h1>
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
  const { data, isLoading, error } = useRegionMap();
  if (isLoading) return <div className="fed-skeleton" style={{ height: 320 }} />;
  if (error) return <div className="fed-empty" style={{ color: 'var(--danger)' }}>Не удалось загрузить возрастной эффект</div>;
  const p = data?.pyramid ?? null;
  const cohorts = p?.ageEffect ?? [];
  if (!p || cohorts.length === 0) {
    return <div className="fed-empty">Данные по возрастам ещё не готовы.</div>;
  }

  const withSkew = cohorts.filter((c): c is AgeCohort & { skew: number } => c.skew != null);
  const maxC = withSkew.reduce<(AgeCohort & { skew: number }) | null>((m, c) => (m == null || c.skew > m.skew ? c : m), null);
  const minC = withSkew.reduce<(AgeCohort & { skew: number }) | null>((m, c) => (m == null || c.skew < m.skew ? c : m), null);
  // На «Потере таланта» фильтра года нет — перекос всегда общий по когортам (без «Выбран …»).
  const selected: AgeCohort | null = null;
  const focusYear = maxC?.year ?? null;
  const maxExcess = Math.max(0.1, ...withSkew.map((c) => c.skew - 1));

  return (
    <div>
      {/* Вердикт ВСЕГДА общий (сравнение когорт): одиночное «2010: 2.39×» без контекста
          бессмысленно — смысл перекоса в сравнении. Выбранный год не подменяет вердикт,
          а лишь подсвечивается на графике (+ короткая строка). */}
      {maxC && minC ? (
        <div className="fed-card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent)' }}>
          <div className="fed-badge fed-badge--accent" style={{ marginBottom: 12 }}>Перекос по возрастам</div>
          <h3 style={{ fontSize: 24, fontWeight: 300, margin: '0 0 8px' }}>
            Наибольший перекос — {maxC.year}: {maxC.skew}×. Наименьший — {minC.year}: {minC.skew}×.
          </h3>
          <p className="fed-note">
            Перекос Q1÷Q4 — отношение числа рождённых в начале года к рождённым в конце.
          </p>
        </div>
      ) : null}

      {/* Chart */}
      <div className="fed-card">
        <div className="fed-card__title">Перекос Q1÷Q4 по возрастам</div>
        <div className="fed-card__sub">Первенство · норма 1.0×</div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cohorts.length}, 1fr)`, gap: 12, alignItems: 'end', marginTop: 22 }}>
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
          Перекос усиливается к 13–16 годам — это возраст отбора. Сезон {p.season}.
        </p>
      </div>
    </div>
  );
}
