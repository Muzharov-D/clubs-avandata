import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Legacy Легирус-контексты и компоненты (.jsx, через allowJs)
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TeamProvider } from './contexts/TeamContext';
import { TournamentProvider } from './contexts/TournamentContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
// @ts-ignore — legacy .jsx
import SetPassword from './pages/SetPassword';
import ClubOverview from './pages/ClubOverview';
import ClubDashboard from './pages/ClubDashboard';
import MatchesDashboard from './pages/MatchesDashboard';
import MatchDetail from './pages/MatchDetail';
import ComparisonView from './pages/ComparisonView';
import PlayersLeaders from './pages/PlayersLeaders';
import PlayersRating from './pages/PlayersRating';
import PlayerDetail from './pages/PlayerDetail';
import CalendarPage from './pages/CalendarPage';
import TrainingsPage from './pages/TrainingsPage';
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

function PlatformAdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth() as { user: any };
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
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/set-password" element={<SetPassword />} />
                  <Route path="/" element={<RootRoute />} />

                  {/* Public родительский экран (без auth) */}
                  <Route path="/public" element={<PublicLanding />} />
                  <Route path="/public/team/:age" element={<PublicTeamSchedule />} />
                  <Route path="/public/team/:age/league" element={<LeagueFixture />} />
                  {/* Multi-tenant public — главное для родителя */}
                  <Route path="/m/:slug/team/:age" element={<PublicTenantTeam />} />

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
                  </Route>

                  {/* Авторизованный кабинет клуба */}
                  <Route element={<ProtectedRoute roles={[]}><MainLayout /></ProtectedRoute>}>
                    <Route path="/club" element={<ClubDashboard />} />
                    <Route path="/analytics" element={<CoachOnly><ClubOverview /></CoachOnly>} />
                    <Route path="/analytics/team" element={<CoachOnly><ComparisonView /></CoachOnly>} />
                    <Route path="/matches" element={<MatchesDashboard />} />
                    <Route path="/matches/:matchId" element={<MatchDetail />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/trainings" element={<CoachOnly><TrainingsPage /></CoachOnly>} />
                    <Route path="/players" element={<CoachOnly><PlayersLeaders /></CoachOnly>} />
                    <Route path="/players/rating" element={<CoachOnly><PlayersRating /></CoachOnly>} />
                    {/* PlayerDetail.jsx — 1:1 копия Легируса с pizza-chart, фото, бейджами */}
                    <Route path="/players/:playerId" element={<OwnPlayerOnly><PlayerDetail /></OwnPlayerOnly>} />
                    <Route path="*" element={<Navigate to="/club" replace />} />
                  </Route>
                </Routes>
              </TournamentProvider>
            </TeamProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
