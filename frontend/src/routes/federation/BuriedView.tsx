import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './federation.css';

/**
 * Карта возможностей — игровое время Первенства (когорты 2009–2016) по протоколам
 * FFSPB. «Выживших отобрали — но выпускают ли?»: сколько зарегистрированных не выходят
 * ни разу / погребены на лавке + двойной штраф поздно-рождённых (Q4 играет меньше всех).
 *
 * Читает последний месячный снимок region_minutes через /federation/minutes (тот же
 * паттерн, что и Пирамида/Возрастной эффект — никакого живого FFSPB на запрос страницы).
 * payload null → мягкая деградация (снимок ещё не снят).
 */

interface MinutesBuckets {
  zero: number;
  b0_15: number;
  b15_30: number;
  b30_50: number;
  over50: number;
}
interface MinutesQuarter {
  q: number;
  medianTime: number;
  buriedPct: number;
}
interface MinutesPayload {
  season: string;
  evaluated: number;
  neverPlayed: number;
  neverPlayedPct: number;
  buried15: number;
  buried15Pct: number;
  medianTime: number;
  buckets: MinutesBuckets;
  byQuarter: MinutesQuarter[];
  capturedAt?: string | null;
}

const num = (n: number): string => Math.round(n).toLocaleString('ru-RU');

export function FederationBuried() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'minutes'],
    queryFn: () => api<MinutesPayload | null>('/federation/minutes'),
  });

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Карта возможностей</h1>
          <p className="fed-sub">
            {data
              ? `Выживших отобрали — но выпускают ли? · ${num(data.evaluated)} игроков`
              : (federation?.region ?? federation?.name ?? 'Регион')}
          </p>
        </div>
      </header>

      {isLoading && <div className="fed-skeleton" style={{ height: 360 }} />}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить карту возможностей</div>}

      {data !== undefined && <BuriedBody p={data} />}
    </div>
  );
}

// Бакеты распределения: 0% (danger), 0–15 & 15–30 (тёплые рампы warning), 30–50 (инфо), ≥50 (success).
interface BucketDef { key: keyof MinutesBuckets; label: string; color: string; opacity?: number }
const BUCKET_DEFS: BucketDef[] = [
  { key: 'zero', label: '0% — не выходят', color: 'var(--danger)' },
  { key: 'b0_15', label: '0–15%', color: 'var(--warning)' },
  { key: 'b15_30', label: '15–30%', color: 'var(--warning)', opacity: 0.6 },
  { key: 'b30_50', label: '30–50%', color: 'var(--accent-cyan)' },
  { key: 'over50', label: '≥50% — основа', color: 'var(--success)' },
];

