import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import './federation.css';

interface AgeCohort { year: number; players: number; q1pct: number; q4pct: number; skew: number | null }
interface LeagueRow { league: string; players: number; q4pct: number }
interface RegionMapData {
  pyramid: { season: string; ageEffect: AgeCohort[]; leagues: LeagueRow[] } | null;
}
interface MinutesData { evaluated: number; neverPlayed: number; buried15: number }
interface ScorersData { topGoals: Array<{ name: string; club: string; cohort: number; goals: number }> }

const TOP_LEAGUES = ['Высшая', 'Первая'];

export function DiscoveriesBody() {
  const region = useQuery({ queryKey: ['federation', 'region-map'], queryFn: () => api<RegionMapData>('/federation/region-map') });
  const minutes = useQuery({ queryKey: ['federation', 'minutes'], queryFn: () => api<MinutesData | null>('/federation/minutes') });
  const scorers = useQuery({ queryKey: ['federation', 'region-scorers'], queryFn: () => api<ScorersData | null>('/federation/region-scorers') });

  const cohorts = region.data?.pyramid?.ageEffect ?? [];
  const leagues = region.data?.pyramid?.leagues ?? [];

  const totalPlayers = cohorts.reduce((a, c) => a + c.players, 0);
  const q1 = cohorts.reduce((a, c) => a + (c.players * c.q1pct) / 100, 0);
  const q4 = cohorts.reduce((a, c) => a + (c.players * c.q4pct) / 100, 0);
  const raeSkew = q4 > 0 ? Math.round((q1 / q4) * 100) / 100 : null;

  const topQ4 = leagues.filter((l) => TOP_LEAGUES.includes(l.league)).reduce((a, l) => a + (l.players * l.q4pct) / 100, 0);
  const lowQ4 = leagues.filter((l) => !TOP_LEAGUES.includes(l.league)).reduce((a, l) => a + (l.players * l.q4pct) / 100, 0);
  const lowerShare = topQ4 + lowQ4 > 0 ? Math.round((lowQ4 / (topQ4 + lowQ4)) * 100) : null;

  const never = minutes.data?.neverPlayed ?? null;
  const topScorer = scorers.data?.topGoals?.[0] ?? null;
  const ready = region.data?.pyramid != null && cohorts.length > 0;

  if (region.isLoading) return <div className="fed-skeleton" style={{ height: 320 }} />;
  if (region.error) return <div className="fed-empty">Не удалось загрузить открытия региона</div>;
  if (!ready) return <div className="fed-empty">Сводные данные региона ещё не сформированы.</div>;

  return (
    <div className="fed-grid fed-grid--2">
      {/* Hero finding */}
      <Link to="/federation/talent-loss" className="fed-card" style={{ textDecoration: 'none', color: 'inherit', gridColumn: 'span 2' }}>
        <div className="fed-badge fed-badge--warning" style={{ marginBottom: 16 }}>Ключевое наблюдение</div>
        <h3 style={{ fontSize: 28, fontWeight: 300, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
          Поздно рождённые отсеиваются уже на входе в академии
        </h3>
        <p className="fed-note">
          По данным {totalPlayers.toLocaleString('ru-RU')} игроков Первенства рождённых в начале года
          {raeSkew != null ? <> в <strong>{raeSkew}×</strong> больше</> : ''}, чем в конце.
          Перейти к разделу «Потеря таланта» →
        </p>
      </Link>

      {/* Secondary findings */}
      <Link to="/federation/talent-loss" className="fed-card" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="fed-badge fed-badge--accent" style={{ marginBottom: 16 }}>Пирамида лиг</div>
        <h3 style={{ fontSize: 20, fontWeight: 400, margin: '0 0 8px' }}>
          {lowerShare != null ? `${lowerShare}% поздно рождённых в нижних лигах` : 'Распределение по лигам'}
        </h3>
        <p className="fed-note">Не выбывают из системы, а смещаются в нижние эшелоны. Перейти →</p>
      </Link>

      <Link to="/federation/talent-loss" className="fed-card" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="fed-badge fed-badge--danger" style={{ marginBottom: 16 }}>Карта возможностей</div>
        <h3 style={{ fontSize: 20, fontWeight: 400, margin: '0 0 8px' }}>
          {never != null ? `${never.toLocaleString('ru-RU')} игроков не выходят на поле` : 'Доступ к игровому времени'}
        </h3>
        <p className="fed-note">Прошли отбор, но остаются без игровой практики. Перейти →</p>
      </Link>

      <Link to="/federation/talent" className="fed-card" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="fed-badge fed-badge--success" style={{ marginBottom: 16 }}>Бомбардиры</div>
        <h3 style={{ fontSize: 20, fontWeight: 400, margin: '0 0 8px' }}>
          {topScorer ? `${topScorer.name} — ${topScorer.goals} голов` : 'Лучшие бомбардиры'}
        </h3>
        <p className="fed-note">{topScorer ? `${topScorer.club} · ${topScorer.cohort} г.р.` : 'Голы по протоколам'} · Перейти →</p>
      </Link>
    </div>
  );
}
