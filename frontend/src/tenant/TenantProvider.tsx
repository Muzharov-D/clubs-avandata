import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { applyTheme, resetTheme } from './applyTheme';
import type { Tenant } from './types';

interface TenantContextValue {
  tenant: Tenant | null;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue>({ tenant: null, loading: false });

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) {
      setTenant(null);
      resetTheme();
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<Tenant>(`/tenant/${user.tenantId}`, { auth: false })
      .then((t) => {
        if (cancelled) return;
        setTenant(t);
        applyTheme(t.brand, t.slug);
      })
      .catch(() => {
        if (cancelled) return;
        setTenant(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.tenantId]);

  return <TenantContext.Provider value={{ tenant, loading }}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}
