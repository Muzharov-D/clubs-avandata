import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { tenants } from '../db/schema/tenants.js';
import { users } from '../db/schema/users.js';
import { teams } from '../db/schema/teams.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { signAccessToken } from '../auth/jwt.js';
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

// Возраст команды: «2010», «U16», «2012-2» и т.п. Часть team.id, поэтому ограничен
// безопасным алфавитом. Хранится как ageGroup; в id уходит в lower-case.
const ageSchema = z
  .string()
  .min(1)
  .max(12)
  .regex(/^[a-zA-Z0-9-]+$/, 'age must be alphanumeric and dashes');

const createTeamSchema = z.object({
  age: ageSchema,
  name: z.string().min(1).max(120).optional(),
  ageLabel: z.string().min(1).max(40).optional(),
});

const patchTeamSchema = z
  .object({
    active: z.boolean().optional(),
    name: z.string().min(1).max(120).optional(),
    ageLabel: z.string().min(1).max(40).optional(),
  })
  .refine((d) => d.active !== undefined || d.name !== undefined || d.ageLabel !== undefined, {
    message: 'at least one of active | name | ageLabel is required',
  });

/** team.id = `{slug}-{age}` (lower-case) — конвенция из CLAUDE.md (legirus-2010). */
function teamIdFor(slug: string, age: string): string {
  return `${slug}-${age.toLowerCase()}`;
}

/** Имя по умолчанию: «{displayName} {age}» (например «Зенит 2010»). */
function defaultTeamName(displayName: string, age: string): string {
  return `${displayName} ${age}`;
}

