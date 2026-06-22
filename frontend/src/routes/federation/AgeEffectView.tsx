import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useFedYear } from './avYear';
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

const useRegionMap = () => useQuery({
  queryKey: ['federation', 'region-map'],
  queryFn: () => api<RegionMapData>('/federation/region-map'),
});

export function FederationAgeEffect() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data } = useRegionMap();
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
      <AgeEffectBody />
    </div>
  );
}

/**
 * Тело «Перекоса по когортам» — гистограмма Q1÷Q4 по годам рождения.
 * Когорта: ageEffect ЕСТЬ по годам, поэтому выбранный в глобальном useFedYear
 * год подсвечивается (а вердикт говорит именно о нём); «все» — обычный обзор всех
 * когорт с поиском крайних. Самонесущее (fetch внутри), без шапки экрана.
 */
export function AgeEffectBody() {
  const { year, division } = useFedYear();
  const { data, isLoading, error } = useRegionMap();
  if (isLoading) return <div className="fed-skeleton" style={{ height: 320 }} />;
  if (error) return <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить возрастной эффект</div>;
  const p = data?.pyramid ?? null;
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

  // Выбранная когорта (глобальный фильтр) — её и подсвечиваем; иначе ярче всех.
  const selected = year != null ? cohorts.find((c) => c.year === year) ?? null : null;
  const focusYear = selected?.year ?? maxC?.year ?? null;

  // Высота столбика ∝ (skew − 1): паритет 1.0× = пол. Нормируем по максимальному избытку.
  const maxExcess = Math.max(0.1, ...withSkew.map((c) => c.skew - 1));

  const captured = p.capturedAt ? new Date(p.capturedAt).toLocaleDateString('ru-RU') : null;

  return (
    <div className="fed-stack">
      {selected ? (
        <section className="fed-finding fed-finding--hero fed-rise">
          <div className="fed-finding__kicker">⚠ Перекос · {selected.year} г.р.</div>
          <p className="fed-finding__verdict">
            {selected.year}: перекос {selected.skew != null ? `${selected.skew}×` : '—'} · Q1 {selected.q1pct}% — Q4 {selected.q4pct}%
          </p>
          <p className="fed-finding__why">
            По {num(selected.players)} игрокам когорты. Перекос Q1÷Q4 — во сколько раз больше рождённых в начале
            года (январь–март), чем в конце (октябрь–декабрь). Паритет — 1.0×.{maxC && minC ? ` По региону ярче всех ${maxC.year} (${maxC.skew}×), ровнее ${minC.year} (${minC.skew}×).` : ''}
          </p>
        </section>
      ) : maxC && minC && (
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
              const isFocus = focusYear != null && c.year === focusYear;
              const isMin = !selected && minC != null && c.year === minC.year;
              // Когда когорта выбрана — не в фокусе бледнеет; в обзоре «все» бледнеет только минимум.
              const dim = selected ? !isFocus : isMin;
              const excess = c.skew != null ? Math.max(0, c.skew - 1) : 0;
              const heightPct = (excess / maxExcess) * 100;
              const barColor = isFocus ? 'var(--accent-cyan)' : 'var(--brand-gradient)';
              return (
                <div key={c.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span
                    className="fed-num"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: isFocus ? 'var(--accent-cyan)' : 'var(--text)',
                      opacity: dim ? 0.5 : 1,
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
                        opacity: dim ? 0.45 : 1,
                        transition: 'height var(--dur) var(--ease-out)',
                      }}
                    />
                  </span>
                  <span
                    className="fed-faint"
                    style={{ fontSize: 11.5, fontWeight: isFocus ? 700 : 400, color: isFocus ? 'var(--accent-cyan)' : undefined }}
                  >
                    {c.year}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="fed-faint" style={{ fontSize: 11.5, margin: '16px 0 0', lineHeight: 1.55 }}>
            Перекос нарастает к воротам отбора (13–16 лет) — точка вмешательства регулятора.
            Здесь — ВСЕ когорты переписи ФФСПб; фильтр года вверху (только когорты с разбором AvanData)
            подсвечивает выбранную, но график показывает все. Перекос считается по всей регистрации
            региона — отдельного среза по лиге <b style={{ color: 'var(--accent-cyan)' }}>{division}</b> в
            этом снимке нет (срез по лиге доступен на экранах «Таланты» и «Клубы»). Сезон {p.season} ·
            тот же снимок, что и «Карта региона»{captured ? ` · данные с ${captured}` : ''}.
          </p>
        </div>
      </section>
    </div>
  );
}
