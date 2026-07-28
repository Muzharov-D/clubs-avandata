import { pgTable, text, timestamp, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { federations } from './federations.js';

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
    // Привязка federation_admin к его федерации (region-scoped доступ). NULL для
    // всех остальных ролей. FK ставится в drizzle/0012_federation_admin_role.sql.
    federationSlug: text('federation_slug').references(() => federations.slug, { onDelete: 'set null' }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    invitedBy: text('invited_by'),
    inviteTokenHash: text('invite_token_hash'),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    /**
     * Личная ссылка входа игрока (миграция 0022) — вход без пароля. В отличие от
     * invite-токена она постоянная: ребёнок сохраняет её и открывает когда угодно.
     * Храним только sha256; выдача новой ссылки гасит прежнюю.
     */
    linkTokenHash: text('link_token_hash'),
    linkIssuedAt: timestamp('link_issued_at', { withTimezone: true }),
    lastLogin: timestamp('last_login', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('users_tenant_email_uq').on(t.tenantId, t.email),
    unique('users_tenant_username_uq').on(t.tenantId, t.username),
    check(
      'users_role_chk',
      sql`${t.role} IN ('platform_admin','head_coach','team_coach','player','federation_admin','sporting_director')`,
    ),
    // Роли без клуба (platform_admin, federation_admin) обязаны иметь tenant_id
    // NULL; клубные роли — наоборот. federation_admin scoped в федерацию, не в клуб.
    check(
      'users_platform_admin_no_tenant',
      sql`(${t.role} IN ('platform_admin','federation_admin')) = (${t.tenantId} IS NULL)`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type UserRole = 'platform_admin' | 'head_coach' | 'team_coach' | 'player' | 'federation_admin' | 'sporting_director';
