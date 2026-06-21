import type { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../auth/middleware.js';
import { withFederation } from '../db/tenantContext.js';
import { BadRequestError } from '../shared/errors.js';
import { registryFor } from './registry.js';
import {
  isAvandataConfigured, listTournaments, compareTournaments, regionOverview, regionPlayers,
  regionStandings, regionClubRatings, playerProfile, availableYears, divisionStrength,
  ageEffect, talentConcentration, cohortMatrix, regionResults, regionMatchDetail,
  warmRegionMatchProtocols, regionClubProfile, federationHealth, getLastFedHealth,
} from './avandataSource.js';
import { snapshotMeta, captureSnapshotIfDue } from './snapshots.js';
import { latestRegionCensus } from './regionCensus.js';
import { federationWeekly } from './weekly.js';
import { LOSS_MAP } from './lossMap.generated.js';
import { env } from '../env.js';
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
    return await regionOverview(season, divisionOf(req), yearOf(req));
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

  // Год рождения из query (фильтр возрастов); 0/пусто = все возрасты.
  const yearOf = (req: { query: unknown }): number | undefined => {
    const y = Number((req.query as { year?: string }).year);
    return Number.isFinite(y) && y > 1900 ? y : undefined;
  };

  // Дивизион из query (Высшая/Первая лига); пусто = все дивизионы (режим сравнения).
  const divisionOf = (req: { query: unknown }): string | undefined => {
    const d = String((req.query as { division?: string }).division ?? '').trim();
    return d || undefined;
  };

  /** GET /federation/av/years — доступные года рождения для фильтра. */
  app.get('/av/years', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, years: await availableYears(season) };
  });

  /** GET /federation/av/players?year= — игроки региона (опц. фильтр по возрасту). */
  app.get('/av/players', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, players: await regionPlayers(season, yearOf(req), divisionOf(req)) };
  });

  /** GET /federation/av/standings?year= — турнирные таблицы клубов по дивизионам. */
  app.get('/av/standings', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    const std = await regionStandings(season, yearOf(req));
    return { season, ...std }; // { groups, source, degraded, asOf }
  });

  /** GET /federation/av/health — инварианты данных по всем когортам (Фаза A «недельного радара»):
   *  официальный источник, наличие Высшей, чистый джойн. Ловит регрессии «команда пропала». */
  app.get('/av/health', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    // НИКОГДА не блокируем: отдаём последний крон-отчёт мгновенно; если он ещё не готов —
    // греем в фоне и возвращаем «считается» (живой обход когорт тяжёлый, его делает крон).
    const last = getLastFedHealth();
    if (last) return last;
    void federationHealth(season).catch(() => undefined);
    return { ok: null, warming: true, degraded: 0, failing: 0, cohorts: [], note: 'отчёт считается — обновите через минуту' };
  });

  /** GET /federation/av/snapshots — метаданные недельных снимков (Фаза B): по когортам
   *  сколько снимков и когда последний. Для проверки накопления + подписи «данные с …». */
  app.get('/av/snapshots', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { ...(await snapshotMeta(season)), cronsEnabled: env.START_CRONS };
  });

  /** GET /federation/av/weekly — «За неделю» (Фаза C): что требует внимания сейчас
   *  (недовыполнение/зеркало) + что изменилось за неделю (диф снимков). */
  app.get('/av/weekly', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    // Триггер-на-просмотр: открыли радар → если недельный снимок просрочен, снимаем новый в фоне
    // (гард внутри — не чаще ~раза/нед, ответ не блокируем). Радар копит данные ОТ ПРОСМОТРА,
    // не завися от START_CRONS — динамика появится при следующем заходе.
    void captureSnapshotIfDue(season).catch(() => undefined);
    return await federationWeekly(season);
  });

  /** GET /federation/av/club-ratings?year= — рейтинг клубов AvanData по дивизионам. */
  app.get('/av/club-ratings', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, groups: await regionClubRatings(season, yearOf(req)) };
  });

  /** GET /federation/av/division-strength?year= — сила лиг (дивизионов). */
  app.get('/av/division-strength', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, divisions: await divisionStrength(season, yearOf(req)) };
  });

  /** GET /federation/av/results?year= — последние результаты матчей региона. */
  app.get('/av/results', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    const results = await regionResults(season, yearOf(req), divisionOf(req));
    void warmRegionMatchProtocols(results.map((r) => r.id)); // фоновый пред-синк протоколов FFSPB
    return { season, results };
  });

  /** GET /federation/av/matches/:id — детали матча (счёт, лучший игрок, события). */
  app.get('/av/matches/:id', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const id = Number((req.params as { id: string }).id);
    const detail = await regionMatchDetail(id);
    if (!detail) { reply.code(404); return { error: 'матч не найден', code: 'MATCH_NOT_FOUND' }; }
    return detail;
  });

  /** GET /federation/av/clubs/:id — карточка клуба (рейтинг, команды, лучшие, производство, матчи). */
  app.get('/av/clubs/:id', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    const id = Number((req.params as { id: string }).id);
    const profile = await regionClubProfile(season, id);
    if (!profile) { reply.code(404); return { error: 'клуб не найден', code: 'CLUB_NOT_FOUND' }; }
    return profile;
  });

  /** GET /federation/av/cohorts — матрица когорт региона (год рождения × сигналы). */
  app.get('/av/cohorts', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return { season, cohorts: await cohortMatrix(season) };
  });

  /** GET /federation/av/age-effect?year= — возрастная утечка (RAE по полной дате). */
  app.get('/av/age-effect', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return await ageEffect(season, yearOf(req), divisionOf(req));
  });

  /** GET /federation/av/concentration?year= — монополия таланта. */
  app.get('/av/concentration', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    return await talentConcentration(season, yearOf(req), divisionOf(req));
  });

  /** GET /federation/av/loss-map — «Карта потерь»: game-time% по кварталам рождения (снимок
   *  FFSPB, обновляется `npm run sync:lossmap`). Статика — отдаём мгновенно, без живого FFSPB. */
  app.get('/av/loss-map', async () => LOSS_MAP);

  /** GET /federation/av/players/:id — профиль игрока + «пицца» из событий. */
  app.get('/av/players/:id', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const season = Number((req.query as { season?: string }).season) || AV_SEASON;
    const id = Number((req.params as { id: string }).id);
    const profile = await playerProfile(season, id);
    if (!profile) { reply.code(404); return { error: 'игрок не найден', code: 'PLAYER_NOT_FOUND' }; }
    return profile;
  });

  /** GET /api/v1/federation/region-map — перепись региона (живые счётчики) + реестр кадров
   *  + пирамида лиг FFSPB (последний месячный снимок region_census, null если ещё нет). */
  app.get('/region-map', async (req) => {
    const federationId = req.user?.federationId;
    if (!federationId) throw new BadRequestError('no federation context', 'NO_FEDERATION');
    // Пирамиду читаем ОТДЕЛЬНЫМ bypass-ридом (region_census — не tenant-scoped, по
    // federationSlug). Эндпоинт только ЧИТАЕТ последний снимок — живой FFSPB здесь не дёргаем.
    const pyramid = await latestRegionCensus(federationId);
    return await withFederation(federationId, async (_tx, conn) => ({
      ...(await federationRegionMap(conn)),
      pyramid,
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
