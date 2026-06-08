import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import MatchesDashboard from './pages/MatchesDashboard';
import MatchDetail from './pages/MatchDetail';
import ComparisonView from './pages/ComparisonView';
import PlayersLeaders from './pages/PlayersLeaders';
import PlayersRating from './pages/PlayersRating';
import DemoAnalytics from './pages/DemoAnalytics';
import PlayerDetail from './pages/PlayerDetail';
// @ts-ignore — legacy .jsx
import PlayerCompare from './pages/PlayerCompare';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

// На `clubs.avandata.ru/` показываем Avandata-лендинг (бренд платформы).
// Tenant-specific ClubLanding (Легирус и т.д.) — после login или на subdomain'e.
function RootRoute() {
  const { user, loading } = useAuth() as { user: any; loading: boolean };
  if (loading) return <AvandataLanding />;  // не блокируем лендинг, пока auth решается
  if (!user) return <AvandataLanding />;
  // platform_admin → в админку; обычный пользователь → в свой кабинет
  if (user.role === 'platform_admin') return <Navigate to="/admin" replace />;
  // Игрок — сразу на свой профиль
  if (user.role === 'player' && user.playerId) {
    return <Navigate to={`/players/${user.playerId}`} replace />;
  }
  return <Navigate to="/club" replace />;
}

function CoachOnly({ children }: { children: React.ReactNode }) {
  const { isCoach, isPlayer, user } = useAuth() as { isCoach: boolean; isPlayer: boolean; user: any };
  if (isCoach) return <>{children}</>;
  if (isPlayer && user?.playerId) {
    return <Navigate to={`/players/${user.playerId}`} replace />;
  }
  return <Navigate to="/club" replace />;
}

function OwnPlayerOnly({ children }: { children: React.ReactNode }) {
  const { isPlayer, user } = useAuth() as { isPlayer: boolean; user: any };
  const { playerId: routePlayerId } = useParams();
  if (isPlayer && user?.playerId && routePlayerId !== user.playerId) {
    return <Navigate to={`/players/${user.playerId}`} replace />;
  }
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

                  {/* Кино-демо расширенной аналитики (апселл free → paid), полноэкранно */}
                  <Route
                    path="/demo-analytics"
                    element={<ProtectedRoute roles={[]}><DemoAnalytics /></ProtectedRoute>}
                  />

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

                  {/* Авторизованный кабинет клуба */}
                  <Route element={<ProtectedRoute roles={[]}><MainLayout /></ProtectedRoute>}>
                    <Route path="/club" element={<ClubDashboard />} />
                    <Route path="/analytics" element={<CoachOnly><ClubOverview /></CoachOnly>} />
                    <Route path="/analytics/team" element={<CoachOnly><ComparisonView /></CoachOnly>} />
                    <Route path="/matches" element={<MatchesDashboard />} />
                    <Route path="/matches/:matchId" element={<MatchDetail />} />
                    <Route path="/calendar" element={<PaidOnly><CalendarPage /></PaidOnly>} />
                    <Route path="/trainings" element={<PaidOnly><CoachOnly><TrainingsPage /></CoachOnly></PaidOnly>} />
                    <Route path="/players" element={<CoachOnly><PlayersLeaders /></CoachOnly>} />
                    <Route path="/players/rating" element={<CoachOnly><PlayersRating /></CoachOnly>} />
                    <Route path="/players/compare" element={<CoachOnly><PlayerCompare /></CoachOnly>} />
                    <Route path="/load" element={<PaidOnly><CoachOnly><LoadControl /></CoachOnly></PaidOnly>} />
                    {/* PlayerDetail.jsx — 1:1 копия Легируса с pizza-chart, фото, бейджами */}
                    <Route path="/players/:playerId" element={<OwnPlayerOnly><PlayerDetail /></OwnPlayerOnly>} />
                    <Route path="/constructor" element={<CoachOnly><ConstructorPage /></CoachOnly>} />
                    <Route path="*" element={<Navigate to="/club" replace />} />
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
