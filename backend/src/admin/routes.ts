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
   * GET /api/v1/admin/diag — диагностика env + FFSPB connectivity.
   */
  app.get('/diag', async () => {
    const diag: Record<string, unknown> = {
      env: {
        NODE_ENV: process.env.NODE_ENV,
        START_CRONS: process.env.START_CRONS,
        ffspbConfigured: isFfspbConfigured(),
        ffspbKeyLength: (process.env.FFSPB_API_KEY ?? '').length,
        ffspbEndpoint: process.env.FFSPB_ENDPOINT ?? 'default',
      },
      ffspbProbe: null as unknown,
    };
    const probes: Array<{ name: string; url: string; useAuth: boolean }> = [
      { name: 'standings-iri',  url: 'https://stat.ffspb.org/api/standings?tournament=%2Fapi%2Ftournaments%2F44333&itemsPerPage=5', useAuth: true },
      { name: 'standings-id',   url: 'https://stat.ffspb.org/api/standings?tournament_id=44333&itemsPerPage=5', useAuth: true },
      { name: 'standings-dotid', url: 'https://stat.ffspb.org/api/standings?tournament.id=44333&itemsPerPage=5', useAuth: true },
      { name: 'html-tournament', url: 'https://stat.ffspb.org/tournament44333', useAuth: false },
    ];
    const results: unknown[] = [];
    for (const p of probes) {
      try {
        const t0 = Date.now();
        const headers: Record<string, string> = { Accept: '*/*' };
        if (p.useAuth) {
          headers['X-AUTH-TOKEN'] = process.env.FFSPB_API_KEY ?? '';
          headers.Accept = 'application/ld+json';
        }
        const res = await fetch(p.url, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        const text = await res.text();
        results.push({
          name: p.name,
          status: res.status,
          ok: res.ok,
          tookMs: Date.now() - t0,
          bodyLen: text.length,
          bodyPrefix: text.slice(0, 120),
        });
      } catch (e) {
        results.push({ name: p.name, error: e instanceof Error ? e.message : String(e) });
      }
    }
    diag.ffspbProbe = results;
    return diag;
  });

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
   *
   * Query params:
   *   ?age=2010       — sync только этот age (быстрый, ~5-15с)
   *   ?wait=1         — дождаться полного завершения (по умолчанию fire-and-forget)
   *
   * Без age и без wait — запускает sync для всех возрастов в фоне,
   * возвращает 202 моментально. Прогресс смотри в Render logs или PG.
   */
  app.post<{ Params: { slug: string }; Querystring: { age?: string; wait?: string } }>(
    '/sync/:slug',
    async (req, reply) => {
      const { slug } = req.params;
      const ageFilter = req.query.age;
      const wait = req.query.wait === '1' || req.query.wait === 'true';

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
      let tournaments = Object.entries(cfg.tournaments ?? {});
      if (ageFilter) tournaments = tournaments.filter(([age]) => age === ageFilter);

      const job = async () => {
        // Calendar первым (быстрый endpoint /api/matches), standings — после
        // (часто медленный /api/standings, бывает timeout).
        const results = { calendar: [] as unknown[], standings: [] as unknown[] };
        for (const [ageGroup, tids] of tournaments) {
          if (tids.leagueId) {
            results.calendar.push(
              await syncTenantCalendarTournament({
                tenantSlug: slug, ageGroup, season,
                tournamentId: tids.leagueId, tournament: 'league', ourMatcher,
              }),
            );
          }
          if (tids.cupId) {
            results.calendar.push(
              await syncTenantCalendarTournament({
                tenantSlug: slug, ageGroup, season,
                tournamentId: tids.cupId, tournament: 'cup', ourMatcher,
              }),
            );
          }
          if (tids.leagueId) {
            results.standings.push(
              await syncTenantStandings({
                tenantSlug: slug, ageGroup, tournamentId: tids.leagueId, season, ourMatcher,
              }),
            );
          }
        }
        return results;
      };

      if (wait) {
        const results = await job();
        return { tenant: slug, ...results };
      }

      // Fire-and-forget — отвечаем сразу, sync продолжается в фоне.
      void job().catch((err) => {
        // лог уже пишут сами сервисы; здесь — последний рубеж
        // eslint-disable-next-line no-console
        console.error('[admin/sync] background job failed:', err);
      });
      reply.code(202);
      return {
        tenant: slug,
        started: true,
        ageFilter: ageFilter ?? null,
        tournaments: tournaments.length,
        note: 'sync runs in background. Check Render logs or PG for progress.',
      };
    },
  );
}
