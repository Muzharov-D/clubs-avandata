import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Reveal, AnimatedNumber } from '../../components/motion';
import './avandata.css';

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

const TOP_LEAGUES = ['Высшая', 'Первая'];

export function FederationDiscoveries() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const ready = useDiscoveriesReady();
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
      <DiscoveriesBody />
    </div>
  );
}

/** Готов ли снимок открытий (для подзаголовка экрана). */
function useDiscoveriesReady(): boolean {
  const region = useQuery({ queryKey: ['federation', 'region-map'], queryFn: () => api<RegionMapData>('/federation/region-map') });
  const cohorts = region.data?.pyramid?.ageEffect ?? [];
  return region.data?.pyramid != null && cohorts.length > 0;
}

/**
 * Тело «Открытий региона» — карточки-приговоры (вердикт → улика → ссылка вглубь),
 * ведущие в 3 других таба. Самонесущее (fetch внутри), без шапки экрана —
 * встраивается в «Обзор». Ссылки указывают на новые консолидированные маршруты.
 */
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
  if (region.error) return <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить открытия региона</div>;
  if (region.data && !ready) {
    return (
      <div className="fed-empty">
        <div className="fed-empty__icon" aria-hidden>🔭</div>
        Сводные данные региона ещё не сформированы — аналитические выводы появятся после ближайшего обновления данных ФФСПб.
      </div>
    );
  }
  if (!ready) return null;

  return (
    <div className="fed-stack">
      <Reveal variant="slide-up">
        <Link to="/federation/talent-loss" className="fed-finding fed-finding--hero" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="fed-finding__kicker">Ключевое наблюдение · возрастной отбор</div>
          <p className="fed-finding__verdict">Поздно рождённые отсеиваются уже на входе в академии.</p>
          <p className="fed-finding__why">
            По данным <AnimatedNumber value={totalPlayers} /> игроков Первенства рождённых в начале года{raeSkew != null ? <> в <b>{raeSkew}×</b> больше</> : ''}, чем в конце.
            Перекос проявляется только на масштабе региона. Перейти к разделу «Потеря таланта» →
          </p>
        </Link>
      </Reveal>

      <div className="fed-cols">
        <Reveal variant="slide-up" delay={0.05}>
          <Link to="/federation/talent-loss" className="fed-finding" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="fed-finding__kicker">Пирамида лиг</div>
            <p className="fed-finding__verdict" style={{ fontSize: 16 }}>
              {lowerShare != null ? `${lowerShare}% поздно рождённых выступают в нижних лигах` : 'Распределение поздно рождённых по лигам'}
            </p>
            <p className="fed-finding__why">Не выбывают из системы, а смещаются в нижние эшелоны. Перейти к разделу →</p>
          </Link>
        </Reveal>

        <Reveal variant="slide-up" delay={0.1}>
          <Link to="/federation/talent-loss" className="fed-finding" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="fed-finding__kicker">Карта возможностей</div>
            <p className="fed-finding__verdict" style={{ fontSize: 16 }}>
              {never != null ? <><AnimatedNumber value={never} /> игроков не выходят на поле ни разу</> : 'Доступ к игровому времени у прошедших отбор'}
            </p>
            <p className="fed-finding__why">Прошли отбор, но остаются на скамейке без игровой практики. Перейти к разделу →</p>
          </Link>
        </Reveal>

        <Reveal variant="slide-up" delay={0.15}>
          <Link to="/federation/talent" className="fed-finding" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="fed-finding__kicker">Бомбардиры</div>
            <p className="fed-finding__verdict" style={{ fontSize: 16 }}>
              {topScorer ? `${topScorer.name} — ${topScorer.goals} ${topScorer.goals % 10 === 1 && topScorer.goals % 100 !== 11 ? 'гол' : 'голов'}` : 'Лучшие бомбардиры региона'}
            </p>
            <p className="fed-finding__why">{topScorer ? `${topScorer.club} · ${topScorer.cohort} г.р.` : 'Голы по данным протоколов'} · Перейти к разделу →</p>
          </Link>
        </Reveal>
      </div>

      <p className="fed-faint" style={{ fontSize: 11.5, margin: '4px 2px 0', lineHeight: 1.55 }}>
        Источник данных — официальный API ФФСПб. Структура наблюдения: вывод → подтверждающие данные → переход к разделу.
      </p>
    </div>
  );
}
