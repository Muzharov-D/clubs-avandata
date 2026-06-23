import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { num } from './utils';
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
    return <div className="fed-empty">Данные по пирамиде лиг ещё не сформированы.</div>;
  }

  const top = buildTier(p.leagues.filter((l) => TOP_LEAGUES.includes(l.league)));
  const lower = buildTier(p.leagues.filter((l) => LOWER_LEAGUES.includes(l.league)));
  const q4Total = top.q4count + lower.q4count;
  const q1Total = top.q1count + lower.q1count;
  const shareOfQ4InLower = q4Total > 0 ? Math.round((lower.q4count / q4Total) * 100) : 0;
  const topQ1Share = q1Total > 0 ? top.q1count / q1Total : 0;
  const topQ4Share = q4Total > 0 ? top.q4count / q4Total : 0;
  const reachTopRatio = topQ4Share > 0 ? round1(topQ1Share / topQ4Share) : null;

  return (
    <div>
      <div className="fed-grid fed-grid--2" style={{ marginBottom: 22 }}>
        <TierCard tone="top" title="Верхний эшелон" leagues="Высшая + Первая" t={top} />
        <TierCard tone="lower" title="Нижний эшелон" leagues="Вторая · Третья · Четвёртая" t={lower} />
      </div>

      <div className="fed-card" style={{ borderLeft: '3px solid var(--warning)' }}>
        <div className="fed-badge fed-badge--warning" style={{ marginBottom: 16 }}>Пирамида отбора</div>
        <h3 style={{ fontSize: 28, fontWeight: 300, margin: '0 0 12px' }}>
          {shareOfQ4InLower}% всех поздно рождённых региона выступают в нижних лигах
        </h3>
        {reachTopRatio != null && (
          <p className="fed-note">
            Рождённые в начале года попадают в Высшую и Первую лиги в <strong>{reachTopRatio}×</strong> чаще,
            чем рождённые в конце. Чем выше эшелон, тем строже отбор по физической зрелости.
          </p>
        )}
        <p className="fed-note" style={{ marginTop: 16 }}>Сезон {p.season}. Q1 — январь–март, Q4 — октябрь–декабрь.</p>
      </div>
    </div>
  );
}

function TierCard({ tone, title, leagues, t }: { tone: 'top' | 'lower'; title: string; leagues: string; t: Tier }) {
  const q4Color = tone === 'top' ? 'var(--danger)' : 'var(--success)';
  const quarters = [
    { k: 'Q1', pct: t.q1pct }, { k: 'Q2', pct: t.q2pct },
    { k: 'Q3', pct: t.q3pct }, { k: 'Q4', pct: t.q4pct },
  ];
  const maxPct = Math.max(1, ...quarters.map((q) => q.pct));

  return (
    <div className="fed-card">
      <div className="fed-card__title">{title}</div>
      <div className="fed-card__sub">{leagues}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 48, fontWeight: 200, letterSpacing: '-0.03em' }}>{num(t.players)}</span>
        <span className="fed-note">игроков</span>
        {t.skew != null && (
          <span className="fed-badge fed-badge--accent" style={{ marginLeft: 'auto' }}>перекос {t.skew}×</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {quarters.map((q) => {
          const isQ4 = q.k === 'Q4';
          return (
            <div key={q.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: isQ4 ? q4Color : 'var(--text)' }}>{q.pct}%</span>
              <div style={{ height: 100, width: '100%', display: 'flex', alignItems: 'flex-end', background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: '100%', height: `${(q.pct / maxPct) * 100}%`, background: isQ4 ? q4Color : 'var(--text-secondary)', transition: 'all 0.5s' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{q.k}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FederationPyramid() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Два эшелона</div>
        <h1 className="fed-hero__title">Пирамида лиг</h1>
        <p className="fed-hero__sub">{federation?.region ?? federation?.name ?? 'Регион'} · где скапливаются поздно-рождённые</p>
      </div>
      <PyramidBody />
    </div>
  );
}
