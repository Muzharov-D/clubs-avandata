import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import './federation.css';

interface AgeEffectData {
  region: { q1: number; q2: number; q3: number; q4: number; total: number };
  clubs: Array<{ slug: string; name: string; total: number; q1Pct: number | null }>;
}

const Q_LABELS = ['Q1 · янв–мар', 'Q2 · апр–июн', 'Q3 · июл–сен', 'Q4 · окт–дек'];

/** Перекос к Q1: ближе к 25% — лучше (равномерный отбор), выше — сильнее смещение. */
function skewColor(q1pct: number | null): string {
  if (q1pct == null) return 'var(--border-strong)';
  if (q1pct >= 38) return 'var(--danger)';
  if (q1pct >= 31) return 'var(--warning)';
  return 'var(--success)';
}

/**
 * Относительный возрастной эффект (Эпик 6, FR21). Распределение по кварталам
 * рождения по региону (эталон 25%) + перекос по клубам (доля Q1). Обезличенно.
 */
export function FederationAgeEffect() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'age-effect'],
    queryFn: () => api<AgeEffectData>('/federation/age-effect'),
  });

  const region = data?.region;
  const total = region?.total ?? 0;
  const qs = region ? [region.q1, region.q2, region.q3, region.q4] : [];
  const clubs = (data?.clubs ?? []).filter((c) => c.total > 0).sort((a, b) => (b.q1Pct ?? 0) - (a.q1Pct ?? 0));

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Возрастной эффект</h1>
          <p className="fed-sub">Распределение по кварталам рождения · обезличенно · эталон равномерности 25%</p>
        </div>
      </header>

      {isLoading && <div className="fed-skeleton" style={{ height: 220 }} />}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && total === 0 && (
        <div className="fed-empty"><div className="fed-empty__icon">📅</div>Нет игроков с датой рождения.</div>
      )}

      {region && total > 0 && (
        <div className="fed-stack">
          <section className="fed-card fed-rise">
            <div className="fed-card__pad">
              <div className="fed-card__title">По региону · {total} игроков</div>
              {qs.map((n, i) => {
                const pct = Math.round((n / total) * 100);
                return (
                  <div key={i} className="fed-dist__row">
                    <span className="fed-dist__label">{Q_LABELS[i]}</span>
                    <span className="fed-dist__track">
                      <span className="fed-dist__fill" style={{ width: `${pct}%` }} />
                      <span className="fed-dist__ref" />
                    </span>
                    <span className="fed-dist__val">{pct}% · {n}</span>
                  </div>
                );
              })}
              <p className="fed-faint" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
                Вертикальная линия — равномерное ожидание (25%). Перекос к Q1 — признак отбора
                более зрелых по году рождения, а не более талантливых.
              </p>
            </div>
          </section>

          {clubs.length > 0 && (
            <section className="fed-card fed-rise">
              <div className="fed-card__pad">
                <div className="fed-card__title">Перекос по клубам · доля Q1</div>
                {clubs.map((c, idx) => (
                  <div key={c.slug} className="fed-row" style={{ borderBottom: idx < clubs.length - 1 ? undefined : 'none' }}>
                    <span className="fed-row__name" style={{ flex: 1 }}>{c.name}</span>
                    <span className="fed-meter" style={{ maxWidth: 120 }}>
                      <span className="fed-meter__fill" style={{ width: `${c.q1Pct ?? 0}%`, background: skewColor(c.q1Pct) }} />
                    </span>
                    <span className="fed-num fed-muted" style={{ width: 72, fontSize: 12 }}>{c.q1Pct}% · {c.total}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
