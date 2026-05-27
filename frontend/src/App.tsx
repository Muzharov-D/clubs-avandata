import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { TenantProvider } from './tenant/TenantProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './routes/Login';
import { HomePage } from './routes/Home';
import { AdminLayout } from './routes/admin/AdminLayout';
import { AdminTenantsList } from './routes/admin/AdminTenantsList';
import { AdminTenantNew } from './routes/admin/AdminTenantNew';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<HomePage />} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={['platform_admin']}>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AdminTenantsList />} />
                <Route path="tenants/new" element={<AdminTenantNew />} />
              </Route>
            </Routes>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
