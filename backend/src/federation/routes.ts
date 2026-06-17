import type { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../auth/middleware.js';
import { withFederation } from '../db/tenantContext.js';
import { BadRequestError } from '../shared/errors.js';
import { registryFor } from './registry.js';
import {
  isAvandataConfigured, listTournaments, compareTournaments, regionOverview, regionPlayers,
  regionStandings, regionClubRatings, playerProfile,
} from './avandataSource.js';
import {
  federationOverview,
  federationRegionMap,
  federationRegionProfile,
  federationClubs,
  federationCompetitions,
  federationDataQuality,
  federationAgeEffect,
  federationTalentPool,
  federationPlayerProfile,
  federationBestXI,
  federationProductivity,
  federationWinDevelop,
  federationScorers,
  federationBenchmark,
} from './aggregations.js';

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

  // ---- Прокси к «нашей» базе разборов (back.avandata.ru) — реальное Первенство СПб ----
  // Сезон 2026 (Первенство, 2 дивизиона). Данные читаются вживую, без записи в нашу БД.
  const AV_SEASON = 2;
  const avOff = (reply: import('fastify').FastifyReply): boolean => {
    if (isAvandataConfigured()) return false;
    reply.code(503);
    return true;
  };

  /** GET /federation/av/tournaments — каталог турниров×дивизионов Первенства. */
  app.get('/av/tournaments', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, tournaments: await listTournaments(season) };
  });

  /** GET /federation/av/overview — обзор региона из реальной базы (сумма по турнирам). */
  app.get('/av/overview', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return await regionOverview(season);
  });

  /** GET /federation/av/compare?keys=14:2,13:2 — сравнение турниров между собой. */
  app.get('/av/compare', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const qq = req.query as { season?: string; keys?: string };
    const season = Number(qq.season) || AV_SEASON;
    const keys = String(qq.keys ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (keys.length === 0) throw new BadRequestError('нужен ?keys=t:d,t:d', 'NO_KEYS');
    return { season, items: await compareTournaments(season, keys) };
  });

  /** GET /federation/av/players — игроки региона из реальной базы (разобранные). */
  app.get('/av/players', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, players: await regionPlayers(season) };
  });

  /** GET /federation/av/standings — турнирные таблицы клубов по дивизионам. */
  app.get('/av/standings', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, groups: await regionStandings(season) };
  });

  /** GET /federation/av/club-ratings — рейтинг клубов АванДата по дивизионам. */
  app.get('/av/club-ratings', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, groups: await regionClubRatings(season) };
  });

  /** GET /federation/av/players/:id — профиль игрока + «пицца» из событий. */
  app.get('/av/players/:id', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    const id = Number((req.params as { id: string }).id);
    const profile = await playerProfile(season, id);
    if (!profile) { reply.code(404); return { error: 'игрок не найден', code: 'PLAYER_NOT_FOUND' }; }
    return profile;
  });

  /** GET /api/v1/federation/region-map — перепись региона (живые счётчики) + реестр кадров. */
  app.get('/region-map', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, async (_tx, conn) => ({
      ...(await federationRegionMap(conn)),
      registry: registryFor(federationId),
    }));
  });

  /** GET /api/v1/federation/region-profile — 6-мерный профиль качества + стиль игры. */
  app.get('/region-profile', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, (_tx, conn) => federationRegionProfile(conn));
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

  /** GET /api/v1/federation/data-quality — полнота паспортизации + согласия (FR14–16). */
  app.get('/data-quality', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, async (_tx, conn) => ({
      clubs: await federationDataQuality(conn),
    }));
  });

  /** GET /api/v1/federation/age-effect — относительный возрастной эффект (FR21). */
  app.get('/age-effect', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, (_tx, conn) => federationAgeEffect(conn));
  });

  /** GET /api/v1/federation/talent?minMinutes=N — талант-пул региона (FR18). */
  app.get('/talent', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    const raw = Number((req.query as { minMinutes?: string }).minMinutes);
    const minMinutes = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    return await withFederation(federationId, async (_tx, conn) => ({
      players: await federationTalentPool(conn, minMinutes),
    }));
  });

  /** GET /api/v1/federation/players/:id — детальный профиль игрока (дриллдаун). */
  app.get('/players/:id', async (req, reply) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    const { id } = req.params as { id: string };
    const profile = await withFederation(federationId, (_tx, conn) => federationPlayerProfile(conn, id));
    if (!profile) {
      reply.code(404);
      return { error: 'игрок не найден или вне федерации', code: 'PLAYER_NOT_FOUND' };
    }
    return profile;
  });

  /** GET /api/v1/federation/win-develop — матрица «Победа vs развитие» (Открытие 2). */
  app.get('/win-develop', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, async (_tx, conn) => ({
      clubs: await federationWinDevelop(conn),
    }));
  });

  /** GET /api/v1/federation/best-xi?minMinutes=N — сборная региона по данным. */
  app.get('/best-xi', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    const raw = Number((req.query as { minMinutes?: string }).minMinutes);
    const minMinutes = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    return await withFederation(federationId, async (_tx, conn) => ({
      players: await federationBestXI(conn, minMinutes),
    }));
  });

  /** GET /api/v1/federation/development — продуктивность клубов (FR22). */
  app.get('/development', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, async (_tx, conn) => ({
      clubs: await federationProductivity(conn),
    }));
  });

  /** GET /api/v1/federation/scorers — бомбардиры/ассистенты региона (открытый FFSPB). */
  app.get('/scorers', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, (_tx, conn) => federationScorers(conn));
  });

  /** GET /api/v1/federation/benchmark — KPI-сравнение клубов (FR24). */
  app.get('/benchmark', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    return await withFederation(federationId, async (_tx, conn) => ({
      clubs: await federationBenchmark(conn),
    }));
  });
}
