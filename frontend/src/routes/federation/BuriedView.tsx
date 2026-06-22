import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { num } from './utils';
import './federation.css';

interface MinutesBuckets {
  zero: number; b0_15: number; b15_30: number; b30_50: number; over50: number;
}
interface MinutesQuarter { q: number; medianTime: number; buriedPct: number }
interface MinutesPayload {
  season: string; evaluated: number; neverPlayed: number; neverPlayedPct: number;
  buried15: number; buried15Pct: number; medianTime: number;
  buckets: MinutesBuckets; byQuarter: MinutesQuarter[]; capturedAt?: string | null;
}

const useMinutes = () => useQuery({
  queryKey: ['federation', 'minutes'],
  queryFn: () => api<MinutesPayload | null>('/federation/minutes'),
});

export function FederationBuried() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data } = useMinutes();
  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Доступ к игровому времени</div>
        <h1 className="fed-hero__title">Карта возможностей</h1>
        <p className="fed-hero__sub">
          {data ? `${num(data.evaluated)} игроков в реестре` : (federation?.region ?? federation?.name ?? 'Регион')}
        </p>
      </div>
      <BuriedBody />
    </div>
  );
}

export function BuriedBody() {
  const { data, isLoading, error } = useMinutes();
  if (isLoading) return <div className="fed-skeleton" style={{ height: 360 }} />;
  if (error) return <div className="fed-empty" style={{ color: 'var(--danger)' }}>Не удалось загрузить карту возможностей</div>;
  return <BuriedBodyInner p={data ?? null} />;
}

interface BucketDef { key: keyof MinutesBuckets; label: string; color: string; opacity?: number }
const BUCKET_DEFS: BucketDef[] = [
  { key: 'zero', label: '0% — не выходят', color: 'var(--danger)' },
  { key: 'b0_15', label: '0–15%', color: 'var(--warning)' },
  { key: 'b15_30', label: '15–30%', color: 'var(--warning)', opacity: 0.6 },
  { key: 'b30_50', label: '30–50%', color: 'var(--accent)' },
  { key: 'over50', label: '≥50% — основа', color: 'var(--success)' },
];

function BuriedBodyInner({ p }: { p: MinutesPayload | null }) {
  if (!p) return <div className="fed-empty">Данные по игровому времени ещё не сформированы.</div>;

  const captured = p.capturedAt ? new Date(p.capturedAt).toLocaleDateString('ru-RU') : null;
  const q4 = p.byQuarter.find((q) => q.q === 4) ?? null;
  const lowest = p.byQuarter.reduce<MinutesQuarter | null>((m, q) => (m == null || q.medianTime < m.medianTime ? q : m), null);

  return (
    <div>
      {/* Metrics */}
      <div className="fed-grid fed-grid--3" style={{ marginBottom: 48 }}>
        <div className="fed-metric">
          <div className="fed-metric__label">В реестре</div>
          <div className="fed-metric__value">{num(p.evaluated)}</div>
          <div className="fed-metric__extra">оценено игроков</div>
        </div>
        <div className="fed-metric">
          <div className="fed-metric__label">Не выходят ни разу</div>
          <div className="fed-metric__value fed-metric__value--danger">{num(p.neverPlayed)}</div>
          <div className="fed-metric__extra">{p.neverPlayedPct}% реестра</div>
        </div>
        <div className="fed-metric">
          <div className="fed-metric__label">Погребённые {'<'}15%</div>
          <div className="fed-metric__value fed-metric__value--warning">{num(p.buried15)}</div>
          <div className="fed-metric__extra">{p.buried15Pct}% реестра</div>
        </div>
      </div>

      {/* Distribution */}
      <div className="fed-card" style={{ marginBottom: 48 }}>
        <div className="fed-card__title">Распределение игрового времени</div>
        <div className="fed-card__sub">медиана {p.medianTime}% от командных минут</div>

        <div style={{ display: 'flex', width: '100%', height: 36, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-elevated)', margin: '24px 0 16px' }}>
          {BUCKET_DEFS.map((d) => {
            const v = p.buckets[d.key];
            if (v <= 0) return null;
            return (
              <span key={d.key} title={`${d.label}: ${v}%`} style={{ width: `${v}%`, background: d.color, opacity: d.opacity ?? 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                {v >= 7 ? `${v}%` : ''}
              </span>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
          {BUCKET_DEFS.map((d) => (
            <span key={d.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: d.color, opacity: d.opacity ?? 1 }} />
              <span className="fed-note">{d.label} · <strong>{p.buckets[d.key]}%</strong></span>
            </span>
          ))}
        </div>
      </div>

      {/* Quarter bars */}
      <div className="fed-card" style={{ marginBottom: 48 }}>
        <div className="fed-card__title">Игровое время по кварталам рождения</div>
        <div className="fed-card__sub">медиана % от командных минут</div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.byQuarter.length}, 1fr)`, gap: 16, alignItems: 'end', marginTop: 32 }}>
          {p.byQuarter.map((r) => {
            const isLow = lowest?.q === r.q;
            const maxTime = Math.max(1, ...p.byQuarter.map((x) => x.medianTime));
            const heightPct = (r.medianTime / maxTime) * 100;
            return (
              <div key={r.q} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: isLow ? 'var(--danger)' : 'var(--text)' }}>{r.medianTime}%</span>
                <div style={{ height: 120, width: '100%', display: 'flex', alignItems: 'flex-end', background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: `${heightPct}%`, background: isLow ? 'var(--danger)' : 'var(--text-secondary)', transition: 'all 0.5s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: isLow ? 600 : 400, color: isLow ? 'var(--danger)' : 'var(--text-secondary)' }}>Q{r.q}</span>
              </div>
            );
          })}
        </div>

        <p className="fed-note" style={{ marginTop: 24 }}>
          Поздно рождённые получают меньше игрового времени — вторая потеря после отбора.
          {q4 != null && lowest?.q === 4 && (
            <> Q4 — минимальный показатель ({q4.medianTime}%): прошедшие отбор по дате рождения дополнительно ограничены.</>
          )}
        </p>
      </div>

      <p className="fed-note">Сезон {p.season}{captured ? ` · данные с ${captured}` : ''}.</p>
    </div>
  );
}
