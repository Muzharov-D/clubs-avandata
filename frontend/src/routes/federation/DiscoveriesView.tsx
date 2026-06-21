import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './federation.css';

/**
 * Открытия региона — домашняя сборка выводов-приговоров поверх УЖЕ снятых
 * месячных снимков (region_census / region_minutes / region_scorers). Никакого
 * нового обхода FFSPB: герой возрастной утечки из ageEffect + карточки-находки
 * со ссылками вглубь. Принцип: вердикт → улика → ссылка вглубь.
 */

interface AgeCohort { year: number; players: number; q1pct: number; q4pct: number; skew: number | null }
interface LeagueRow { league: string; players: number; q4pct: number }
interface RegionMapData {
  pyramid: { season: string; ageEffect: AgeCohort[]; leagues: LeagueRow[] } | null;
}
interface MinutesData { evaluated: number; neverPlayed: number; buried15: number }
interface ScorersData { topGoals: Array<{ name: string; club: string; cohort: number; goals: number }> }

const num = (n: number): string => Math.round(n).toLocaleString('ru-RU');
const TOP_LEAGUES = ['Высшая', 'Первая'];

export function FederationDiscoveries() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
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

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Открытия региона</h1>
          <p className="fed-sub">
            {ready ? 'Что данные говорят регулятору сегодня' : (federation?.region ?? federation?.name ?? 'Регион')}
          </p>
        </div>
      </header>

      {region.isLoading && <div className="fed-skeleton" style={{ height: 320 }} />}
      {region.error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить открытия региона</div>}

      {region.data && !ready && (
        <div className="fed-empty">
          <div className="fed-empty__icon" aria-hidden>🔭</div>
          Месячный снимок региона ещё не снят — открытия появятся после ближайшего обхода FFSPB.
        </div>
      )}

      {ready && (
        <div className="fed-stack">
          <Link to="/federation/age-effect" className="fed-finding fed-finding--hero fed-rise" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="fed-finding__kicker">⚠ Главное · возрастная утечка</div>
            <p className="fed-finding__verdict">Поздно-рождённых отсеивают ещё на входе в академии.</p>
            <p className="fed-finding__why">
              По {num(totalPlayers)} игрокам Первенства рождённых в начале года{raeSkew != null ? <> в <b>{raeSkew}×</b> больше</> : ''}, чем в конце.
              Видно только на масштабе региона. Открыть разбор по когортам →
            </p>
          </Link>

          <div className="fed-cols">
            <Link to="/federation/pyramid" className="fed-finding fed-rise" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div className="fed-finding__kicker">Пирамида лиг</div>
              <p className="fed-finding__verdict" style={{ fontSize: 16 }}>
                {lowerShare != null ? `${lowerShare}% поздно-рождённых играют в нижних лигах` : 'Где осели поздно-рождённые'}
              </p>
              <p className="fed-finding__why">Их не выбросили — спустили вниз. Открыть →</p>
            </Link>

            <Link to="/federation/opportunity" className="fed-finding fed-rise" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div className="fed-finding__kicker">Карта возможностей</div>
              <p className="fed-finding__verdict" style={{ fontSize: 16 }}>
                {never != null ? `${num(never)} игроков не выходят ни разу` : 'Кого из выживших не выпускают'}
              </p>
              <p className="fed-finding__why">Отобрали — но держат на скамейке. Открыть →</p>
            </Link>

            <Link to="/federation/scorers" className="fed-finding fed-rise" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div className="fed-finding__kicker">Бомбардиры</div>
              <p className="fed-finding__verdict" style={{ fontSize: 16 }}>
                {topScorer ? `${topScorer.name} — ${topScorer.goals} ${topScorer.goals % 10 === 1 && topScorer.goals % 100 !== 11 ? 'гол' : 'голов'}` : 'Лучшие бомбардиры региона'}
              </p>
              <p className="fed-finding__why">{topScorer ? `${topScorer.club} · ${topScorer.cohort} г.р.` : 'Голы из протоколов'} · Открыть →</p>
            </Link>
          </div>

          <p className="fed-faint" style={{ fontSize: 11.5, margin: '4px 2px 0', lineHeight: 1.55 }}>
            Источник истины — официальный API ФФСПб. Каждое открытие: вердикт → улика → ссылка вглубь.
          </p>
        </div>
      )}
    </div>
  );
}
