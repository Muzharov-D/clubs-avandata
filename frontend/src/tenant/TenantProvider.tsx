import type { ReactNode } from 'react';
// @ts-ignore — живой провайдер тенанта/тарифа лежит в legacy .jsx
import { useAuth } from '../contexts/AuthContext';
import type { Tenant } from './types';

/**
 * useTenant — тонкий адаптер над ЖИВЫМ AuthContext.
 *
 * Тенант (с тарифом `plan`) и брендинг приходят из /auth/me и /login и хранятся
 * в `contexts/AuthContext`. Отдельный TenantProvider больше НЕ монтируется —
 * раньше он был объявлен, но не вставлен в дерево, из-за чего `useTenant()`
 * всегда возвращал `null`, план считался `free`, и платные блоки прятались
 * даже на paid-клубе («разница 0»). Теперь источник тарифа один — AuthContext.
 */
interface TenantContextValue {
  tenant: Tenant | null;
  loading: boolean;
  /** Перечитать клуб (тариф/бренд) с бэка без перезагрузки страницы. */
  refreshTenant: () => void;
}

interface AuthShape {
  tenant: Tenant | null;
  loading: boolean;
  refreshTenant?: () => void;
}

export function useTenant(): TenantContextValue {
  const auth = useAuth() as AuthShape;
  return {
    tenant: auth.tenant ?? null,
    loading: auth.loading ?? false,
    refreshTenant: auth.refreshTenant ?? (() => {}),
  };
}

/**
 * Совместимость: брендинг/тенант обеспечивает AuthProvider, поэтому обёртка —
 * passthrough. Оставлена, чтобы не ломать возможные импорты `TenantProvider`.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
