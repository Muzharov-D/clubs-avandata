import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Legacy Легирус-контексты и компоненты (.jsx, через allowJs)
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TeamProvider } from './contexts/TeamContext';
import { TournamentProvider } from './contexts/TournamentContext';
// @ts-ignore — legacy .jsx
import { DashboardLayoutProvider } from './constructor/DashboardLayoutContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
// @ts-ignore — legacy .jsx
import SetPassword from './pages/SetPassword';
// @ts-ignore — legacy .jsx
import PrivacyPolicy from './pages/PrivacyPolicy';
import ClubOverview from './pages/ClubOverview';
import ClubDashboard from './pages/ClubDashboard';
// @ts-ignore — legacy .jsx
import ClubHub from './pages/ClubHub';
import MatchesDashboard from './pages/MatchesDashboard';
import MatchDetail from './pages/MatchDetail';
import ComparisonView from './pages/ComparisonView';
import PlayersLeaders from './pages/PlayersLeaders';
import PlayersRating from './pages/PlayersRating';
import PlayerDetail from './pages/PlayerDetail';
// @ts-ignore — legacy .jsx
import PlayerCompare from './pages/PlayerCompare';
import LiteView from './routes/lite/LiteView';
// @ts-ignore — legacy .jsx
import PlayerCabinet from './routes/lite/PlayerCabinet';
// @ts-ignore — legacy .jsx
import LiteShell from './routes/lite/LiteShell';
// @ts-ignore — legacy .jsx
import LoadControl from './pages/LoadControl';
import CalendarPage from './pages/CalendarPage';
import TrainingsPage from './pages/TrainingsPage';
// @ts-ignore — legacy .jsx
import ConstructorPage from './pages/ConstructorPage';
import PublicTeamSchedule from './pages/PublicTeamSchedule';
import LeagueFixture from './pages/LeagueFixture';
import PublicLanding from './pages/PublicLanding';
import { AvandataLanding } from './pages/AvandataLanding';
import { PublicTenantTeam } from './pages/PublicTenantTeam';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastHost } from './components/Toast';

// Новые admin-страницы Clubs Avandata (платформенный уровень)
import { AdminLayout } from './routes/admin/AdminLayout';
import { AdminTenantsList } from './routes/admin/AdminTenantsList';
import { AdminTenantNew } from './routes/admin/AdminTenantNew';
import { AdminTenantDetail } from './routes/admin/AdminTenantDetail';

