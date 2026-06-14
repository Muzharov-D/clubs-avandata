import { pgTable, text, timestamp, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { federations } from './federations.js';
import { tenants } from './tenants.js';

/**
 * Членство клуба в федерации (M:N). `tier`: 'full' — клуб на платформе (полные
 * данные), 'listed' — только открытый слой (зарезервировано, в MVP не пишется —
 * FK на tenants его пока не держит). НЕ tenant-scoped: читается внутри
 * withFederation/withBypassRLS (bypass='on'). FED_MEMBERSHIP_SQL фильтрует
 * tenant_id по строкам tier='full'. Таблица + RLS — в drizzle/0011_federations.sql.
 */
export const federationTenants = pgTable(
  'federation_tenants',
  {
    federationSlug: text('federation_slug')
      .notNull()
      .references(() => federations.slug, { onDelete: 'cascade' }),
    tenantSlug: text('tenant_slug')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    tier: text('tier').notNull().default('full'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.federationSlug, t.tenantSlug] }),
    index('federation_tenants_lookup_idx').on(t.federationSlug, t.tier),
    check('federation_tenants_tier_chk', sql`${t.tier} IN ('full','listed')`),
  ],
);

export type FederationTenant = typeof federationTenants.$inferSelect;
export type FederationTenantInsert = typeof federationTenants.$inferInsert;
