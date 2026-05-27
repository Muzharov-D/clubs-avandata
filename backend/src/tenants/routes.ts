import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { NotFoundError } from '../shared/errors.js';

/**
 * Public tenant routes — для resolve бренда после login, для public-родительского
 * экрана (path-based) и для club-picker если будет в будущем.
 */
export async function tenantRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/tenant/:slug — публичная инфа клуба (имя, бренд, статус).
   */
  app.get<{ Params: { slug: string } }>('/:slug', async (req) => {
    const rows = await db
      .select({
        slug: tenants.slug,
        name: tenants.name,
        displayName: tenants.displayName,
        status: tenants.status,
        brand: tenants.brand,
      })
      .from(tenants)
      .where(eq(tenants.slug, req.params.slug))
      .limit(1);

    const t = rows[0];
    if (!t || t.status !== 'active') throw new NotFoundError('tenant not found');
    return t;
  });
}
