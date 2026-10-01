import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, authorize } from '../auth/middleware.js';
import { HOLDINGS, findHolding, publicHolding, holdingProfileOrWarming, type HoldingConfig } from '../federation/holdings.js';
import { holdingAnalytics } from '../federation/holdingAnalytics.js';
import { playerMetricsVsLeague, teamMetricsVsLeague } from '../federation/holdingMetrics.js';
import { isAvandataConfigured, playerProfile, regionPlayers, clubName, type RegionPlayer } from '../federation/avandataSource.js';
import { lineOf } from '../federation/holdings.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { holdingNotes, type HoldingNote, type HoldingNoteKind } from '../db/schema/holding.js';
import { users } from '../db/schema/users.js';
import { holdingChanges, holdingTimeline, captureHoldingSnapshotIfDue } from './snapshots.js';
import { buildCard } from './card.js';

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
    const an = await holdingAnalytics(AV_SEASON, cfg, res.profile);
    void captureHoldingSnapshotIfDue(AV_SEASON, cfg, an);
    return an;
  });

  /** Готовые профиль и аналитика или null (тогда ответ уже 202/404/503). */
  const ready = async (req: FastifyRequest, reply: FastifyReply) => {
    if (avOff(reply)) return null;
    const cfg = cfgOf(req, reply); if (!cfg) return null;
    const res = await holdingProfileOrWarming(AV_SEASON, cfg);
    if ('warming' in res) { reply.code(202); return null; }
    return { cfg, profile: res.profile, an: await holdingAnalytics(AV_SEASON, cfg, res.profile) };
  };
  const notReady = (reply: FastifyReply) => (reply.statusCode === 202 ? { status: 'warming', code: 'HOLDING_WARMING' } : { error: 'недоступно', code: 'HOLDING_UNAVAILABLE' });

  /** GET /holding/changes?base=week|snap:<id>|tours:<N> — что изменилось относительно базы. */
  app.get('/changes', async (req, reply) => {
    const r = await ready(req, reply); if (!r) return notReady(reply);
    const base = String((req.query as { base?: string }).base ?? 'week');
    return holdingChanges(AV_SEASON, r.cfg, r.profile, base);
  });

  /** GET /holding/timeline — численность списков решений и средний класс команд по турам. */
  app.get('/timeline', async (req, reply) => {
    const r = await ready(req, reply); if (!r) return notReady(reply);
    return { points: await holdingTimeline(AV_SEASON, r.cfg, r.profile) };
  });

  /** Сырой игрок когорты (ряд матчей) — для стабильности и сравнения. */
  const rawPlayer = async (id: number, years: number[]): Promise<{ p: RegionPlayer; year: number; pool: RegionPlayer[] } | null> => {
    for (const y of years) {
      const pool = await regionPlayers(AV_SEASON, y);
      const p = pool.find((x) => x.id === id);
      if (p) return { p, year: y, pool };
    }
    return null;
  };

  /** GET /holding/players/:id/card — карточка кандидата: вывод словами, факты, сильные/слабые стороны. */
  app.get('/players/:id/card', async (req, reply) => {
    const r = await ready(req, reply); if (!r) return notReady(reply);
    const id = Number((req.params as { id: string }).id);
    // Профиль нужен только ради склейки регистраций и фото; холодный — до пары минут,
    // поэтому ждём недолго, а дальше карточка строится по id (профиль догреется фоном).
    const prof = await Promise.race([
      playerProfile(AV_SEASON, id).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    const ids = prof?.registrations.length ? prof.registrations : [id];
    const lp = r.an.players.find((p) => ids.includes(p.id)) ?? r.an.teams.flatMap((t) => t.squad).find((p) => ids.includes(p.id));
    if (!lp) { reply.code(404); return { error: 'игрок не из холдинга', code: 'PLAYER_NOT_FOUND' }; }
    const raw = await rawPlayer(lp.id, [lp.birthYear]);
    const metrics = playerMetricsVsLeague(AV_SEASON, lp.birthYear, ids);
    const notes = req.user?.role === 'holding_admin' ? await notesOf(r.cfg.slug, lp.id) : [];
    return {
      player: lp, photo: prof?.photo ?? lp.photo, birthDate: prof?.birthDate ?? null,
      card: buildCard(lp, r.an, raw?.p ?? null, metrics), metrics, metricsStatus: metrics ? 'ready' : 'warming',
      notes, asOf: r.an.asOf,
    };
  });

  /**
   * GET /holding/compare?a=&b= — два игрока бок о бок по 36 показателям. Игрок не из холдинга
   * (кандидат селекции) — без имени и фото: школа, амплуа, год, рейтинг, место.
   */
  app.get('/compare', async (req, reply) => {
    const r = await ready(req, reply); if (!r) return notReady(reply);
    const q = req.query as { a?: string; b?: string };
    const own = new Map(r.an.teams.flatMap((t) => t.squad).map((p) => [p.id, p]));
    const side = async (raw: string | undefined) => {
      const id = Number(raw);
      if (!Number.isFinite(id) || id <= 0) return null;
      const lp = own.get(id);
      if (lp) {
        const metrics = playerMetricsVsLeague(AV_SEASON, lp.birthYear, [id]);
        return { id, anonymous: false, name: lp.name, photo: lp.photo, club: lp.clubLabel, teamKey: lp.teamKey, birthYear: lp.birthYear, position: lp.position, line: lp.line, division: lp.division, rating: lp.rating, mp: lp.mp, rankRegion: lp.rankRegion, sizeRegion: lp.sizeRegion, pctRegion: lp.pctRegion, deltaLine: lp.deltaLine, lineAvgDiv: lp.lineAvgDiv, trend: lp.trend, metrics };
      }
      const found = await rawPlayer(id, r.profile.years);
      if (!found) return null;
      const rated = found.pool.filter((p) => p.rating != null && p.mp >= 2).sort((x, y) => (y.rating as number) - (x.rating as number));
      const rank = rated.findIndex((p) => p.id === id);
      const metrics = playerMetricsVsLeague(AV_SEASON, found.year, [id]);
      const sel = r.an.selection.flatMap((g) => g.candidates).find((c) => c.id === id);
      return {
        id, anonymous: true, name: null, photo: null, club: clubName(found.p.club), teamKey: null, birthYear: found.year,
        position: found.p.position, line: lineOf(found.p.position), division: sel?.division ?? metrics?.division ?? '—',
        rating: found.p.mp >= 2 ? found.p.rating : null, mp: found.p.mp,
        rankRegion: rank >= 0 ? rank + 1 : null, sizeRegion: rated.length, pctRegion: rank >= 0 ? Math.max(1, Math.round(((rank + 1) / rated.length) * 100)) : null,
        deltaLine: null, lineAvgDiv: null, trend: sel?.trend ?? null, metrics,
      };
    };
    const [a, b] = await Promise.all([side(q.a), side(q.b)]);
    if (!a || !b) { reply.code(404); return { error: 'игрок не найден', code: 'PLAYER_NOT_FOUND' }; }
    return { a, b, status: a.metrics && b.metrics ? 'ready' : 'warming' };
  });

  // ─── Заметки и решения руководства ───────────────────────────────────────
  // Только руководство холдинга: пометки — внутренняя кухня клуба, федерации не видны.
  const KINDS: HoldingNoteKind[] = ['youth', 'promote', 'older', 'watch', 'keep', 'other'];
  async function notesOf(slug: string, playerId?: number): Promise<HoldingNote[]> {
    return withBypassRLS((tx) => tx.select().from(holdingNotes)
      .where(playerId != null ? and(eq(holdingNotes.holdingSlug, slug), eq(holdingNotes.playerId, playerId)) : eq(holdingNotes.holdingSlug, slug))
      .orderBy(sql`${holdingNotes.closedAt} IS NOT NULL`, desc(holdingNotes.createdAt))); // открытые — сверху
  }
  const holdingOnly = (req: FastifyRequest, reply: FastifyReply): string | null => {
    if (req.user?.role !== 'holding_admin' || !req.user.holdingId) { reply.code(403); return null; }
    return req.user.holdingId;
  };
  const forbidden = { error: 'заметки доступны только руководству холдинга', code: 'HOLDING_NOTES_FORBIDDEN' };

  /** GET /holding/notes?player= — пометки (все или по игроку) + где игрок сейчас относительно момента решения. */
  app.get('/notes', async (req, reply) => {
    const slug = holdingOnly(req, reply); if (!slug) return forbidden;
    const pid = Number((req.query as { player?: string }).player);
    const notes = await notesOf(slug, Number.isFinite(pid) && pid > 0 ? pid : undefined);
    // Текущее состояние игрока — если аналитика готова (не ждём прогрева).
    const cfg = findHolding(slug)!;
    const res = await holdingProfileOrWarming(AV_SEASON, cfg, 1_000);
    const an = 'warming' in res ? null : await holdingAnalytics(AV_SEASON, cfg, res.profile);
    const byId = new Map((an?.teams.flatMap((t) => t.squad) ?? []).map((p) => [p.id, p]));
    const today = new Date().toISOString().slice(0, 10);
    return {
      notes: notes.map((n) => {
        const p = byId.get(n.playerId);
        return { ...n, now: p ? { rating: p.rating, rankRegion: p.rankRegion, sizeRegion: p.sizeRegion, pctRegion: p.pctRegion, teamKey: p.teamKey, clubLabel: p.clubLabel, birthYear: p.birthYear, line: p.line } : null, due: !n.closedAt && n.remindOn != null && n.remindOn <= today };
      }),
    };
  });

  /** POST /holding/notes — решение/заметка по игроку; рейтинг и место фиксируются на момент решения. */
  app.post('/notes', async (req, reply) => {
    const slug = holdingOnly(req, reply); if (!slug) return forbidden;
    const body = (req.body ?? {}) as { playerId?: number; kind?: string; text?: string; remindOn?: string | null };
    const playerId = Number(body.playerId);
    const kind = body.kind as HoldingNoteKind;
    const text = String(body.text ?? '').trim().slice(0, 2000);
    const remindOn = body.remindOn && /^\d{4}-\d{2}-\d{2}$/.test(body.remindOn) ? body.remindOn : null;
    if (!Number.isFinite(playerId) || !KINDS.includes(kind) || (kind === 'other' && !text)) { reply.code(400); return { error: 'неверные данные заметки', code: 'BAD_NOTE' }; }
    const cfg = findHolding(slug)!;
    const res = await holdingProfileOrWarming(AV_SEASON, cfg, 5_000);
    const an = 'warming' in res ? null : await holdingAnalytics(AV_SEASON, cfg, res.profile);
    const p = an?.teams.flatMap((t) => t.squad).find((x) => x.id === playerId);
    const prof = p ? null : await playerProfile(AV_SEASON, playerId);
    if (!p && !prof) { reply.code(404); return { error: 'игрок не найден', code: 'PLAYER_NOT_FOUND' }; }
    const author = await withBypassRLS((tx) => tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.user!.sub)).limit(1));
    const [row] = await withBypassRLS((tx) => tx.insert(holdingNotes).values({
      holdingSlug: slug, playerId, playerName: p?.name ?? prof!.name, kind, text, remindOn,
      ratingAt: p?.rating ?? null, rankAt: p?.rankRegion ?? null, sizeAt: p?.sizeRegion ?? null,
      authorId: req.user!.sub, authorName: author[0]?.fullName ?? null,
    }).returning());
    reply.code(201);
    return row;
  });

  /** PATCH /holding/notes/:id — закрыть/открыть решение, сменить дату напоминания или текст. */
  app.patch('/notes/:id', async (req, reply) => {
    const slug = holdingOnly(req, reply); if (!slug) return forbidden;
    const id = Number((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { closed?: boolean; remindOn?: string | null; text?: string };
    const set: Partial<typeof holdingNotes.$inferInsert> = {};
    if (typeof body.closed === 'boolean') set.closedAt = body.closed ? new Date() : null;
    if (body.remindOn !== undefined) set.remindOn = body.remindOn && /^\d{4}-\d{2}-\d{2}$/.test(body.remindOn) ? body.remindOn : null;
    if (typeof body.text === 'string') set.text = body.text.trim().slice(0, 2000);
    if (!Object.keys(set).length) { reply.code(400); return { error: 'нечего менять', code: 'BAD_NOTE' }; }
    const [row] = await withBypassRLS((tx) => tx.update(holdingNotes).set(set).where(and(eq(holdingNotes.id, id), eq(holdingNotes.holdingSlug, slug))).returning());
    if (!row) { reply.code(404); return { error: 'заметка не найдена', code: 'NOTE_NOT_FOUND' }; }
    return row;
  });

  /** DELETE /holding/notes/:id — удалить ошибочную заметку. */
  app.delete('/notes/:id', async (req, reply) => {
    const slug = holdingOnly(req, reply); if (!slug) return forbidden;
    const id = Number((req.params as { id: string }).id);
    const rows = await withBypassRLS((tx) => tx.delete(holdingNotes).where(and(eq(holdingNotes.id, id), eq(holdingNotes.holdingSlug, slug))).returning({ id: holdingNotes.id }));
    if (!rows.length) { reply.code(404); return { error: 'заметка не найдена', code: 'NOTE_NOT_FOUND' }; }
    reply.code(204);
    return null;
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
