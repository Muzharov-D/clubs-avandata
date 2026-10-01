import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, authorize } from '../auth/middleware.js';
import { HOLDINGS, findHolding, publicHolding, holdingProfileOrWarming, type HoldingConfig } from '../federation/holdings.js';
import { holdingAnalytics } from '../federation/holdingAnalytics.js';
import { playerMetricsVsLeague, teamMetricsVsLeague } from '../federation/holdingMetrics.js';
import { isAvandataConfigured, playerProfile, regionPlayers } from '../federation/avandataSource.js';

/**
 * Кабинет холдинга (/holding) — руководство группы школ одного бренда.
 * Роль holding_admin: холдинг берётся из JWT (holdingId). federation_admin тоже
 * пускаем (регулятор смотрит тот же кабинет), для него slug — в query.
 * Только чтение. Данные — те же живые источники, что у кабинета федерации.
 */
export async function holdingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', authorize('holding_admin', 'federation_admin'));

  const AV_SEASON = 2;
  const cfgOf = (req: FastifyRequest, reply: FastifyReply): HoldingConfig | null => {
    const slug = req.user?.role === 'holding_admin' ? req.user.holdingId : (req.query as { slug?: string }).slug;
    // Федерация без ?slug= (например, из карточки игрока) — первый холдинг из конфига.
    const cfg = slug ? findHolding(slug) : (req.user?.role === 'federation_admin' ? HOLDINGS[0] : undefined);
    if (!cfg) { reply.code(404); return null; }
    return cfg;
  };
  const avOff = (reply: FastifyReply): boolean => { if (isAvandataConfigured()) return false; reply.code(503); return true; };

  /** GET /holding/me — конфиг холдинга текущего пользователя (бренд, участники, годы). */
  app.get('/me', async (req, reply) => {
    const cfg = cfgOf(req, reply); if (!cfg) return { error: 'холдинг не найден', code: 'HOLDING_NOT_FOUND' };
    return publicHolding(cfg);
  });

  /** GET /holding/profile — профиль (команды, таблицы, матчи, лучшие, сборная); 202 пока греется. */
  app.get('/profile', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const cfg = cfgOf(req, reply); if (!cfg) return { error: 'холдинг не найден', code: 'HOLDING_NOT_FOUND' };
    const res = await holdingProfileOrWarming(AV_SEASON, cfg);
    if ('warming' in res) { reply.code(202); return { status: 'warming', code: 'HOLDING_WARMING' }; }
    return res.profile;
  });

  /** GET /holding/analytics — игроки и команды относительно лиги + решения; 202 пока греется. */
  app.get('/analytics', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const cfg = cfgOf(req, reply); if (!cfg) return { error: 'холдинг не найден', code: 'HOLDING_NOT_FOUND' };
    const res = await holdingProfileOrWarming(AV_SEASON, cfg);
    if ('warming' in res) { reply.code(202); return { status: 'warming', code: 'HOLDING_WARMING' }; }
    return await holdingAnalytics(AV_SEASON, cfg, res.profile);
  });

  /** GET /holding/players/:id — профиль игрока (37 показателей, матчи) + его место в лиге. */
  app.get('/players/:id', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const cfg = cfgOf(req, reply); if (!cfg) return { error: 'холдинг не найден', code: 'HOLDING_NOT_FOUND' };
    const id = Number((req.params as { id: string }).id);
    const profile = await playerProfile(AV_SEASON, id);
    if (!profile) { reply.code(404); return { error: 'игрок не найден', code: 'PLAYER_NOT_FOUND' }; }
    let league = null;
    const res = await holdingProfileOrWarming(AV_SEASON, cfg, 1_000);
    if (!('warming' in res)) {
      const an = await holdingAnalytics(AV_SEASON, cfg, res.profile);
      league = an.players.find((p) => p.id === id || profile.registrations.includes(p.id)) ?? null;
    }
    // 36 показателей против амплуа в лиге — по когорте года рождения; пока когорта считается — null.
    const year = league?.birthYear ?? profile.birthYear ?? null;
    // Не `metrics` — это поле уже занято списком событий профиля.
    const vsLeague = year != null ? playerMetricsVsLeague(AV_SEASON, year, profile.registrations.length ? profile.registrations : [id]) : null;
    return { ...profile, league, vsLeague, vsLeagueStatus: vsLeague ? 'ready' : 'warming' };
  });

  /** GET /holding/teams/:key/metrics — действия команды за матч против команд дивизиона. */
  app.get('/teams/:key/metrics', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const cfg = cfgOf(req, reply); if (!cfg) return { error: 'холдинг не найден', code: 'HOLDING_NOT_FOUND' };
    const key = decodeURIComponent((req.params as { key: string }).key);
    const [clubKey, yearS] = key.split(':');
    const year = Number(yearS);
    if (!clubKey || !Number.isFinite(year)) { reply.code(400); return { error: 'неверный ключ команды', code: 'BAD_TEAM_KEY' }; }
    const m = teamMetricsVsLeague(AV_SEASON, year, clubKey);
    if (!m) { reply.code(202); return { status: 'warming', code: 'METRICS_WARMING' }; }
    return m;
  });

  /** GET /holding/players?year= — пул игроков региона (для перцентилей в карточке игрока). */
  app.get('/players', async (req, reply) => {
    if (avOff(reply)) return { error: 'AVANDATA_API_KEY не задан', code: 'AVANDATA_OFF' };
    const y = Number((req.query as { year?: string }).year);
    const players = await regionPlayers(AV_SEASON, Number.isFinite(y) && y > 1900 ? y : undefined);
    return { players: players.map(({ series: _s, ...p }) => p) };
  });
}
