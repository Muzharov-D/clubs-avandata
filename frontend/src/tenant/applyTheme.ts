import type { TenantBrand } from './types';

export function applyTheme(brand: TenantBrand, slug: string) {
  const root = document.documentElement;
  if (brand.primary)       root.style.setProperty('--brand-primary', brand.primary);
  if (brand.primaryHover)  root.style.setProperty('--brand-primary-hover', brand.primaryHover);
  if (brand.secondary)     root.style.setProperty('--brand-secondary', brand.secondary);
  if (brand.accent)        root.style.setProperty('--brand-accent', brand.accent);
  root.setAttribute('data-tenant', slug);

  if (brand.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = brand.faviconUrl;
  }
  if (brand.titleSuffix) {
    document.title = brand.titleSuffix;
  }
}

export function resetTheme() {
  const root = document.documentElement;
  root.style.removeProperty('--brand-primary');
  root.style.removeProperty('--brand-primary-hover');
  root.style.removeProperty('--brand-secondary');
  root.style.removeProperty('--brand-accent');
  root.removeAttribute('data-tenant');
}
