import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './federation.css';

/**
 * Пирамида лиг (слой №2) — ВТОРОЙ взгляд на тот же снимок region_census, что и
 * Карта региона (никакого нового обхода FFSPB). Делит пирамиду на два эшелона
 * (Высшая+Первая · Вторая+Третья+Четвёртая) и показывает, где скапливаются
 * поздно-рождённые: чем ниже эшелон, тем больше доля Q4 — измеримая утечка.
 */

interface PyramidLeague {
  league: string;
  teams: number;
  clubs: number;
  players: number;
  q1pct: number;
  q2pct: number;
  q3pct: number;
  q4pct: number;
  skew: number | null;
}
interface PyramidPayload {
  season: string;
  leagues: PyramidLeague[];
  totals: {
    playersDistinct: number;
    teamsTotal: number;
    clubsDistinct: number;
    matches: number;
    q1pct: number;
    q4pct: number;
  };
  capturedAt?: string | null;
}
interface RegionMapData {
  /** Пирамида лиг FFSPB (ВСЕ лиги региона) — последний месячный снимок, null если ещё нет. */
  pyramid: PyramidPayload | null;
}

const TOP_LEAGUES = ['Высшая', 'Первая'];
const LOWER_LEAGUES = ['Вторая', 'Третья', 'Четвёртая'];

interface Tier {
  players: number;
  /** Доли кварталов (взвешены по игрокам), 1 знак. */
  q1pct: number;
  q2pct: number;
  q3pct: number;
  q4pct: number;
  /** Перекос Q1÷Q4 (×). null, если Q4-доля = 0. */
  skew: number | null;
  /** Абсолютные числа игроков по кварталам (players × qkpct / 100). */
  q1count: number;
  q2count: number;
  q3count: number;
  q4count: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Сводит набор лиг в один эшелон: суммы игроков + взвешенные по игрокам доли кварталов. */
function buildTier(leagues: PyramidLeague[]): Tier {
  const players = leagues.reduce((a, l) => a + l.players, 0);
  const wq = (pick: (l: PyramidLeague) => number): number =>
    players > 0 ? round1(leagues.reduce((a, l) => a + l.players * pick(l), 0) / players) : 0;
  const q1pct = wq((l) => l.q1pct);
  const q2pct = wq((l) => l.q2pct);
  const q3pct = wq((l) => l.q3pct);
  const q4pct = wq((l) => l.q4pct);
  return {
    players,
    q1pct,
    q2pct,
    q3pct,
    q4pct,
    skew: q4pct > 0 ? round1(q1pct / q4pct) : null,
    q1count: (players * q1pct) / 100,
    q2count: (players * q2pct) / 100,
    q3count: (players * q3pct) / 100,
    q4count: (players * q4pct) / 100,
  };
}

export function FederationPyramid() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'region-map'],
    queryFn: () => api<RegionMapData>('/federation/region-map'),
  });

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Пирамида лиг</h1>
          <p className="fed-sub">{federation?.region ?? federation?.name ?? 'Регион'} · два эшелона — где скапливаются поздно-рождённые</p>
        </div>
      </header>

      {isLoading && (
        <div className="fed-cols">
          {[0, 1].map((i) => <div key={i} className="fed-skeleton" style={{ height: 220 }} />)}
        </div>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить пирамиду лиг</div>}

      {data && <PyramidBody p={data.pyramid} />}
    </div>
  );
}