function BuriedBody({ p }: { p: MinutesPayload | null }) {
  if (!p) {
    return (
      <div className="fed-empty">
        <div className="fed-empty__icon" aria-hidden>🪑</div>
        Карта возможностей ещё не снята — данные появятся после ближайшего обхода протоколов FFSPB.
      </div>
    );
  }

  const captured = p.capturedAt ? new Date(p.capturedAt).toLocaleDateString('ru-RU') : null;
  // Q4 — самый низкий по медиане игрового времени = двойной штраф поздно-рождённых.
  const q4 = p.byQuarter.find((q) => q.q === 4) ?? null;
  const lowest = p.byQuarter.reduce<MinutesQuarter | null>((m, q) => (m == null || q.medianTime < m.medianTime ? q : m), null);

  return (
    <div className="fed-stack">
      {/* 3 метрики: реестр · не выходят · погребённые */}
      <div className="fed-cols">
        <MetricCard label="В реестре лиг" value={num(p.evaluated)} sub="оценено игроков" />
        <MetricCard
          label="Не выходят ни разу"
          value={num(p.neverPlayed)}
          sub={`${p.neverPlayedPct}% реестра`}
          tone="danger"
        />
        <MetricCard
          label="Погребённые <15%"
          value={num(p.buried15)}
          sub={`${p.buried15Pct}% реестра`}
          tone="warning"
        />
      </div>

      {/* Распределение игрового времени — горизонтальный стек по 5 бакетам */}
      <section className="fed-card fed-rise">
        <div className="fed-card__pad">
          <div className="fed-card__title">
            Распределение игрового времени
            <span className="fed-faint" style={{ fontWeight: 400 }}>медиана {p.medianTime}% от командных минут</span>
          </div>

          <div
            style={{
              display: 'flex',
              width: '100%',
              height: 34,
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              background: 'var(--bg-surface-3)',
              marginBottom: 14,
            }}
          >
            {BUCKET_DEFS.map((d) => {
              const v = p.buckets[d.key];
              if (v <= 0) return null;
              return (
                <span
                  key={d.key}
                  title={`${d.label}: ${v}%`}
                  style={{
                    width: `${v}%`,
                    background: d.color,
                    opacity: d.opacity ?? 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--bg-page)',
                    transition: 'width var(--dur) var(--ease-out)',
                  }}
                >
                  {v >= 7 ? `${v}%` : ''}
                </span>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
            {BUCKET_DEFS.map((d) => (
              <span key={d.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span
                  aria-hidden
                  style={{ width: 11, height: 11, borderRadius: 3, background: d.color, opacity: d.opacity ?? 1, flex: 'none' }}
                />
                <span className="fed-faint" style={{ fontSize: 12 }}>
                  {d.label} · <b style={{ color: 'var(--text)' }}>{p.buckets[d.key]}%</b>
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Медиана игрового времени по кварталам рождения — Q4 (самый низкий) подсвечен */}
      <section className="fed-card fed-rise">
        <div className="fed-card__pad">
          <div className="fed-card__title">
            Игровое время по кварталам рождения
            <span className="fed-faint" style={{ fontWeight: 400 }}>медиана % от командных минут</span>
          </div>

          <QuarterBars rows={p.byQuarter} lowestQ={lowest?.q ?? null} />

          <p className="fed-faint" style={{ fontSize: 12, margin: '14px 0 0', lineHeight: 1.55 }}>
            Поздно-рождённый «выживший» играет меньше — двойной штраф.
            {q4 != null && lowest?.q === 4 && (
              <> Q4 — самый низкий ({q4.medianTime}%): уже прошедшего отбор по дате рождения ещё и реже выпускают.</>
            )}
          </p>
        </div>
      </section>

      <p className="fed-faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
        Игровое время из протоколов ФФСПб (доля от командных минут). У младших возрастов
        участие может быть завышено неполной записью замен.
        {' '}Сезон {p.season}{captured ? ` · данные с ${captured}` : ''}.
      </p>
    </div>
  );
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'danger' | 'warning' }) {
  const accent = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--text)';
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-faint" style={{ fontSize: 12, marginBottom: 8 }}>{label}</div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: accent,
          }}
        >
          {value}
        </div>
        <div className="fed-faint" style={{ fontSize: 12, marginTop: 8 }}>{sub}</div>
      </div>
    </section>
  );
}

function QuarterBars({ rows, lowestQ }: { rows: MinutesQuarter[]; lowestQ: number | null }) {
  const maxTime = Math.max(1, ...rows.map((r) => r.medianTime));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 12, alignItems: 'end' }}>
      {rows.map((r) => {
        const isLow = lowestQ != null && r.q === lowestQ;
        const heightPct = (r.medianTime / maxTime) * 100;
        return (
          <div key={r.q} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span
              className="fed-num"
              style={{ fontSize: 13, fontWeight: 700, color: isLow ? 'var(--danger)' : 'var(--text)' }}
            >
              {r.medianTime}%
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
                  background: isLow ? 'var(--danger)' : 'var(--brand-gradient)',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'height var(--dur) var(--ease-out)',
                }}
              />
            </span>
            <span
              className="fed-faint"
              style={{ fontSize: 12, fontWeight: isLow ? 700 : 400, color: isLow ? 'var(--danger)' : undefined }}
            >
              Q{r.q}
            </span>
          </div>
        );
      })}
    </div>
  );
}
