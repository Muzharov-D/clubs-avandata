import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { num } from './utils';
import { Donut, DonutLegend } from './Donut';
import './federation.css';

interface PyramidLeague {
  league: string; teams: number; clubs: number; players: number;
  q1pct: number; q2pct: number; q3pct: number; q4pct: number; skew: number | null;
}
interface PyramidPayload {
  season: string; leagues: PyramidLeague[];
  totals: { playersDistinct: number; teamsTotal: number; clubsDistinct: number; matches: number; q1pct: number; q4pct: number };
  capturedAt?: string | null;
}
interface RegionMapData { pyramid: PyramidPayload | null }

const TOP_LEAGUES = ['Высшая', 'Первая'];
const LOWER_LEAGUES = ['Вторая', 'Третья', 'Четвёртая'];

interface Tier {
  players: number; q1pct: number; q2pct: number; q3pct: number; q4pct: number;
  skew: number | null; q1count: number; q2count: number; q3count: number; q4count: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function buildTier(leagues: PyramidLeague[]): Tier {
  const players = leagues.reduce((a, l) => a + l.players, 0);
  const wq = (pick: (l: PyramidLeague) => number): number =>
    players > 0 ? round1(leagues.reduce((a, l) => a + l.players * pick(l), 0) / players) : 0;
  const q1pct = wq((l) => l.q1pct);
  const q2pct = wq((l) => l.q2pct);
  const q3pct = wq((l) => l.q3pct);
  const q4pct = wq((l) => l.q4pct);
  return {
    players, q1pct, q2pct, q3pct, q4pct,
    skew: q4pct > 0 ? round1(q1pct / q4pct) : null,
    q1count: (players * q1pct) / 100, q2count: (players * q2pct) / 100,
    q3count: (players * q3pct) / 100, q4count: (players * q4pct) / 100,
  };
}

export function PyramidBody() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'region-map'],
    queryFn: () => api<RegionMapData>('/federation/region-map'),
  });
  if (isLoading) {
    return (
      <div className="fed-grid fed-grid--2">
        {[0, 1].map((i) => <div key={i} className="fed-skeleton" style={{ height: 280 }} />)}
      </div>
    );
  }
  if (error) return <div className="fed-empty" style={{ color: 'var(--danger)' }}>Не удалось загрузить пирамиду лиг</div>;
  const p = data?.pyramid ?? null;
  if (!p || p.leagues.length === 0) {
    return <div className="fed-empty">Данные по пирамиде лиг ещё не готовы.</div>;
  }

  const top = buildTier(p.leagues.filter((l) => TOP_LEAGUES.includes(l.league)));
  const lower = buildTier(p.leagues.filter((l) => LOWER_LEAGUES.includes(l.league)));
  const q4Total = top.q4count + lower.q4count;
  const q1Total = top.q1count + lower.q1count;
  const shareOfQ4InLower = q4Total > 0 ? Math.round((lower.q4count / q4Total) * 100) : 0;
  const topQ1Share = q1Total > 0 ? top.q1count / q1Total : 0;
  const topQ4Share = q4Total > 0 ? top.q4count / q4Total : 0;
  const reachTopRatio = topQ4Share > 0 ? round1(topQ1Share / topQ4Share) : null;
  // Дельта-воронка: доля поздних падает при подъёме по эшелонам (приговор отбора в одну строку).
  const topLate = Math.round(top.q3pct + top.q4pct);
  const lowerLate = Math.round(lower.q3pct + lower.q4pct);
  const lateDrop = lowerLate - topLate;

  return (
    <div>
      <div className="fed-grid fed-grid--2" style={{ marginBottom: 22 }}>
        <TierCard tone="top" title="Верхние лиги" leagues="Высшая + Первая" t={top} />
        <TierCard tone="lower" title="Нижние лиги" leagues="Вторая · Третья · Четвёртая" t={lower} />
      </div>

      <p className="fed-note" style={{ borderLeft: '3px solid var(--warning)', paddingLeft: 12, marginBottom: 22 }}>
        <b>Воронка отбора:</b> поздних {lowerLate}% в нижних лигах против {topLate}% в верхних —
        отсев <b style={{ color: 'var(--danger)' }}>−{lateDrop} пп</b> при подъёме по лигам.
      </p>

      <div className="fed-card" style={{ borderLeft: '3px solid var(--warning)' }}>
        <div className="fed-badge fed-badge--warning" style={{ marginBottom: 16 }}>Воронка отбора</div>
        <h3 style={{ fontSize: 28, fontWeight: 300, margin: '0 0 12px' }}>
          {shareOfQ4InLower}% всех поздно рождённых региона выступают в нижних лигах
        </h3>
        {reachTopRatio != null && (
          <p className="fed-note">
            Рождённые в начале года попадают в Высшую и Первую лиги в <strong>{reachTopRatio}×</strong> чаще,
            чем рождённые в конце. Чем выше лига, тем строже отбор по росту и телосложению.
          </p>
        )}
        <p className="fed-note" style={{ marginTop: 16 }}>Сезон {p.season}. Q1 — январь–март, Q4 — октябрь–декабрь.</p>
      </div>
    </div>
  );
}

function TierCard({ tone, title, leagues, t }: { tone: 'top' | 'lower'; title: string; leagues: string; t: Tier }) {
  // Логика «ранние vs поздние»: ранние = Q1+Q2, поздние = Q3+Q4 (доли суммируются в 100%).
  // Поздние — зона риска: в верхнем эшелоне их мало (отсев), краснеем; в нижнем они копятся.
  const early = Math.round(t.q1pct + t.q2pct);
  const late = Math.round(t.q3pct + t.q4pct);
  const lateColor = tone === 'top' ? 'var(--danger)' : 'var(--success)';
  const segments = [
    { label: 'Ранние (Q1–Q2)', value: early, color: 'var(--text-secondary)' },
    { label: 'Поздние (Q3–Q4)', value: late, color: lateColor },
  ];

  return (
    <div className="fed-card">
      <div className="fed-card__title">{title}</div>
      <div className="fed-card__sub">{leagues}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 48, fontWeight: 200, letterSpacing: '-0.03em' }}>{num(t.players)}</span>
        <span className="fed-note">игроков</span>
        {t.skew != null && (
          <span className="fed-badge fed-badge--accent" style={{ marginLeft: 'auto' }}>перекос {t.skew}×</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Donut
          segments={segments}
          ariaLabel={`${title}: ранние ${early}%, поздние ${late}%`}
          center={(
            <>
              <span style={{ fontSize: 26, fontWeight: 300, color: lateColor, letterSpacing: '-0.02em' }}>{late}%</span>
              <span className="fed-note" style={{ fontSize: 11 }}>поздние</span>
            </>
          )}
        />
        <DonutLegend segments={segments} />
      </div>
    </div>
  );
}

export function FederationPyramid() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Верхние и нижние лиги</div>
        <h1 className="fed-hero__title">Пирамида лиг</h1>
        <p className="fed-hero__sub">{federation?.region ?? federation?.name ?? 'Регион'} · где сосредоточены поздно рождённые</p>
      </div>
      <PyramidBody />
    </div>
  );
}
