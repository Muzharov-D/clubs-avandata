import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Reveal, AnimatedNumber } from '../../components/motion';
import './avandata.css';

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

const useMinutes = () => useQuery({
  queryKey: ['federation', 'minutes'],
  queryFn: () => api<MinutesPayload | null>('/federation/minutes'),
});

export function FederationBuried() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data } = useMinutes();
  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Карта возможностей</h1>
          <p className="fed-sub">
            {data
              ? `Доступ прошедших отбор к игровому времени · ${num(data.evaluated)} игроков`
              : (federation?.region ?? federation?.name ?? 'Регион')}
          </p>
        </div>
      </header>
      <BuriedBody />
    </div>
  );
}

/**
 * Тело «Карты возможностей» — игровое время (реестр / не выходят / погребённые +
 * разрез по кварталам). Снимок region_minutes ПУЛИТСЯ по региону (per-cohort
 * среза нет) → region-level, фильтр года не применяется (метка «по региону»).
 * Самонесущее (fetch внутри), без шапки экрана.
 */
export function BuriedBody() {
  const { data, isLoading, error } = useMinutes();
  if (isLoading) return <div className="fed-skeleton" style={{ height: 360 }} />;
  if (error) return <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить карту возможностей</div>;
  return <BuriedBodyInner p={data ?? null} />;
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

function BuriedBodyInner({ p }: { p: MinutesPayload | null }) {
  if (!p) {
    return (
      <div className="fed-empty">
        <div className="fed-empty__icon" aria-hidden>🪑</div>
        Данные по игровому времени ещё не сформированы — появятся после ближайшего обновления протоколов ФФСПб.
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
        <MetricCard label="В реестре лиг" value={p.evaluated} sub="оценено игроков" delay={0} />
        <MetricCard
          label="Не выходят ни разу"
          value={p.neverPlayed}
          sub={`${p.neverPlayedPct}% реестра`}
          tone="danger"
          delay={0.05}
        />
        <MetricCard
          label="Погребённые <15%"
          value={p.buried15}
          sub={`${p.buried15Pct}% реестра`}
          tone="warning"
          delay={0.1}
        />
      </div>

      {/* Распределение игрового времени — горизонтальный стек по 5 бакетам */}
      <Reveal variant="slide-up" delay={0.05} className="fed-card">
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
      </Reveal>

      {/* Медиана игрового времени по кварталам рождения — Q4 (самый низкий) подсвечен */}
      <Reveal variant="slide-up" delay={0.1} className="fed-card">
        <div className="fed-card__pad">
          <div className="fed-card__title">
            Игровое время по кварталам рождения
            <span className="fed-faint" style={{ fontWeight: 400 }}>медиана % от командных минут</span>
          </div>

          <QuarterBars rows={p.byQuarter} lowestQ={lowest?.q ?? null} />

          <p className="fed-faint" style={{ fontSize: 12, margin: '14px 0 0', lineHeight: 1.55 }}>
            Поздно рождённые получают меньше игрового времени — это вторая, дополнительная потеря после отбора.
            {q4 != null && lowest?.q === 4 && (
              <> Квартал Q4 — минимальный показатель ({q4.medianTime}%): прошедшие отбор по дате рождения дополнительно ограничены в игровой практике.</>
            )}
          </p>
        </div>
      </Reveal>

      <p className="fed-faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
        Игровое время из протоколов ФФСПб (доля от командных минут). У младших возрастов
        участие может быть завышено неполной записью замен.
        {' '}Сезон {p.season}{captured ? ` · данные с ${captured}` : ''}.
      </p>
    </div>
  );
}

function MetricCard({ label, value, sub, tone, delay = 0 }: { label: string; value: number; sub: string; tone?: 'danger' | 'warning'; delay?: number }) {
  const accent = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--text)';
  return (
    <Reveal variant="slide-up" delay={delay} className="fed-card">
      <div className="fed-card__pad">
        <div className="fed-faint" style={{ fontSize: 12, marginBottom: 8 }}>{label}</div>
        <span
          className="fed-num"
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: accent,
          }}
        >
          <AnimatedNumber value={value} />
        </span>
        <div className="fed-faint" style={{ fontSize: 12, marginTop: 8 }}>{sub}</div>
      </div>
    </Reveal>
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
            <span className="fed-bar__track" style={{ height: 160, display: 'flex', alignItems: 'flex-end' }}>
              <span
                className={`fed-bar__fill${isLow ? ' fed-bar__fill--focus' : ''}`}
                style={{
                  height: `${heightPct}%`,
                  background: isLow ? 'var(--danger)' : 'var(--brand-gradient)',
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
