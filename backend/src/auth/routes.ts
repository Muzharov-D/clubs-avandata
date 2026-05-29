import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { refreshTokens } from '../db/schema/refreshTokens.js';
import { tenants } from '../db/schema/tenants.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from './jwt.js';
import { BadRequestError, UnauthorizedError } from '../shared/errors.js';
import { authenticate } from './middleware.js';
import { withBypassRLS } from '../db/tenantContext.js';

const REFRESH_COOKIE = 'rt';

const loginSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1).optional(),
}).refine((d) => d.email ?? d.username, {
  message: 'email or username required',
});

const setPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/auth/login
   * Tenant resolution: tenantSlug from body (UI sends after club-picker) OR
   * email is globally unique across platform_admin only.
   *
   * Phase 0: simple — caller MUST send tenantSlug for non-admin login,
   * or no slug for platform_admin.
   */
  app.post('/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);

    // Lookup стратегия:
    //   1. Если tenantSlug передан — ищем в этом tenant'е
    //   2. Если нет, по email/username — глобальный поиск
    //      (по emaiil наша схема позволяет дубль между tenant'ами;
    //       при множественном matche возвращаем ambiguous-ошибку)
    const targetTenant = body.tenantSlug ?? null;

    const candidates = await withBypassRLS((tx) => {
      const identityCond = body.email
        ? eq(users.email, body.email)
        : eq(users.username, body.username!);
      if (targetTenant === null) {
        return tx.select().from(users).where(identityCond).limit(5);
      }
      return tx
        .select()
        .from(users)
        .where(and(eq(users.tenantId, targetTenant), identityCond))
        .limit(1);
    });

    if (candidates.length === 0) {
      throw new UnauthorizedError('invalid credentials');
    }
    if (targetTenant === null && candidates.length > 1) {
      // Несколько совпадений — UI должен задать tenantSlug.
      throw new UnauthorizedError('ambiguous: укажите клуб (tenantSlug)');
    }
    const user = candidates[0];
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) throw new UnauthorizedError('invalid credentials');

    const accessToken = signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as 'platform_admin' | 'head_coach' | 'team_coach' | 'player',
      teamId: user.teamId,
      playerId: user.playerId,
    });

    const { token: refreshToken, tokenHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip,
    });

    reply.setCookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'strict',
      domain: env.COOKIE_DOMAIN,
      path: '/api/v1/auth',
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400,
    });

    // Загружаем tenant info — фронт нуждается в displayName/brand для UI.
    let tenant: { slug: string; name: string; displayName: string; brand: unknown } | null = null;
    if (user.tenantId) {
      const tenantRows = await withBypassRLS((tx) =>
        tx.select({
          slug: tenants.slug,
          name: tenants.name,
          displayName: tenants.displayName,
          brand: tenants.brand,
        }).from(tenants).where(eq(tenants.slug, user.tenantId!)).limit(1),
      );
      tenant = tenantRows[0] ?? null;
    }

    return {
      accessToken,
      tenant,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        teamId: user.teamId,
        playerId: user.playerId,
      },
    };
  });

  /**
   * POST /api/v1/auth/set-password — установка пароля по invite-токену.
   * Закрывает приглашение: находит юзера по sha256(token), проверяет срок,
   * ставит пароль, гасит токен (одноразовый). Пароль НИКОГДА не передаётся
   * сервером — только пользователь знает его.
   */
  app.post('/set-password', async (req) => {
    const { token, password } = setPasswordSchema.parse(req.body);
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const rows = await withBypassRLS((tx) =>
      tx.select().from(users).where(eq(users.inviteTokenHash, tokenHash)).limit(1),
    );
    const user = rows[0];
    if (!user || !user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
      throw new BadRequestError('invite link invalid or expired', 'INVITE_INVALID');
    }

    const passwordHash = await argon2.hash(password);
    await withBypassRLS((tx) =>
      tx.update(users)
        .set({ passwordHash, inviteTokenHash: null, inviteExpiresAt: null })
        .where(eq(users.id, user.id)),
    );
    return { ok: true, email: user.email, tenantSlug: user.tenantId };
  });

  /**
   * POST /api/v1/auth/refresh — rotate refresh, issue new access.
   */
  app.post('/refresh', async (req, reply) => {
    const rt = req.cookies[REFRESH_COOKIE];
    if (!rt) throw new UnauthorizedError('no refresh cookie');

    const tokenHash = hashRefreshToken(rt);
    const stored = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    const row = stored[0];
    if (!row) throw new UnauthorizedError('refresh not found');
    if (row.revokedAt) {
      // Reuse detection — revoke all tokens of that user
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
      throw new UnauthorizedError('refresh token reuse detected');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedError('refresh expired');

    const userRows = await withBypassRLS((tx) =>
      tx.select().from(users).where(eq(users.id, row.userId)).limit(1),
    );
    const user = userRows[0];
    if (!user) throw new UnauthorizedError('user not found');

    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));

    const { token: newToken, tokenHash: newHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newHash,
      expiresAt,
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip,
    });

    const accessToken = signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as 'platform_admin' | 'head_coach' | 'team_coach' | 'player',
      teamId: user.teamId,
      playerId: user.playerId,
    });

    reply.setCookie(REFRESH_COOKIE, newToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'strict',
      domain: env.COOKIE_DOMAIN,
      path: '/api/v1/auth',
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400,
    });

    return { accessToken };
  });

  /**
   * POST /api/v1/auth/logout — revoke current refresh.
   */
  app.post('/logout', async (req, reply) => {
    const rt = req.cookies[REFRESH_COOKIE];
    if (rt) {
      const tokenHash = hashRefreshToken(rt);
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash));
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  });

  /**
   * GET /api/v1/auth/me — полный профиль текущего пользователя (с email/fullName).
   */
  app.get('/me', { onRequest: [authenticate] }, async (req) => {
    if (!req.user) throw new BadRequestError('no user');
    const userRows = await withBypassRLS((tx) =>
      tx.select().from(users).where(eq(users.id, req.user!.sub)).limit(1),
    );
    const u = userRows[0];
    if (!u) throw new UnauthorizedError('user not found');

    let tenant: { slug: string; name: string; displayName: string; brand: unknown } | null = null;
    if (u.tenantId) {
      const tRows = await withBypassRLS((tx) =>
        tx.select({
          slug: tenants.slug,
          name: tenants.name,
          displayName: tenants.displayName,
          brand: tenants.brand,
        }).from(tenants).where(eq(tenants.slug, u.tenantId!)).limit(1),
      );
      tenant = tRows[0] ?? null;
    }

    return {
      tenant,
      user: {
        id: u.id,
        tenantId: u.tenantId,
        email: u.email,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        teamId: u.teamId,
        playerId: u.playerId,
      },
    };
  });
}
