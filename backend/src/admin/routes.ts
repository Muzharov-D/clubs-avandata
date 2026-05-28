import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { tenants } from '../db/schema/tenants.js';
import { users } from '../db/schema/users.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { BadRequestError } from '../shared/errors.js';
import { syncTenantStandings } from '../services/standingsService.js';
import { syncTenantCalendarTournament } from '../services/calendarService.js';
import { isFfspbConfigured } from '../services/ffspbApi.js';

const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric and dashes');

const createTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120),
  displayName: z.string().min(1).max(60),
  dataProvider: z.enum(['ffspb', 'yfl', 'manual']).default('manual'),
  providerConfig: z.record(z.string(), z.unknown()).default({}),
  brand: z
    .object({
      logoUrl: z.string().url().optional(),
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      titleSuffix: z.string().optional(),
    })
    .default({}),
  headCoach: z.object({
    email: z.string().email(),
    fullName: z.string().min(1),
  }),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', authorize('platform_admin'));

  /**
   * GET /api/v1/admin/tenants — список всех клубов.
   */
  app.get('/tenants', async () => {
    const rows = await withBypassRLS((tx) =>
      tx.select().from(tenants).orderBy(tenants.slug),
    );
    return { tenants: rows };
  });

  /**
   * POST /api/v1/admin/tenants — создать клуб + head_coach.
   * Возвращает invite info (пока без email — Phase 1).
   */
  app.post('/tenants', async (req) => {
    const body = createTenantSchema.parse(req.body);

    return await withBypassRLS(async (tx) => {
      const existing = await tx
        .select({ slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.slug, body.slug))
        .limit(1);
      if (existing.length > 0) throw new BadRequestError('slug already exists', 'SLUG_EXISTS');

      await tx.insert(tenants).values({
        slug: body.slug,
        name: body.name,
        displayName: body.displayName,
        dataProvider: body.dataProvider,
        providerConfig: body.providerConfig,
        brand: body.brand,
      });

      const tempPassword = randomBytes(16).toString('base64url');
      const passwordHash = await argon2.hash(tempPassword);
      const userId = `u-${body.slug}-hc-${randomBytes(4).toString('hex')}`;

      await tx.insert(users).values({
        id: userId,
        tenantId: body.slug,
        email: body.headCoach.email,
        passwordHash,
        fullName: body.headCoach.fullName,
        role: 'head_coach',
      });

      return {
        tenant: { slug: body.slug, name: body.name },
        headCoach: {
          email: body.headCoach.email,
          tempPassword, // TODO: Phase 1 — отправить через Resend, не возвращать
        },
      };
    });
  });

  /**
   * PATCH /api/v1/admin/tenants/:slug — обновить status/brand/features/provider.
   */
  const patchSchema = z.object({
    status: z.enum(['active', 'suspended', 'archived']).optional(),
    brand: z.record(z.string(), z.unknown()).optional(),
    features: z.record(z.string(), z.unknown()).optional(),
    plan: z.string().optional(),
    dataProvider: z.enum(['ffspb', 'yfl', 'manual']).optional(),
    providerConfig: z.record(z.string(), z.unknown()).optional(),
  });

  app.patch<{ Params: { slug: string } }>('/tenants/:slug', async (req) => {
    const updates = patchSchema.parse(req.body);
    await withBypassRLS(async (tx) => {
      await tx
        .update(tenants)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(tenants.slug, req.params.slug));
    });
    return { ok: true };
  });

  /**
   * POST /api/v1/admin/sync/:slug — manual trigger всех ffspb-syncs для тенанта.
   * Для (а) первого прогона данных и (б) дебага без ожидания cron tick.
   */
  app.post<{ Params: { slug: string } }>('/sync/:slug', async (req) => {
    const { slug } = req.params;
    if (!isFfspbConfigured()) {
      throw new BadRequestError('FFSPB_API_KEY not configured on server', 'FFSPB_NOT_CONFIGURED');
    }
    const rows = await withBypassRLS((tx) =>
      tx.select().from(tenants).where(eq(tenants.slug, slug)).limit(1),
    );
    const tenant = rows[0];
    if (!tenant) throw new BadRequestError('tenant not found', 'TENANT_NOT_FOUND');
    if (tenant.dataProvider !== 'ffspb') {
      throw new BadRequestError(`tenant has dataProvider='${tenant.dataProvider}'`, 'WRONG_PROVIDER');
    }

    const cfg = (tenant.providerConfig ?? {}) as {
      ourMatcher?: string;
      season?: string;
      tournaments?: Record<string, { leagueId?: string | number | null; cupId?: string | number | null }>;
    };
    const ourMatcher = cfg.ourMatcher ?? tenant.displayName;
    const season = cfg.season ?? new Date().getFullYear().toString();
    const tournaments = Object.entries(cfg.tournaments ?? {});

    const standingsResults = [];
    const calendarResults = [];

    for (const [ageGroup, tids] of tournaments) {
      if (tids.leagueId) {
        standingsResults.push(
          await syncTenantStandings({
            tenantSlug: slug, ageGroup, tournamentId: tids.leagueId, season, ourMatcher,
          }),
        );
        calendarResults.push(
          await syncTenantCalendarTournament({
            tenantSlug: slug, ageGroup, season,
            tournamentId: tids.leagueId, tournament: 'league', ourMatcher,
          }),
        );
      }
      if (tids.cupId) {
        calendarResults.push(
          await syncTenantCalendarTournament({
            tenantSlug: slug, ageGroup, season,
            tournamentId: tids.cupId, tournament: 'cup', ourMatcher,
          }),
        );
      }
    }

    return {
      tenant: slug,
      standings: standingsResults,
      calendar: calendarResults,
    };
  });
}
