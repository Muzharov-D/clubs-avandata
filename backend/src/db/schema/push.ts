import { pgTable, bigserial, text, jsonb, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { users } from './users.js';
import { teams } from './teams.js';

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    teamId: text('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    role: text('role'),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    prefs: jsonb('prefs').notNull().default(sql`'{}'::jsonb`),
    teamIds: jsonb('team_ids').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('push_subs_user_idx').on(t.userId),
    index('push_subs_team_idx').on(t.teamId),
  ],
);

export const notifLog = pgTable(
  'notif_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    scopeId: text('scope_id').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [unique('notif_log_uq').on(t.tenantId, t.scope, t.scopeId)],
);

export const notifDeferred = pgTable(
  'notif_deferred',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    scopeId: text('scope_id').notNull(),
    teamId: text('team_id'),
    payload: jsonb('payload').notNull(),
    deliverAt: timestamp('deliver_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('notif_deferred_uq').on(t.tenantId, t.scope, t.scopeId),
    index('notif_deferred_deliver_idx').on(t.deliverAt),
  ],
);

export const notifRecipientLog = pgTable(
  'notif_recipient_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    scope: text('scope').notNull(),
    scopeId: text('scope_id').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('notif_recipient_idx').on(t.tenantId, t.endpoint, t.sentAt)],
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type PushSubscriptionInsert = typeof pushSubscriptions.$inferInsert;
export type NotifLog = typeof notifLog.$inferSelect;
export type NotifDeferred = typeof notifDeferred.$inferSelect;
export type NotifRecipientLog = typeof notifRecipientLog.$inferSelect;
