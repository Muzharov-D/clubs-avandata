import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { applyTheme, resetTheme } from './applyTheme';
import type { Tenant } from './types';

interface TenantContextValue {
  tenant: Tenant | null;
  loading: boolean;
  /** Перечитать клуб (тариф/бренд) с бэка без перезагрузки страницы. */
  refreshTenant: () => void;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: false,
  refreshTenant: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const tenantId = user?.tenantId;
  // Держим последний tenantId в ref, чтобы слушатели focus/visibility
  // не пересоздавались на каждый рендер.
  const tenantIdRef = useRef<string | undefined>(tenantId);
  tenantIdRef.current = tenantId;

  const fetchTenant = useCallback((id: string) => {
    setLoading(true);
    return api<Tenant>(`/tenant/${id}`, { auth: false })
      .then((t) => {
        setTenant(t);
        applyTheme(t.brand, t.slug);
      })
      .catch(() => {
        // не сбрасываем уже загруженный клуб при разовой сетевой ошибке рефетча
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshTenant = useCallback(() => {
    const id = tenantIdRef.current;
    if (id) void fetchTenant(id);
  }, [fetchTenant]);

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      resetTheme();
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<Tenant>(`/tenant/${tenantId}`, { auth: false })
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
  }, [tenantId]);

  // Авто-рефетч тарифа/бренда без F5: когда вкладка снова в фокусе
  // (например, platform_admin переключил тариф в другой вкладке).
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') refreshTenant();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshTenant]);

  return (
    <TenantContext.Provider value={{ tenant, loading, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}
