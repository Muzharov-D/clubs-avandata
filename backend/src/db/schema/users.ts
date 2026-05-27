import { pgTable, text, timestamp, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').references(() => tenants.slug, { onDelete: 'cascade' }),
    email: text('email'),
    username: text('username'),
    passwordHash: text('password_hash'),
    fullName: text('full_name'),
    role: text('role').notNull(),
    teamId: text('team_id'),
    playerId: text('player_id'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    invitedBy: text('invited_by'),
    lastLogin: timestamp('last_login', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('users_tenant_email_uq').on(t.tenantId, t.email),
    unique('users_tenant_username_uq').on(t.tenantId, t.username),
    check(
      'users_role_chk',
      sql`${t.role} IN ('platform_admin','head_coach','team_coach','player')`,
    ),
    check(
      'users_platform_admin_no_tenant',
      sql`(${t.role} = 'platform_admin') = (${t.tenantId} IS NULL)`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type UserRole = 'platform_admin' | 'head_coach' | 'team_coach' | 'player';
