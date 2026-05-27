import { pgTable, text, jsonb, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tenants = pgTable(
  'tenants',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    brand: jsonb('brand').notNull().default(sql`'{}'::jsonb`),
    dataProvider: text('data_provider').notNull().default('manual'),
    providerConfig: jsonb('provider_config').notNull().default(sql`'{}'::jsonb`),
    features: jsonb('features').notNull().default(sql`'{}'::jsonb`),
    plan: text('plan').notNull().default('free'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check('tenants_status_chk', sql`${t.status} IN ('active','suspended','archived')`),
    check('tenants_provider_chk', sql`${t.dataProvider} IN ('ffspb','yfl','manual')`),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type TenantInsert = typeof tenants.$inferInsert;