function PyramidBody({ p }: { p: PyramidPayload | null }) {
  if (!p || p.leagues.length === 0) {
    return (
      <div className="fed-empty">
        <div className="fed-empty__icon" aria-hidden>⛰️</div>
        Перепись по пирамиде лиг ещё не снята — данные появятся после ближайшего обхода FFSPB.
      </div>
    );
  }

  const top = buildTier(p.leagues.filter((l) => TOP_LEAGUES.includes(l.league)));
  const lower = buildTier(p.leagues.filter((l) => LOWER_LEAGUES.includes(l.league)));

  // Кросс-эшелонные числа.
  const q4Total = top.q4count + lower.q4count;
  const q1Total = top.q1count + lower.q1count;
  // Доля поздно-рождённых региона (Q4), осевших в нижних лигах.
  const shareOfQ4InLower = q4Total > 0 ? Math.round((lower.q4count / q4Total) * 100) : 0;
  // Во сколько раз ранний (Q1) попадает в верхний эшелон чаще, чем поздний (Q4).
  const topQ1Share = q1Total > 0 ? top.q1count / q1Total : 0;
  const topQ4Share = q4Total > 0 ? top.q4count / q4Total : 0;
  const reachTopRatio = topQ4Share > 0 ? round1(topQ1Share / topQ4Share) : null;

  const captured = p.capturedAt ? new Date(p.capturedAt).toLocaleDateString('ru-RU') : null;

  return (
    <div className="fed-stack">
      <div className="fed-cols">
        <TierCard
          tone="top"
          title="Верхний эшелон"
          leagues="Высшая + Первая"
          t={top}
        />
        <TierCard
          tone="lower"
          title="Нижний эшелон"
          leagues="Вторая · Третья · Четвёртая"
          t={lower}
        />
      </div>

      {/* Главный вывод: куда осели поздно-рождённые + во сколько раз ранний достигает верха */}
      <section className="fed-finding fed-finding--hero fed-rise">
        <div className="fed-finding__kicker">⚠ Пирамида отбора</div>
        <p className="fed-finding__verdict">
          {shareOfQ4InLower}% всех поздно-рождённых региона играют в нижних лигах
        </p>
        {reachTopRatio != null && (
          <p className="fed-finding__why">
            Рождённый в начале года попадает в Высшую/Первую в <b>{reachTopRatio}×</b> чаще,
            чем рождённый в конце. Чем выше эшелон, тем жёстче отбор по физической зрелости —
            поздние выталкиваются вниз.
          </p>
        )}
        <p className="fed-faint" style={{ fontSize: 11.5, margin: '12px 0 0', lineHeight: 1.55 }}>
          Сезон {p.season} · тот же снимок, что и «Карта региона»{captured ? ` · данные с ${captured}` : ''}.
          Q1 — рождённые в январе–марте, Q4 — в октябре–декабре.
        </p>
      </section>
    </div>
  );
}

const num = (n: number) => Math.round(n).toLocaleString('ru-RU');

function TierCard({ tone, title, leagues, t }: { tone: 'top' | 'lower'; title: string; leagues: string; t: Tier }) {
  // Q4 подсвечивается: в верхнем эшелоне это «дефицит поздних» (красный),
  // в нижнем — «куда они осели» (зелёный). Оба берутся из токенов, без хардкода.
  const q4Color = tone === 'top' ? 'var(--danger)' : 'var(--success)';
  const quarters: Array<{ k: string; pct: number }> = [
    { k: 'Q1', pct: t.q1pct },
    { k: 'Q2', pct: t.q2pct },
    { k: 'Q3', pct: t.q3pct },
    { k: 'Q4', pct: t.q4pct },
  ];
  const maxPct = Math.max(1, ...quarters.map((q) => q.pct));

  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          {title}
          <span className="fed-faint" style={{ fontWeight: 400 }}>{leagues}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {num(t.players)}
          </span>
          <span className="fed-faint" style={{ fontSize: 12 }}>игроков</span>
          {t.skew != null && (
            <span
              className="fed-chip"
              style={{
                marginLeft: 'auto',
                background: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                color: 'var(--text)',
                border: '1px solid color-mix(in srgb, var(--brand-primary) 42%, transparent)',
              }}
              title="Перекос Q1÷Q4 — во сколько раз больше игроков рождено в начале года, чем в конце"
            >
              перекос {t.skew}×
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {quarters.map((q) => {
            const isQ4 = q.k === 'Q4';
            return (
              <div key={q.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span
                  className="fed-num"
                  style={{ fontSize: 12.5, fontWeight: 600, color: isQ4 ? q4Color : 'var(--text)' }}
                >
                  {q.pct}%
                </span>
                <span
                  style={{
                    width: '100%',
                    height: 78,
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
                      height: `${(q.pct / maxPct) * 100}%`,
                      background: isQ4 ? q4Color : 'var(--brand-gradient)',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'height var(--dur) var(--ease-out)',
                    }}
                  />
                </span>
                <span className="fed-faint" style={{ fontSize: 11 }}>{q.k}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
