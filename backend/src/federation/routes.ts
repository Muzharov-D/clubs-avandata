import type { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../auth/middleware.js';
import { withFederation } from '../db/tenantContext.js';
import { BadRequestError } from '../shared/errors.js';
import { federationOverview, federationClubs, federationCompetitions } from './aggregations.js';

/**
 * Роуты кабинета федерации — read-only, region-scoped (Эпик 1+).
 *
 * Все запросы идут через withFederation(req.user.federationId): ставит
 * app.bypass_rls='on' + app.federation_id, а изоляция держится на
 * FED_MEMBERSHIP_SQL внутри агрегатов. authorize('federation_admin') гейтит роль;
 * write-путей у федерации нет (только GET).
 */
export async function federationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', authorize('federation_admin'));

  /** GET /api/v1/federation/overview — сводка по региону (FR4, FR5). */
  app.get('/overview', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, (_tx, conn) => federationOverview(conn));
  });

  /** GET /api/v1/federation/clubs — реестр клубов-членов (FR7). */
  app.get('/clubs', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, async (_tx, conn) => ({
      clubs: await federationClubs(conn),
    }));
  });

  /** GET /api/v1/federation/competitions — сводные таблицы по возрастам (FR11). */
  app.get('/competitions', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, async (_tx, conn) => ({
      competitions: await federationCompetitions(conn),
    }));
  });
}