/** year-колонка заполняется только для «годовых» возрастов (4 цифры). */
function ageToYear(age: string): number | null {
  return /^\d{4}$/.test(age) ? parseInt(age, 10) : null;
}

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
    const probes: Array<{ name: string; url: string; useAuth: boolean; timeoutMs?: number }> = [
      { name: 'matches', url: 'https://stat.ffspb.org/api/matches?tournament_id=44333&itemsPerPage=5', useAuth: true, timeoutMs: 10_000 },
      { name: 'standings-30s', url: 'https://stat.ffspb.org/api/standings?tournament=%2Fapi%2Ftournaments%2F44333&itemsPerPage=5', useAuth: true, timeoutMs: 30_000 },
      { name: 'standings-60s', url: 'https://stat.ffspb.org/api/standings?tournament=%2Fapi%2Ftournaments%2F44333&itemsPerPage=5', useAuth: true, timeoutMs: 60_000 },
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
          signal: AbortSignal.timeout(p.timeoutMs ?? 15_000),
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

      // Безопасный invite: НЕ возвращаем пароль в ответе (он оседал бы в логах
      // прокси / истории браузера). Генерим одноразовый токен, храним только его
      // sha256, отдаём ссылку на установку пароля. passwordHash = null → логин
      // невозможен, пока тренер не задаст пароль по ссылке.
      const inviteToken = randomBytes(32).toString('base64url');
      const inviteTokenHash = createHash('sha256').update(inviteToken).digest('hex');
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 дней
      const userId = `u-${body.slug}-hc-${randomBytes(4).toString('hex')}`;

      await tx.insert(users).values({
        id: userId,
        tenantId: body.slug,
        email: body.headCoach.email,
        passwordHash: null,
        fullName: body.headCoach.fullName,
        role: 'head_coach',
        inviteTokenHash,
        inviteExpiresAt,
      });

      const setupUrl = `https://clubs.avandata.ru/set-password?token=${inviteToken}`;
      return {
        tenant: { slug: body.slug, name: body.name },
        headCoach: { email: body.headCoach.email },
        invite: { setupUrl, expiresAt: inviteExpiresAt },
      };
    });
  });

  /**
   * POST /api/v1/admin/tenants/:slug/enter — «войти в клуб» (view-as-tenant).
   *
   * platform_admin получает короткоживущий tenant-scoped токен на этот клуб
   * (role=head_coach, без пароля клубного юзера). sub остаётся id админа, плюс
   * claim imp=adminId — для аудита и чтобы /auth/me отдавал именно контекст
   * просмотра, а не реального админа. Refresh-cookie админа НЕ трогаем — выход
   * из просмотра делается через /auth/refresh (вернёт обычный админский токен).
   */
  app.post<{ Params: { slug: string } }>('/tenants/:slug/enter', async (req) => {
    const slug = req.params.slug;
    const rows = await withBypassRLS((tx) =>
      tx.select().from(tenants).where(eq(tenants.slug, slug)).limit(1),
    );
    const tenant = rows[0];
    if (!tenant) throw new BadRequestError('tenant not found', 'TENANT_NOT_FOUND');

    // Дефолтный контекст кабинета — первая активная команда клуба.
    const teamRows = await withBypassRLS((tx) =>
      tx.select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.tenantId, slug), eq(teams.active, true)))
        .orderBy(teams.ageGroup)
        .limit(1),
    );
    const teamId = teamRows[0]?.id ?? null;

    const adminId = req.user!.sub;
    const accessToken = signAccessToken({
      sub: adminId,
      tenantId: slug,
      role: 'head_coach',
      teamId,
      playerId: null,
      imp: adminId,
    });
    return {
      accessToken,
      tenant: { slug: tenant.slug, name: tenant.name, displayName: tenant.displayName, brand: tenant.brand },
      user: {
        id: adminId, tenantId: slug, role: 'head_coach',
        teamId, playerId: null,
        fullName: `Просмотр: ${tenant.displayName}`, impersonating: true,
      },
    };
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

  /**
   * GET /api/v1/admin/tenants/:slug/teams — ВСЕ команды клуба (вкл. скрытые)
   * с числом загруженных матчей на команду. Клиентский /data/teams отдаёт только
   * active=TRUE — здесь админ видит полную картину для управления видимостью.
   */
  app.get<{ Params: { slug: string } }>('/tenants/:slug/teams', async (req) => {
    const { slug } = req.params;
    return await withBypassRLS(async (tx, conn) => {
      const tenantRows = await tx
        .select({ slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      if (tenantRows.length === 0) throw new BadRequestError('tenant not found', 'TENANT_NOT_FOUND');

      const { rows } = await conn.query(
        `SELECT t.id, t.name, t.age_group AS "ageGroup", t.age_label AS "ageLabel",
                t.year, t.is_our_team AS "isOurTeam", t.active,
                COUNT(m.id)::int AS "matchCount"
           FROM teams t
           LEFT JOIN matches m ON m.team_id = t.id AND m.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1
          GROUP BY t.id
          ORDER BY t.age_group`,
        [slug],
      );
      return { teams: rows };
    });
  });

  /**
   * POST /api/v1/admin/tenants/:slug/provision-teams — создать по команде на
   * каждый возраст из providerConfig.tournaments. Скрытые (active=false) по
   * умолчанию: незакупленные/без данных возрасты не маячат у клуба. Идемпотентно
   * (ON CONFLICT DO NOTHING) — повтор не трогает уже открытые команды.
   */
  app.post<{ Params: { slug: string } }>('/tenants/:slug/provision-teams', async (req) => {
    const { slug } = req.params;
    return await withBypassRLS(async (tx) => {
      const tenantRows = await tx
        .select({ displayName: tenants.displayName, providerConfig: tenants.providerConfig })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      const tenant = tenantRows[0];
      if (!tenant) throw new BadRequestError('tenant not found', 'TENANT_NOT_FOUND');

      const cfg = (tenant.providerConfig ?? {}) as { tournaments?: Record<string, unknown> };
      const allKeys = Object.keys(cfg.tournaments ?? {});
      if (allKeys.length === 0) {
        throw new BadRequestError(
          'providerConfig.tournaments is empty — nothing to provision',
          'NO_TOURNAMENTS',
        );
      }
      // tournaments хранится в JSONB как z.unknown() — ключи возрастов попадают в
      // team.id, поэтому фильтруем тем же ageSchema, что и ручное создание. Кривые
      // ключи (с `/`, `..`, пробелами) отбрасываем, не ломая весь провижн.
      const ages = allKeys.filter((age) => ageSchema.safeParse(age).success);
      const skipped = allKeys.filter((age) => !ageSchema.safeParse(age).success);

      const created: string[] = [];
      const existing: string[] = [];
      for (const age of ages) {
        const id = teamIdFor(slug, age);
        const inserted = await tx
          .insert(teams)
          .values({
            id,
            tenantId: slug,
            name: defaultTeamName(tenant.displayName, age),
            ageGroup: age,
            year: ageToYear(age),
            active: false,
          })
          .onConflictDoNothing({ target: teams.id })
          .returning({ id: teams.id });
        if (inserted.length > 0) created.push(id);
        else existing.push(id);
      }
      return { created, existing, skipped };
    });
  });

  /**
   * POST /api/v1/admin/tenants/:slug/teams — ручное создание команды (краевые
   * случаи без турнира в конфиге). Скрытая по умолчанию.
   */
  app.post<{ Params: { slug: string } }>('/tenants/:slug/teams', async (req) => {
    const { slug } = req.params;
    const body = createTeamSchema.parse(req.body);
    return await withBypassRLS(async (tx) => {
      const tenantRows = await tx
        .select({ displayName: tenants.displayName })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      const tenant = tenantRows[0];
      if (!tenant) throw new BadRequestError('tenant not found', 'TENANT_NOT_FOUND');

      const id = teamIdFor(slug, body.age);
      const inserted = await tx
        .insert(teams)
        .values({
          id,
          tenantId: slug,
          name: body.name?.trim() || defaultTeamName(tenant.displayName, body.age),
          ageGroup: body.age,
          ageLabel: body.ageLabel ?? null,
          year: ageToYear(body.age),
          active: false,
        })
        .onConflictDoNothing({ target: teams.id })
        .returning({ id: teams.id });
      if (inserted.length === 0) {
        throw new BadRequestError('team with this age already exists', 'TEAM_EXISTS');
      }
      return { team: { id, ageGroup: body.age } };
    });
  });

  /**
   * PATCH /api/v1/admin/tenants/:slug/teams/:teamId — открыть/закрыть (active),
   * переименовать (name) или сменить ярлык возраста (ageLabel).
   */
  app.patch<{ Params: { slug: string; teamId: string } }>(
    '/tenants/:slug/teams/:teamId',
    async (req) => {
      const { slug, teamId } = req.params;
      const updates = patchTeamSchema.parse(req.body);
      return await withBypassRLS(async (tx) => {
        const set: Partial<{ active: boolean; name: string; ageLabel: string }> = {};
        if (updates.active !== undefined) set.active = updates.active;
        if (updates.name !== undefined) set.name = updates.name.trim();
        if (updates.ageLabel !== undefined) set.ageLabel = updates.ageLabel;

        const updated = await tx
          .update(teams)
          .set(set)
          .where(and(eq(teams.tenantId, slug), eq(teams.id, teamId)))
          .returning({ id: teams.id, active: teams.active });
        if (updated.length === 0) throw new BadRequestError('team not found', 'TEAM_NOT_FOUND');
        return { ok: true, team: updated[0] };
      });
    },
  );
}
