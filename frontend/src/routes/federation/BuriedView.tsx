import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { num } from './utils';
import { Donut } from './Donut';
import './federation.css';

interface MinutesBuckets {
  zero: number; b0_15: number; b15_30: number; b30_50: number; over50: number;
}
interface MinutesQuarter { q: number; medianTime: number; buriedPct: number }
interface MinutesLeague {
  league: string; evaluated: number; neverPlayed: number; neverPlayedPct: number;
  buried15: number; buried15Pct: number; medianTime: number; buckets: MinutesBuckets;
}
interface MinutesPayload {
  season: string; evaluated: number; neverPlayed: number; neverPlayedPct: number;
  buried15: number; buried15Pct: number; medianTime: number;
  buckets: MinutesBuckets; byQuarter: MinutesQuarter[];
  byLeague?: MinutesLeague[]; capturedAt?: string | null;
}

export const useMinutes = () => useQuery({
  queryKey: ['federation', 'minutes'],
  queryFn: () => api<MinutesPayload | null>('/federation/minutes'),
});

/** Тройка «играют ядром / на лавке / не выходят» для набора чисел игрового времени. */
function PlayTimeTriple({ m, scopeNote }: { m: MinutesLeague | MinutesPayload; scopeNote: string }) {
  const core = m.buckets.over50;            // ≥50% командных минут — играют ядром
  const bench = m.buckets.zero + m.buckets.b0_15; // <15% — на лавке
  return (
    <div className="fed-grid fed-grid--3">
      <div className="fed-metric">
        <div className="fed-metric__label">Играют ядром</div>
        <div className="fed-metric__value fed-metric__value--success">{core}%</div>
        <div className="fed-metric__extra">≥50% командных минут · {scopeNote}</div>
      </div>
      <div className="fed-metric">
        <div className="fed-metric__label">На лавке</div>
        <div className="fed-metric__value fed-metric__value--warning">{bench}%</div>
        <div className="fed-metric__extra">{'<'}15% минут · {num(m.buried15)} «погребённых»</div>
      </div>
      <div className="fed-metric">
        <div className="fed-metric__label">Не выходят ни разу</div>
        <div className="fed-metric__value" style={{ color: 'var(--danger)' }}>{m.neverPlayedPct}%</div>
        <div className="fed-metric__extra">{num(m.neverPlayed)} из {num(m.evaluated)} в реестре</div>
      </div>
    </div>
  );
}

/**
 * Полоска «играют ядром / на лавке / не выходят» для Обзора по лигам Высшая и
 * Первая — единственным, по которым есть игровое время. Если снимок отдал
 * `byLeague` — честно разводим Высшую и Первую отдельными карточками; иначе
 * (старый снимок без среза) показываем агрегат, но называем его «Высшая и
 * Первая» — это и есть все лиги минутной статистики, регион тут не при чём.
 * Полный разбор — на экране «Потеря таланта». Если снапшот ещё не снят
 * (data == null) — не засоряем Обзор, отдаём null.
 */
export function PlayTimeStripBody() {
  const { data, isLoading } = useMinutes();
  if (isLoading) return <div className="fed-skeleton" style={{ height: 120 }} />;
  if (!data) return null;

  const byLeague = data.byLeague ?? [];
  if (byLeague.length > 0) {
    // Лиги — В СТОЛБИК (каждая на всю ширину со своей тройкой плиток). Раньше стояли
    // рядом (fed-grid--2), и 6 крупных плиток в ряд не влезали — у «Первой» третья
    // плитка обрезалась за краем. Стопка убирает горизонтальное переполнение.
    return (
      <div style={{ display: 'grid', gap: 20 }}>
        {byLeague.map((l) => (
          <div key={l.league} className="fed-card">
            <div className="fed-card__title">{l.league} лига</div>
            <div className="fed-card__sub">{num(l.evaluated)} игроков в реестре · игровое время</div>
            <PlayTimeTriple m={l} scopeNote={`лига ${l.league}`} />
          </div>
        ))}
      </div>
    );
  }

  // Старый снимок без byLeague — агрегат относится ровно к Высшей и Первой.
  return (
    <div className="fed-card">
      <div className="fed-card__title">Высшая и Первая лиги</div>
      <div className="fed-card__sub">единственные лиги, по которым есть игровое время · {num(data.evaluated)} игроков</div>
      <PlayTimeTriple m={data} scopeNote="Высшая и Первая" />
    </div>
  );
}

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
  // «Ранние vs поздние» (Q1+Q2 vs Q3+Q4): средняя доля «погребённых» (<15% минут) и медиана
  // времени по группе. Среднее по двум кварталам (per-quarter численности нет в /minutes —
  // знаменатель один реестр, оценка направления). Поздние = зона риска (красный сектор больше).
  const qBuried = (q: number) => p.byQuarter.find((x) => x.q === q)?.buriedPct ?? 0;
  const qMed = (q: number) => p.byQuarter.find((x) => x.q === q)?.medianTime ?? 0;
  const earlyBuried = Math.round((qBuried(1) + qBuried(2)) / 2);
  const lateBuried = Math.round((qBuried(3) + qBuried(4)) / 2);
  const earlyMed = Math.round((qMed(1) + qMed(2)) / 2);
  const lateMed = Math.round((qMed(3) + qMed(4)) / 2);

  return (
    <div>
      {/* Metrics */}
      <div className="fed-grid fed-grid--3" style={{ marginBottom: 32 }}>
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
      <div className="fed-card" style={{ marginBottom: 32 }}>
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

      {/* Ранние vs поздние — кольца доступа к игре (вместо столбцов Q1-Q4). */}
      <div className="fed-card" style={{ marginBottom: 32 }}>
        <div className="fed-card__title">Ранние vs поздние — доступ к игре</div>
        <div className="fed-card__sub">доля «погребённых» ({'<'}15% минут) у рождённых в начале и в конце года</div>

        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center', margin: '24px 0 8px' }}>
          {[
            { title: 'Ранние · Q1–Q2', buried: earlyBuried, med: earlyMed, late: false },
            { title: 'Поздние · Q3–Q4', buried: lateBuried, med: lateMed, late: true },
          ].map((g) => {
            const segs = [
              { label: 'Погребены', value: g.buried, color: 'var(--danger)' },
              { label: 'Играют', value: Math.max(0, 100 - g.buried), color: 'var(--success)' },
            ];
            return (
              <div key={g.title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Donut
                  segments={segs} size={150}
                  ariaLabel={`${g.title}: погребены ${g.buried}%`}
                  center={(
                    <>
                      <span style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em', color: g.late ? 'var(--danger)' : 'var(--text)' }}>{g.buried}%</span>
                      <span className="fed-note" style={{ fontSize: 11 }}>погребены</span>
                    </>
                  )}
                />
                <div style={{ textAlign: 'center' }}>
                  <div className="fed-row__name" style={{ fontSize: 14 }}>{g.title}</div>
                  <div className="fed-note">медиана времени {g.med}%</div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="fed-note" style={{ marginTop: 8 }}>
          Поздно рождённые не только реже проходят отбор, но и меньше играют: доля «погребённых»
          ({'<'}15% командных минут) среди них выше — вторая потеря после селекции.
        </p>
      </div>

      <p className="fed-note">Сезон {p.season}{captured ? ` · данные с ${captured}` : ''}.</p>
    </div>
  );
}
