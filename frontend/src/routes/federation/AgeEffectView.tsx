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
  // На «Потере таланта» фильтра года нет — перекос всегда общий. Порядок 2016→2009 (от младших).
  // Цвет НЕСЁТ смысл: самый РОВНЫЙ возраст (минимум перекоса, ближе к норме 1.0×) — зелёный
  // «это хорошо»; сильнейший перекос — жёлтый. Высота столбца = величина перекоса (ниже = ровнее).
  const maxExcess = Math.max(0.1, ...withSkew.map((c) => c.skew - 1));
  const display = [...cohorts].sort((a, b) => b.year - a.year);

  return (
    <div>
      {/* Chart */}
      <div className="fed-card">
        <div className="fed-card__title">Перекос Q1÷Q4 по возрастам</div>
        <div className="fed-card__sub">Норма 1.0× · чем ниже столбец, тем ровнее набор по дате рождения</div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${display.length}, 1fr)`, gap: 12, alignItems: 'end', marginTop: 22 }}>
          {display.map((c) => {
            const isMin = minC != null && c.year === minC.year;   // самый ровный — это хорошо
            const isMax = maxC != null && c.year === maxC.year;   // сильнейший перекос
            const tone = isMin ? 'var(--success)' : isMax ? 'var(--warning)' : 'var(--text-secondary)';
            const excess = c.skew != null ? Math.max(0, c.skew - 1) : 0;
            const heightPct = (excess / maxExcess) * 100;
            return (
              <div key={c.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isMin ? 'var(--success)' : isMax ? 'var(--warning)' : 'var(--text)' }}>
                  {c.skew != null ? `${c.skew}×` : '—'}
                </span>
                <div style={{ height: 160, width: '100%', display: 'flex', alignItems: 'flex-end', background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: `${heightPct}%`, background: tone, transition: 'all 0.5s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: isMin || isMax ? 600 : 400, color: tone }}>{c.year}</span>
                <span style={{ fontSize: 10, lineHeight: 1.1, minHeight: 12, fontWeight: 600, color: tone }}>
                  {isMin ? 'ровнее всех' : isMax ? 'сильнее всех' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <p className="fed-note" style={{ marginTop: 20 }}>
          <b style={{ color: 'var(--success)' }}>Зелёный</b> — самый ровный возраст (ближе к норме 1.0×, это хорошо), <b style={{ color: 'var(--warning)' }}>жёлтый</b> — сильнейший перекос. Усиливается к 13–16 годам — это возраст отбора. Сезон {p.season}.
        </p>
      </div>
    </div>
  );
}
