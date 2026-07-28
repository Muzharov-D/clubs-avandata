import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { users, type UserRole } from '../db/schema/users.js';
import { refreshTokens } from '../db/schema/refreshTokens.js';
import { tenants } from '../db/schema/tenants.js';
import { federations } from '../db/schema/federations.js';
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

/** Вход игрока по личной ссылке: единственный аргумент — сам токен. */
const linkLoginSchema = z.object({
  token: z.string().min(20),
});

type SessionUser = {
  id: string; email: string | null; fullName: string | null; role: string;
  tenantId: string | null; teamId: string | null; playerId: string | null;
  federationSlug: string | null;
};

/**
 * Выдать сессию пользователю: access-JWT в ответ, refresh — в HttpOnly-cookie,
 * плюс контекст клуба/федерации, который нужен фронту.
 *
 * ЕДИНЫЙ ИСТОЧНИК для обычного входа по паролю и входа игрока по личной ссылке:
 * иначе у двух дверей незаметно разъезжаются срок жизни токена, права в JWT и
 * набор полей в ответе.
 */
async function issueSession(
  user: SessionUser,
  req: { headers: Record<string, unknown>; ip: string },
  reply: { setCookie: (n: string, v: string, o: Record<string, unknown>) => void },
) {
  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
    teamId: user.teamId,
    playerId: user.playerId,
    federationId: user.federationSlug,
  });

  const { token: refreshToken, tokenHash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    ip: req.ip,
  });

  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    // domain НЕ задаём: cookie host-only привязывается к хосту, который видит
    // браузер (clubs-avandata.vercel.app через Vercel-rewrite). Явный domain с
    // Render-дефолтом 'localhost' браузер отвергал → refresh не работал → разлогин
    // на каждой перезагрузке. Host-only корректен и для прода, и для localhost.
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400,
  });

  let tenant: { slug: string; name: string; displayName: string; brand: unknown; plan: string } | null = null;
  if (user.tenantId) {
    const rows = await withBypassRLS((tx) =>
      tx.select({
        slug: tenants.slug,
        name: tenants.name,
        displayName: tenants.displayName,
        brand: tenants.brand,
        plan: tenants.plan,
      }).from(tenants).where(eq(tenants.slug, user.tenantId!)).limit(1),
    );
    tenant = rows[0] ?? null;
  }

  let federation: { slug: string; name: string; region: string; brand: unknown } | null = null;
  if (user.role === 'federation_admin' && user.federationSlug) {
    const rows = await withBypassRLS((tx) =>
      tx.select({
        slug: federations.slug,
        name: federations.name,
        region: federations.region,
        brand: federations.brand,
      }).from(federations).where(eq(federations.slug, user.federationSlug!)).limit(1),
    );
    federation = rows[0] ?? null;
  }

  await withBypassRLS((tx) =>
    tx.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id)),
  );

  return {
    accessToken,
    tenant,
    federation,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      federationId: user.federationSlug,
      teamId: user.teamId,
      playerId: user.playerId,
    },
  };
}

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

    return issueSession(user, req, reply);
  });

  /**
   * POST /api/v1/auth/link-login — вход игрока по личной ссылке, без пароля.
   *
   * Решение владельца: ребёнок не придумывает и не помнит пароль. Тренер даёт
   * постоянную личную ссылку — она и есть ключ. Ссылка выдаётся только роли
   * `player`: тренерский и админский вход остаются под паролем, потеря ссылки
   * тренера открыла бы весь клуб.
   *
   * Токен ищем по sha256 — в базе лежит только хэш.
   */
  app.post('/link-login', async (req, reply) => {
    // safeParse, а не parse: ZodError глобальный обработчик превращает в 500
    // «Internal server error». Ребёнку с обломанной ссылкой такое показывать
    // нельзя — да и ответ на кривой токен должен совпадать с ответом на чужой.
    const parsed = linkLoginSchema.safeParse(req.body);
    if (!parsed.success) throw new UnauthorizedError('ссылка недействительна');
    const { token } = parsed.data;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const rows = await withBypassRLS((tx) =>
      tx.select().from(users).where(eq(users.linkTokenHash, tokenHash)).limit(1),
    );
    const user = rows[0];
    // Сообщение одинаковое для «нет такой ссылки» и «ссылка не игрока»:
    // по разнице ответов чужую ссылку можно было бы прощупывать.
    if (!user || user.role !== 'player') {
      throw new UnauthorizedError('ссылка недействительна');
    }

    return issueSession(user, req, reply);
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
    // username возвращаем вместе с email: игрока приглашает тренер ссылкой, без
    // почты — и после установки пароля он должен узнать, чем входить.
    return { ok: true, email: user.email, username: user.username, tenantSlug: user.tenantId };
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
      role: user.role as UserRole,
      teamId: user.teamId,
      playerId: user.playerId,
      federationId: user.federationSlug,
    });

    reply.setCookie(REFRESH_COOKIE, newToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'strict',
      // domain НЕ задаём: cookie host-only привязывается к хосту, который видит
      // браузер (clubs-avandata.vercel.app через Vercel-rewrite). Явный domain с
      // Render-дефолтом 'localhost' браузер отвергал → refresh не работал → разлогин
      // на каждой перезагрузке. Host-only корректен и для прода, и для localhost.
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

    // Сессия «просмотр клуба» (platform_admin → view-as-tenant): контекст берём
    // из токена, а не из БД-записи админа (иначе фронт «откатится» в админку).
    if (req.user.imp) {
      let tenant: { slug: string; name: string; displayName: string; brand: unknown; plan: string } | null = null;
      if (req.user.tenantId) {
        const tRows = await withBypassRLS((tx) =>
          tx.select({
            slug: tenants.slug, name: tenants.name,
            displayName: tenants.displayName, brand: tenants.brand,
            plan: tenants.plan,
          }).from(tenants).where(eq(tenants.slug, req.user!.tenantId!)).limit(1),
        );
        tenant = tRows[0] ?? null;
      }
      return {
        tenant,
        user: {
          id: req.user.sub,
          tenantId: req.user.tenantId,
          email: null,
          username: null,
          fullName: tenant ? `Просмотр: ${tenant.displayName}` : 'Просмотр клуба',
          role: req.user.role,
          teamId: req.user.teamId,
          playerId: req.user.playerId,
          impersonating: true,
        },
      };
    }

    const userRows = await withBypassRLS((tx) =>
      tx.select().from(users).where(eq(users.id, req.user!.sub)).limit(1),
    );
    const u = userRows[0];
    if (!u) throw new UnauthorizedError('user not found');

    let tenant: { slug: string; name: string; displayName: string; brand: unknown; plan: string } | null = null;
    if (u.tenantId) {
      const tRows = await withBypassRLS((tx) =>
        tx.select({
          slug: tenants.slug,
          name: tenants.name,
          displayName: tenants.displayName,
          brand: tenants.brand,
          plan: tenants.plan,
        }).from(tenants).where(eq(tenants.slug, u.tenantId!)).limit(1),
      );
      tenant = tRows[0] ?? null;
    }

    // Контекст федерации для federation_admin (read-only region-scoped).
    let federation: { slug: string; name: string; region: string; brand: unknown } | null = null;
    if (u.role === 'federation_admin' && u.federationSlug) {
      const fRows = await withBypassRLS((tx) =>
        tx.select({
          slug: federations.slug,
          name: federations.name,
          region: federations.region,
          brand: federations.brand,
        }).from(federations).where(eq(federations.slug, u.federationSlug!)).limit(1),
      );
      federation = fRows[0] ?? null;
    }

    return {
      tenant,
      federation,
      user: {
        id: u.id,
        tenantId: u.tenantId,
        federationId: u.federationSlug,
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