// Кабинет федерации региона (federation_admin) — оболочка eager, экраны lazy
// (отдельные чанки: фед-код грузится только при заходе в /federation, не в клубный бандл).
import { FederationLayout } from './routes/federation/FederationLayout';
// 5 консолидированных экранов кабинета (композиция тел существующих экранов).
const FederationOverview = lazy(() => import('./routes/federation/OverviewView').then((m) => ({ default: m.FederationOverview })));
const FederationTalentLoss = lazy(() => import('./routes/federation/TalentLossView').then((m) => ({ default: m.FederationTalentLoss })));
const FederationTalent = lazy(() => import('./routes/federation/TalentView').then((m) => ({ default: m.FederationTalent })));
const FederationClubs = lazy(() => import('./routes/federation/ClubsView').then((m) => ({ default: m.FederationClubs })));
const FederationSecondLeague = lazy(() => import('./routes/federation/SecondLeagueView').then((m) => ({ default: m.SecondLeague })));
const LeagueVideoPublic = lazy(() => import('./routes/federation/LeagueVideoPublic').then((m) => ({ default: m.LeagueVideoPublic })));
// Глубокий маршрут профиля игрока — достижим, но вне главного нав.
const FederationAvPlayerProfile = lazy(() => import('./routes/federation/AvPlayerProfile').then((m) => ({ default: m.FederationAvPlayerProfile })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

// На `clubs.avandata.ru/` показываем Avandata-лендинг (бренд платформы).
// Tenant-specific ClubLanding (Легирус и т.д.) — после login или на subdomain'e.
function RootRoute() {
  const { user, tenant, loading } = useAuth() as { user: any; tenant: { plan?: string } | null; loading: boolean };
  if (loading) return <AvandataLanding />;  // не блокируем лендинг, пока auth решается
  if (!user) return <AvandataLanding />;
  // platform_admin → в админку; обычный пользователь → в свой кабинет
  if (user.role === 'platform_admin') return <Navigate to="/admin" replace />;
  if (user.role === 'federation_admin') return <Navigate to="/federation" replace />;
  // Спортдиректор слит со старшим тренером (одна роль) → единый клубный кабинет.
  if (user.role === 'sporting_director') return <Navigate to="/club-hub" replace />;
  // Игрок — в свой кабинет Lite (что открыл тренер + разбор), а НЕ в полный
  // профиль игрока: там 28 осей и командная фактура, это экран аналитика.
  if (user.role === 'player') return <Navigate to="/me" replace />;
  // Тариф «Лайт» — отдельный кабинет из одного экрана: тренер приземляется
  // сразу на разбор, аналитических домов у него нет.
  if (tenant?.plan === 'lite') return <Navigate to="/lite" replace />;
  // Старший тренер клуба приземляется в клубный обзор (кабинет), а не на
  // конкретную команду — у него работа сквозная по всем возрастам.
  if (user.role === 'head_coach') return <Navigate to="/club-hub" replace />;
  return <Navigate to="/club" replace />;
}

function CoachOnly({ children }: { children: React.ReactNode }) {
  // Тренер (включая старшего, в т.ч. бывшего спортдиректора — роли слиты) видит
  // аналитические экраны. Игрок — в свой кабинет.
  const { isCoach, isPlayer } = useAuth() as { isCoach: boolean; isPlayer: boolean };
  if (isCoach) return <>{children}</>;
  if (isPlayer) return <Navigate to="/me" replace />;
  return <Navigate to="/club" replace />;
}

/**
 * Кабинет игрока. Игрок в системе видит ТОЛЬКО его: командные экраны (состав,
 * рейтинги, матчи) содержат данные других детей, а контракт Lite — «игроку видно
 * то, что открыл тренер». Поэтому любой другой клубный маршрут уводит сюда.
 */
function PlayerHome({ children }: { children: React.ReactNode }) {
  const { isPlayer, loading } = useAuth() as { isPlayer: boolean; loading: boolean };
  if (loading) return null;
  if (!isPlayer) return <Navigate to="/club" replace />;
  return <>{children}</>;
}

/** Любой клубный экран, кроме кабинета: игрока разворачиваем на /me. */
function NotForPlayer({ children }: { children: React.ReactNode }) {
  const { isPlayer } = useAuth() as { isPlayer: boolean };
  if (isPlayer) return <Navigate to="/me" replace />;
  return <>{children}</>;
}

/**
 * Оболочка клубной части. Тариф «Лайт» — ОТДЕЛЬНЫЙ кабинет: своя шапка без
 * сайдбара и без аналитического хрома. Остальные тарифы живут в обычном
 * кабинете. Один набор маршрутов, разные оболочки — чтобы адреса не разъезжались.
 */
function ClubShell() {
  const { tenant } = useAuth() as { tenant: { plan?: string } | null };
  return tenant?.plan === 'lite' ? <LiteShell /> : <MainLayout />;
}

/** Экран аналитического кабинета: на тарифе «Лайт» его нет — уводим на разбор. */
function FullPlanOnly({ children }: { children: React.ReactNode }) {
  const { tenant, isPlayer } = useAuth() as { tenant: { plan?: string } | null; isPlayer: boolean };
  if (isPlayer) return <Navigate to="/me" replace />;
  if (tenant?.plan === 'lite') return <Navigate to="/lite" replace />;
  return <>{children}</>;
}

// Клубный кабинет — только старшему тренеру; остальные тренеры → на свою команду.
function HeadCoachOnly({ children }: { children: React.ReactNode }) {
  const { isHeadCoach } = useAuth() as { isHeadCoach: boolean };
  if (isHeadCoach) return <>{children}</>;
  return <Navigate to="/club" replace />;
}

function OwnPlayerOnly({ children }: { children: React.ReactNode }) {
  // Полный профиль (28 осей, командная фактура) — тренерский экран. Игроку он
  // не показывается даже про себя: его дом — /me.
  const { isPlayer } = useAuth() as { isPlayer: boolean };
  if (isPlayer) return <Navigate to="/me" replace />;
  return <>{children}</>;
}

// Платные модули (Календарь / Тренировки / Нагрузка) на free недоступны —
// прямой переход редиректит в /club. На время загрузки тенанта не редиректим.
function PaidOnly({ children }: { children: React.ReactNode }) {
  const { tenant, loading } = useAuth() as { tenant: { plan?: string } | null; loading: boolean };
  if (loading) return null;
  if (tenant?.plan !== 'paid') return <Navigate to="/club" replace />;
  return <>{children}</>;
}

function PlatformAdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: any; loading: boolean };
  // Пока auth резолвится (fetchMe), НЕ редиректим — иначе прямой переход на
  // глубокий admin-маршрут (/admin/tenants/new) роняет реального админа на /login.
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'platform_admin') return <Navigate to="/club" replace />;
  return <>{children}</>;
}

function FederationOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: any; loading: boolean };
  // Как PlatformAdminOnly: на время резолва auth не редиректим (иначе прямой
  // переход на глубокий /federation/* роняет реального пользователя на /login).
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'federation_admin') return <Navigate to="/club" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastHost />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <TeamProvider>
              <TournamentProvider>
                <DashboardLayoutProvider>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/set-password" element={<SetPassword />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/" element={<RootRoute />} />

                  {/* Public родительский экран (без auth) */}
                  <Route path="/public" element={<PublicLanding />} />
                  <Route path="/public/team/:age" element={<PublicTeamSchedule />} />
                  <Route path="/public/team/:age/league" element={<LeagueFixture />} />
                  {/* Multi-tenant public — главное для родителя */}
                  <Route path="/m/:slug/team/:age" element={<PublicTenantTeam />} />
                  {/* Публичное видео матча Второй лиги (цель «поделиться») */}
                  <Route path="/league/video/:id" element={<Suspense fallback={null}><LeagueVideoPublic /></Suspense>} />

                  {/* Платформенный админ (Clubs Avandata) */}
                  <Route
                    path="/admin"
                    element={
                      <PlatformAdminOnly>
                        <AdminLayout />
                      </PlatformAdminOnly>
                    }
                  >
                    <Route index element={<AdminTenantsList />} />
                    <Route path="tenants/new" element={<AdminTenantNew />} />
                    <Route path="tenants/:slug" element={<AdminTenantDetail />} />
                  </Route>

                  {/* Кабинет федерации региона (federation_admin) */}
                  <Route
                    path="/federation"
                    element={
                      <FederationOnly>
                        <FederationLayout />
                      </FederationOnly>
                    }
                  >
                    {/* 4 раздела */}
                    <Route index element={<FederationOverview />} />
                    <Route path="talent-loss" element={<FederationTalentLoss />} />
                    <Route path="talent" element={<FederationTalent />} />
                    <Route path="clubs" element={<FederationClubs />} />
                    <Route path="second-league" element={<FederationSecondLeague />} />
                    {/* «Управление лигами» свёрнуто блоком внизу «Клубы» — старая ссылка не 404 */}
                    <Route path="leagues" element={<Navigate to="/federation/clubs" replace />} />

                    {/* Глубокий профиль игрока — достижим, вне главного нав */}
                    <Route path="players/:id" element={<FederationAvPlayerProfile />} />

                    {/* Редиректы старых путей на ближайший из 5 (закладки не 404) */}
                    <Route path="discoveries" element={<Navigate to="/federation" replace />} />
                    <Route path="region-map" element={<Navigate to="/federation" replace />} />
                    <Route path="pyramid" element={<Navigate to="/federation/talent-loss" replace />} />
                    <Route path="age-effect" element={<Navigate to="/federation/talent-loss" replace />} />
                    <Route path="opportunity" element={<Navigate to="/federation/talent-loss" replace />} />
                    <Route path="fairness" element={<Navigate to="/federation/talent-loss" replace />} />
                    <Route path="loss-map" element={<Navigate to="/federation/clubs" replace />} />
                    <Route path="scorers" element={<Navigate to="/federation/talent" replace />} />
                    <Route path="best-xi" element={<Navigate to="/federation/talent" replace />} />
                    <Route path="players" element={<Navigate to="/federation/talent" replace />} />
                    <Route path="talent-production" element={<Navigate to="/federation/clubs" replace />} />
                    <Route path="cohorts" element={<Navigate to="/federation/talent-loss" replace />} />
                    <Route path="compare" element={<Navigate to="/federation/clubs" replace />} />
                    <Route path="*" element={<Navigate to="/federation" replace />} />
                  </Route>

                  {/* Авторизованный кабинет клуба */}
                  <Route element={<ProtectedRoute roles={[]}><ClubShell /></ProtectedRoute>}>
                    {/* Спортдиректор слит со старшим тренером — старый дом редиректит в единый кабинет. */}
                    <Route path="/director" element={<Navigate to="/club-hub" replace />} />
                    <Route path="/club" element={<FullPlanOnly><ClubDashboard /></FullPlanOnly>} />
                    <Route path="/club-hub" element={<FullPlanOnly><HeadCoachOnly><ClubHub /></HeadCoachOnly></FullPlanOnly>} />
                    {/* Lite — упрощённый разбор игрока: 6 осей по амплуа, 3 главных выделены. */}
                    <Route path="/lite" element={<CoachOnly><LiteView /></CoachOnly>} />
                    {/* Кабинет игрока: только открытое тренером + разбор и ответ. */}
                    <Route path="/me" element={<PlayerHome><PlayerCabinet /></PlayerHome>} />
                    <Route path="/analytics" element={<FullPlanOnly><CoachOnly><ClubOverview /></CoachOnly></FullPlanOnly>} />
                    <Route path="/analytics/team" element={<FullPlanOnly><CoachOnly><ComparisonView /></CoachOnly></FullPlanOnly>} />
                    <Route path="/matches" element={<FullPlanOnly><MatchesDashboard /></FullPlanOnly>} />
                    <Route path="/matches/:matchId" element={<FullPlanOnly><MatchDetail /></FullPlanOnly>} />
                    <Route path="/calendar" element={<PaidOnly><NotForPlayer><CalendarPage /></NotForPlayer></PaidOnly>} />
                    <Route path="/trainings" element={<PaidOnly><CoachOnly><TrainingsPage /></CoachOnly></PaidOnly>} />
                    <Route path="/players" element={<FullPlanOnly><CoachOnly><PlayersLeaders /></CoachOnly></FullPlanOnly>} />
                    <Route path="/players/rating" element={<FullPlanOnly><CoachOnly><PlayersRating /></CoachOnly></FullPlanOnly>} />
                    <Route path="/players/compare" element={<FullPlanOnly><CoachOnly><PlayerCompare /></CoachOnly></FullPlanOnly>} />
                    <Route path="/load" element={<PaidOnly><CoachOnly><LoadControl /></CoachOnly></PaidOnly>} />
                    {/* PlayerDetail.jsx — 1:1 копия Легируса с pizza-chart, фото, бейджами */}
                    <Route path="/players/:playerId" element={<FullPlanOnly><OwnPlayerOnly><PlayerDetail /></OwnPlayerOnly></FullPlanOnly>} />
                    <Route path="/constructor" element={<FullPlanOnly><CoachOnly><ConstructorPage /></CoachOnly></FullPlanOnly>} />
                    {/* Неизвестный путь: тренера — в клуб, игрока — в его кабинет. */}
                    <Route path="*" element={<NotForPlayer><Navigate to="/club" replace /></NotForPlayer>} />
                  </Route>
                </Routes>
                </DashboardLayoutProvider>
              </TournamentProvider>
            </TeamProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
