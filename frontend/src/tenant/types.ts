export interface TenantBrand {
  logoUrl?: string;
  primary?: string;
  primaryHover?: string;
  secondary?: string;
  accent?: string;
  titleSuffix?: string;
  faviconUrl?: string;
}

export interface Tenant {
  slug: string;
  name: string;
  displayName: string;
  status: 'active' | 'suspended' | 'archived';
  brand: TenantBrand;
}
