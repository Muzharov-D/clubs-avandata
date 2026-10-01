/**
 * Кабинет холдинга — типы ответов и хуки данных.
 * Профиль (команды, таблицы, матчи) и аналитика (игроки/команды относительно лиги,
 * решения) могут прийти как 202 «идёт прогрев» — тогда опрашиваем каждые 8 с.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import type { HoldingProfile } from '../federation/HoldingView';

export type { HoldingProfile, HTeam, HMatch, HPlayer, Outcome } from '../federation/HoldingView';

export type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
export type DivisionKey = 'Высшая' | 'Первая' | null;
export const LINE_TITLE: Record<Line, string> = { GK: 'Вратарь', DEF: 'Защита', MID: 'Полузащита', FWD: 'Атака' };

export interface LeaguePlayer {
  id: number; name: string; photo: string | null; position: string | null; line: Line | null;
  birthYear: number; clubKey: string; clubLabel: string; teamKey: string; team: string;
  division: string; divisionKey: DivisionKey;
  rating: number | null; mp: number;
  rankDiv: number | null; sizeDiv: number; rankRegion: number | null; sizeRegion: number; pctRegion: number | null;
  lineAvgDiv: number | null; lineAvgRegion: number | null; deltaLine: number | null;
  trend: number | null; last: number[]; lastTour: number | null; teamLastTour: number | null; inRotation: boolean;
}
export interface LineCompare { line: Line; title: string; teamAvg: number | null; divAvg: number | null; n: number; gapRel: number | null; verdict: 'weak' | 'ok' | 'strong' | null }
export interface TeamLeague {
  key: string; clubKey: string; clubLabel: string; name: string; year: number; category: string; ageTitle: string;
  division: string; divisionKey: DivisionKey;
  avgRating: number | null; divAvgRating: number | null; divRankByAvg: number | null; divTeams: number;
  place: number | null; placeSize: number | null; ratingRank: number | null; ratingSize: number | null;
  overperformance: number | null; lines: LineCompare[]; squad: LeaguePlayer[]; inTop30: number; rated: number;
}
export interface YouthCandidate extends LeaguePlayer { tier: 'ready' | 'watch' | 'rest' }
export interface LosingPlayer extends LeaguePlayer { reason: 'trend' | 'rotation' }
export interface LineIssue { teamKey: string; clubLabel: string; year: number; category: string; line: Line; title: string; teamAvg: number; divAvg: number; gapRel: number }
export interface SelectionCandidate { line: Line; position: string | null; club: string; division: string; divisionKey: DivisionKey; rating: number; pctRegion: number; rankRegion: number; mp: number; trend: number | null }
export interface SelectionGroup { teamKey: string; clubLabel: string; year: number; category: string; division: string; line: Line; title: string; ourAvg: number | null; ourBest: number | null; ourN: number; candidates: SelectionCandidate[] }
export interface OlderAgeCandidate extends LeaguePlayer { olderTeamKey: string; olderTeamName: string; olderMedian: number; olderRank: number; olderSize: number }
export interface HoldingAnalytics {
  slug: string; season: number; asOf: string; youthFromYear: number; youthSlots: number;
  thresholds: { youthReadyPct: number; youthWatchPct: number; minMatchesReady: number; minMatchesDecision: number; losingTrendRel: number; lineGapRel: number };
  teams: TeamLeague[];
  medians: Array<{ year: number; top: number | null; first: number | null; ratedTop: number; ratedFirst: number }>;
  youth: { ready: YouthCandidate[]; watch: YouthCandidate[]; rest: YouthCandidate[] };
  promote: LeaguePlayer[]; olderAge: OlderAgeCandidate[]; selection: SelectionGroup[]; risk: LeaguePlayer[]; losing: LosingPlayer[];
  weakLines: LineIssue[]; strongLines: LineIssue[];
  players: LeaguePlayer[];
}
type Warming = { status: 'warming' };

/** Суффикс запроса: у руководства холдинг в токене, у федерации — в адресе (?slug=). */
export function useSlugQuery(): string {
  const { holding } = useAuth() as { holding: { slug: string } | null };
  const { search } = useLocation();
  if (holding) return '';
  const slug = new URLSearchParams(search).get('slug');
  return slug ? `?slug=${encodeURIComponent(slug)}` : '';
}

function useWarmable<T extends object>(key: string, path: string) {
  const q = useQuery({
    queryKey: ['holding', key, path],
    queryFn: () => api<T | Warming>(path),
    staleTime: 5 * 60_000,
    retry: 2,
    refetchInterval: (query) => (query.state.data && 'status' in query.state.data ? 8_000 : false),
    refetchIntervalInBackground: true,
  });
  const warming = !!q.data && 'status' in q.data;
  const data = q.data && !('status' in q.data) ? (q.data as T) : undefined;
  return { data, warming, isLoading: q.isLoading || warming, error: q.error };
}

export const useHoldingProfile = () => useWarmable<HoldingProfile>('profile', `/holding/profile${useSlugQuery()}`);
export const useHoldingAnalytics = () => useWarmable<HoldingAnalytics>('analytics', `/holding/analytics${useSlugQuery()}`);

// ─── Форматирование ───────────────────────────────────────────────────────────
export const num = (n: number) => Math.round(n).toLocaleString('ru-RU');
export const pm = (n: number) => (n > 0 ? `+${num(n)}` : num(n));
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const plMatch = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };
export const plPlayer = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'игроков'; if (b === 1) return 'игрок'; if (b >= 2 && b <= 4) return 'игрока'; return 'игроков'; };
export const shortClub = (label: string) => label.replace('Царское Село-Динамо', 'Царское Село').replace('ФК Динамо', 'ФК Динамо');
export const shortPos = (pos: string | null) => (pos ?? '—').replace('Центральный ', 'Ц. ').replace('Левый ', 'Л. ').replace('Правый ', 'П. ');
/** Место в турнирной таблице словами для сводки. */
export const placeWord = (place: number | null, size: number | null) => (place == null ? '—' : `${place}-е${size ? ` из ${size}` : ''}`);

// ─── Показатели (36 событий) относительно лиги ────────────────────────────────
export interface PlayerMetricRow { id: string; title: string; short: string; category: string; points: number; count: number; perMatch: number; lineAvgDiv: number | null; lineAvgRegion: number | null; pctileDiv: number | null; peersDiv: number }
export interface PlayerMetricsVsLeague { playerId: number; matches: number; line: Line | null; division: string; rows: PlayerMetricRow[]; asOf: string }
export interface TeamMetricRow { id: string; title: string; short: string; category: string; points: number; perMatch: number; divAvg: number | null; rankDiv: number | null; sizeDiv: number }
export interface TeamMetricsVsLeague { teamKey: string; matches: number; division: string; rows: TeamMetricRow[]; asOf: string }
export const CATEGORY_TITLE: Record<string, string> = { attack: 'Атака', defense: 'Оборона', general: 'Дисциплина и ошибки', pass: 'Развитие', other: 'Прочее' };
export const useTeamMetrics = (teamKey: string) => useWarmable<TeamMetricsVsLeague>('team-metrics', `/holding/teams/${encodeURIComponent(teamKey)}/metrics${useSlugQuery()}`);
