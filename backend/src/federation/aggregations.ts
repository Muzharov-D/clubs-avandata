import type { PoolClient } from 'pg';
import { FED_MEMBERSHIP_SQL, fedMembershipFilter } from './membership.js';

export interface FederationOverview {
  /** Честный охват: всего клубов-членов, из них на глубине (paid) и на базе (free). */
  clubs: { total: number; paid: number; free: number };
  teams: number;
  players: number;
  matches: number;
}

/**
 * Сводка по региону (Эпик 1, FR4–5). Выполняется внутри withFederation
 * (app.federation_id выставлен, bypass='on'). Изоляция:
 *  - tenant-scoped таблицы (teams/players/matches) — через FED_MEMBERSHIP_SQL;
 *  - реестр tenants — по slug ∈ членство (у tenants нет колонки tenant_id).
 * Счётчики слоёв (paid/free) НЕ суммируются в одну метрику на фронте —
 * контракт честного охвата.
 */
export async function federationOverview(conn: PoolClient): Promise<FederationOverview> {
  const clubsQ = await conn.query<{ plan: string; n: string }>(
    `SELECT plan, count(*)::int AS n FROM tenants
      WHERE slug IN (
        SELECT tenant_slug FROM federation_tenants
         WHERE federation_slug = current_setting('app.federation_id', true) AND tier = 'full'
      )
      GROUP BY plan`,
  );
  let total = 0;
  let paid = 0;
  let free = 0;
  for (const r of clubsQ.rows) {
    const n = Number(r.n);
    total += n;
    if (r.plan === 'paid') paid += n;
    else free += n;
  }

  // table — литерал из кода (не пользовательский ввод), инъекции нет.
  const countMembers = async (table: 'teams' | 'players' | 'matches'): Promise<number> => {
    const q = await conn.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${FED_MEMBERSHIP_SQL}`,
    );
    return Number(q.rows[0]?.n ?? 0);
  };

  return {
    clubs: { total, paid, free },
    teams: await countMembers('teams'),
    players: await countMembers('players'),
    matches: await countMembers('matches'),
  };
}

export interface FederationClubRow {
  slug: string;
  name: string;
  /** Тариф = слой данных: 'free' (база, оплачено федерацией) | 'paid' (глубина). */
  plan: string;
  teams: number;
  players: number;
  matches: number;
  /** Средний data_quality score по разобранным матчам (0–100) или null. */
  coverage: number | null;
}

/**
 * Реестр клубов-членов с показателями (Эпик 2, FR7). Один ряд на клуб:
 * команды/игроки/матчи + охват данными (средний data_quality score). Клубы —
 * только члены федерации (slug ∈ членство). Коррелированные подзапросы scoped
 * на slug клуба, который уже ограничен членством.
 */
export async function federationClubs(conn: PoolClient): Promise<FederationClubRow[]> {
  const q = await conn.query<{
    slug: string; name: string; plan: string;
    teams: string; players: string; matches: string; coverage: string | null;
  }>(
    `SELECT
       t.slug,
       t.display_name AS name,
       t.plan,
       (SELECT count(*)::int FROM teams te WHERE te.tenant_id = t.slug) AS teams,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug) AS players,
       (SELECT count(*)::int FROM matches m WHERE m.tenant_id = t.slug) AS matches,
       (SELECT round(avg((m.data_quality->>'score')::numeric))::int
          FROM matches m
         WHERE m.tenant_id = t.slug
           AND jsonb_typeof(m.data_quality->'score') = 'number') AS coverage
     FROM tenants t
     WHERE t.slug IN (
       SELECT tenant_slug FROM federation_tenants
        WHERE federation_slug = current_setting('app.federation_id', true) AND tier = 'full'
     )
     ORDER BY t.display_name`,
  );
  return q.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    plan: r.plan,
    teams: Number(r.teams),
    players: Number(r.players),
    matches: Number(r.matches),
    coverage: r.coverage == null ? null : Number(r.coverage),
  }));
}

export interface FederationCompetition {
  ageGroup: string;
  season: string;
  leagueName: string | null;
  /** Строки таблицы (открытый слой — ВСЕ клубы турнира). Форма строки гибкая. */
  table: Array<Record<string, unknown>>;
}

/**
 * Сводные турнирные таблицы по возрастам (Эпик 3, FR11) — открытый слой:
 * table_data содержит все клубы турнира, в т.ч. не на платформе. Берём последнюю
 * синхронизацию (fetched_at) на каждый возраст среди клубов-членов федерации.
 */
export async function federationCompetitions(conn: PoolClient): Promise<FederationCompetition[]> {
  const q = await conn.query<{
    age_group: string; season: string; league_name: string | null; table_data: unknown;
  }>(
    `SELECT DISTINCT ON (age_group) age_group, season, league_name, table_data
       FROM standings
      WHERE ${FED_MEMBERSHIP_SQL}
      ORDER BY age_group, fetched_at DESC`,
  );
  return q.rows.map((r) => {
    const td = r.table_data as { table?: unknown } | unknown[] | null;
    const table = Array.isArray(td)
      ? (td as Array<Record<string, unknown>>)
      : td && typeof td === 'object' && Array.isArray((td as { table?: unknown }).table)
        ? ((td as { table: Array<Record<string, unknown>> }).table)
        : [];
    return {
      ageGroup: r.age_group,
      season: r.season,
      leagueName: r.league_name ?? null,
      table,
    };
  });
}

export interface FederationDataQualityRow {
  slug: string;
  name: string;
  players: number;
  /** Полнота паспортизации в % (или null, если игроков нет). */
  birthPct: number | null;
  photoPct: number | null;
  positionPct: number | null;
  consentPct: number | null;
}

/**
 * Целостность данных и согласия по клубам (Эпик 4, FR14–16). Полнота
 * паспортизации (дата рождения / фото / позиция / согласие) — ОБЕЗЛИЧЕННЫЕ
 * счётчики и проценты. Именные данные ребёнка федерации в F1 не отдаются вообще
 * (нет per-player эндпоинтов) → гейт согласия FR17 соблюдён by design.
 */
export async function federationDataQuality(conn: PoolClient): Promise<FederationDataQualityRow[]> {
  const q = await conn.query<{
    slug: string; name: string; players: string;
    with_birth: string; with_photo: string; with_position: string; with_consent: string;
  }>(
    `SELECT
       t.slug,
       t.display_name AS name,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug) AS players,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug AND p.birth_date IS NOT NULL) AS with_birth,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug AND p.photo_url IS NOT NULL AND p.photo_url <> '') AS with_photo,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug AND p.position IS NOT NULL AND p.position <> '') AS with_position,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug AND p.data_consent = true) AS with_consent
     FROM tenants t
     WHERE t.slug IN (
       SELECT tenant_slug FROM federation_tenants
        WHERE federation_slug = current_setting('app.federation_id', true) AND tier = 'full'
     )
     ORDER BY t.display_name`,
  );
  return q.rows.map((r) => {
    const players = Number(r.players);
    const pct = (n: string): number | null => (players === 0 ? null : Math.round((Number(n) / players) * 100));
    return {
      slug: r.slug,
      name: r.name,
      players,
      birthPct: pct(r.with_birth),
      photoPct: pct(r.with_photo),
      positionPct: pct(r.with_position),
      consentPct: pct(r.with_consent),
    };
  });
}

export interface FederationAgeEffect {
  /** Распределение по кварталам рождения по региону (эталон — 25% каждый). */
  region: { q1: number; q2: number; q3: number; q4: number; total: number };
  /** Перекос по клубам: доля Q1 (рождённых в начале года). */
  clubs: Array<{ slug: string; name: string; total: number; q1Pct: number | null }>;
}

/**
 * Относительный возрастной эффект (Эпик 6, FR21) — распределение игроков по
 * кварталам рождения по региону и перекос по клубам (доля Q1). Обезличенно:
 * только счётчики и проценты, без имён. Эталон равномерности — 25% на квартал;
 * перекос к Q1 = смещение отбора в пользу более зрелых.
 */
export async function federationAgeEffect(conn: PoolClient): Promise<FederationAgeEffect> {
  const regionQ = await conn.query<{ q: number; n: number }>(
    `SELECT extract(quarter from birth_date)::int AS q, count(*)::int AS n
       FROM players
      WHERE ${FED_MEMBERSHIP_SQL} AND birth_date IS NOT NULL
      GROUP BY q`,
  );
  const region = { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };
  for (const r of regionQ.rows) {
    const n = Number(r.n);
    region.total += n;
    const q = Number(r.q);
    if (q === 1) region.q1 = n;
    else if (q === 2) region.q2 = n;
    else if (q === 3) region.q3 = n;
    else if (q === 4) region.q4 = n;
  }

  const clubsQ = await conn.query<{ slug: string; name: string; total: number; q1: number }>(
    `SELECT t.slug, t.display_name AS name,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug AND p.birth_date IS NOT NULL) AS total,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug AND extract(quarter from p.birth_date) = 1) AS q1
     FROM tenants t
     WHERE t.slug IN (
       SELECT tenant_slug FROM federation_tenants
        WHERE federation_slug = current_setting('app.federation_id', true) AND tier = 'full'
     )
     ORDER BY t.display_name`,
  );
  const clubs = clubsQ.rows.map((r) => {
    const total = Number(r.total);
    return {
      slug: r.slug,
      name: r.name,
      total,
      q1Pct: total === 0 ? null : Math.round((Number(r.q1) / total) * 100),
    };
  });

  return { region, clubs };
}

export interface FederationPlayerRow {
  /** Имя — только при согласии (data_consent); иначе null (обезличено). */
  name: string | null;
  club: string;
  ageGroup: string;
  position: string | null;
  matches: number;
  minutes: number;
  rating: number | null;
  /** Профиль рейтинга по 6 измерениям (среднее по матчам, 0–10) — реальная глубина. */
  attack: number | null;
  defence: number | null;
  passing: number | null;
  fitness: number | null;
  creativity: number | null;
}

/** Среднее по числовому ключу ratings/team_avg_ratings с учётом legacy-алиаса. */
function avgRatingExpr(col: string, key: string, alias?: string): string {
  const a = `jsonb_typeof(${col}->'${key}')='number' THEN (${col}->>'${key}')::numeric`;
  const b = alias ? ` WHEN jsonb_typeof(${col}->'${alias}')='number' THEN (${col}->>'${alias}')::numeric` : '';
  return `round(avg(CASE WHEN ${a}${b} END), 2)`;
}

/**
 * Талант-пул региона (Эпик 5, FR18) — игроки, ранжированные по среднему
 * индексу эффективности (ratings.overall, 0–10) из match_players. Фильтр по
 * минимуму минут. Гейт согласия (FR19): имя отдаётся только при data_consent;
 * без согласия игрок участвует в рейтинге обезличенно (club/возраст/позиция).
 * Дедуп между клубами пока не делается — игрок за 2 клуба возможен дважды (TODO F2+).
 */
export async function federationTalentPool(conn: PoolClient, minMinutes: number): Promise<FederationPlayerRow[]> {
  const q = await conn.query<{
    name: string | null; club: string; age_group: string; position: string | null;
    matches: number; minutes: number; rating: string | null;
    attack: string | null; defence: string | null; passing: string | null;
    fitness: string | null; creativity: string | null;
  }>(
    `SELECT
       CASE WHEN p.data_consent THEN p.full_name ELSE NULL END AS name,
       t.display_name AS club,
       tm.age_group,
       p.position,
       count(mp.match_id)::int AS matches,
       coalesce(sum(mp.minutes), 0)::int AS minutes,
       round(avg((mp.ratings->>'overall')::numeric), 2) AS rating,
       ${avgRatingExpr('mp.ratings', 'attack', 'attacking')} AS attack,
       ${avgRatingExpr('mp.ratings', 'defence', 'defending')} AS defence,
       ${avgRatingExpr('mp.ratings', 'passing')} AS passing,
       ${avgRatingExpr('mp.ratings', 'fitness')} AS fitness,
       ${avgRatingExpr('mp.ratings', 'creativity')} AS creativity
     FROM players p
     JOIN teams tm ON tm.id = p.team_id
     JOIN tenants t ON t.slug = p.tenant_id
     LEFT JOIN match_players mp ON mp.player_id = p.id AND jsonb_typeof(mp.ratings->'overall') = 'number'
     WHERE ${fedMembershipFilter('p.tenant_id')}
     GROUP BY p.id, p.full_name, p.data_consent, t.display_name, tm.age_group, p.position
     HAVING round(avg((mp.ratings->>'overall')::numeric), 2) IS NOT NULL
        AND coalesce(sum(mp.minutes), 0) >= $1
     ORDER BY rating DESC NULLS LAST
     LIMIT 200`,
    [minMinutes],
  );
  const n = (v: string | null) => (v == null ? null : Number(v));
  return q.rows.map((r) => ({
    name: r.name ?? null,
    club: r.club,
    ageGroup: r.age_group,
    position: r.position ?? null,
    matches: Number(r.matches),
    minutes: Number(r.minutes),
    rating: n(r.rating),
    attack: n(r.attack),
    defence: n(r.defence),
    passing: n(r.passing),
    fitness: n(r.fitness),
    creativity: n(r.creativity),
  }));
}

export interface FederationRegionProfile {
  /** Профиль качества региона по 6 измерениям (среднее team_avg_ratings по матчам, 0–10). */
  ratings: {
    overall: number | null; attack: number | null; defence: number | null;
    passing: number | null; fitness: number | null; creativity: number | null;
  };
  /** Стиль игры региона — среднее за матч из team_aggregates (нашей команды). */
  style: {
    shots: number | null; shotsOnTarget: number | null; dribbles: number | null;
    keyPasses: number | null; progressivePasses: number | null;
    tackles: number | null; interceptions: number | null; recoveries: number | null;
    touchesInBox: number | null; accuratePasses: number | null; crosses: number | null; distanceKm: number | null;
  };
  matchesRated: number;
  matchesStyled: number;
}

/**
 * Профиль региона (реальная глубина) — 6-мерный рейтинг команд + стиль игры по
 * матчам клубов-членов. Рейтинги из matches.team_avg_ratings (готовое среднее
 * нашей команды по матчу); стиль из matches.team_aggregates (бэк нормализует к
 * НАШЕЙ команде — не home/away; ключи как в клубном утиле teamMatchMetrics.js).
 * Все касты под guard'ом jsonb_typeof — как в остальных агрегатах.
 */
export async function federationRegionProfile(conn: PoolClient): Promise<FederationRegionProfile> {
  const r = (await conn.query<{
    overall: string | null; attack: string | null; defence: string | null;
    passing: string | null; fitness: string | null; creativity: string | null; matches_rated: number;
  }>(
    `SELECT
       ${avgRatingExpr('team_avg_ratings', 'overall')} AS overall,
       ${avgRatingExpr('team_avg_ratings', 'attack', 'attacking')} AS attack,
       ${avgRatingExpr('team_avg_ratings', 'defence', 'defending')} AS defence,
       ${avgRatingExpr('team_avg_ratings', 'passing')} AS passing,
       ${avgRatingExpr('team_avg_ratings', 'fitness')} AS fitness,
       ${avgRatingExpr('team_avg_ratings', 'creativity')} AS creativity,
       count(*) FILTER (WHERE jsonb_typeof(team_avg_ratings->'overall')='number')::int AS matches_rated
     FROM matches
     WHERE ${FED_MEMBERSHIP_SQL} AND team_avg_ratings IS NOT NULL`,
  )).rows[0];

  // Значение поля team_aggregates: объект {value}/{pct} ИЛИ скаляр-число.
  const fv = (section: string, key: string) => {
    const node = `team_aggregates->'${section}'->'${key}'`;
    return `CASE
      WHEN jsonb_typeof(${node})='number' THEN (${node}#>>'{}')::numeric
      WHEN jsonb_typeof(${node}->'value')='number' THEN (${node}->>'value')::numeric
      WHEN jsonb_typeof(${node}->'pct')='number' THEN (${node}->>'pct')::numeric END`;
  };
  const s = (await conn.query<{
    shots: string | null; shots_on_target: string | null; dribbles: string | null;
    key_passes: string | null; progressive_passes: string | null;
    tackles: string | null; interceptions: string | null; recoveries: string | null;
    touches_in_box: string | null; accurate_passes: string | null; crosses: string | null;
    distance_km: string | null; matches_styled: number;
  }>(
    `SELECT
       round(avg(coalesce(${fv('shooting', 'shots')}, ${fv('shooting', 'totalShots')})), 1) AS shots,
       round(avg(${fv('shooting', 'onTarget')}), 1) AS shots_on_target,
       round(avg(${fv('attacks', 'dribble')}), 1) AS dribbles,
       round(avg(${fv('passes', 'keyPass')}), 1) AS key_passes,
       round(avg(${fv('passes', 'progressive')}), 1) AS progressive_passes,
       round(avg(coalesce(${fv('recoveriesAndTackling', 'tackle')}, ${fv('duels', 'totalDuels')})), 1) AS tackles,
       round(avg(coalesce(${fv('recoveriesAndTackling', 'interception')}, ${fv('positioning', 'interceptions')})), 1) AS interceptions,
       round(avg(${fv('recoveriesAndTackling', 'recovery')}), 1) AS recoveries,
       round(avg(${fv('attacks', 'touchesInBox')}), 1) AS touches_in_box,
       round(avg(${fv('passes', 'successful')}), 1) AS accurate_passes,
       round(avg(${fv('passes', 'crosses')}), 1) AS crosses,
       round(avg(${fv('fitness', 'totalDistance')}) / 1000, 1) AS distance_km,
       count(*) FILTER (WHERE team_aggregates IS NOT NULL)::int AS matches_styled
     FROM matches
     WHERE ${FED_MEMBERSHIP_SQL} AND team_aggregates IS NOT NULL`,
  )).rows[0];

  const n = (v: string | null | undefined) => (v == null ? null : Number(v));
  return {
    ratings: {
      overall: n(r?.overall), attack: n(r?.attack), defence: n(r?.defence),
      passing: n(r?.passing), fitness: n(r?.fitness), creativity: n(r?.creativity),
    },
    style: {
      shots: n(s?.shots), shotsOnTarget: n(s?.shots_on_target), dribbles: n(s?.dribbles),
      keyPasses: n(s?.key_passes), progressivePasses: n(s?.progressive_passes),
      tackles: n(s?.tackles), interceptions: n(s?.interceptions), recoveries: n(s?.recoveries),
      touchesInBox: n(s?.touches_in_box), accuratePasses: n(s?.accurate_passes), crosses: n(s?.crosses),
      distanceKm: n(s?.distance_km),
    },
    matchesRated: Number(r?.matches_rated ?? 0),
    matchesStyled: Number(s?.matches_styled ?? 0),
  };
}

export interface FederationProductivityRow {
  slug: string;
  name: string;
  /** Игроки с игровыми минутами (активная глубина). */
  activePlayers: number;
  totalMinutes: number;
  /** % минут у «молодых» — рождённых позже номинального года команды (играют на возраст старше). */
  youngPct: number | null;
}

/**
 * Продуктивность клубов (Эпик 6, FR22). Минуты молодых (игроки моложе
 * номинального года команды → играют «на возраст старше», признак развития) и
 * активная глубина состава. Год команды (teams.year) обязателен для расчёта
 * «молодых»; для нечисловых возрастов вклад в young_minutes = 0.
 */
export async function federationProductivity(conn: PoolClient): Promise<FederationProductivityRow[]> {
  const q = await conn.query<{
    slug: string; name: string; active_players: number; total_minutes: number; young_minutes: number;
  }>(
    `SELECT
       t.slug, t.display_name AS name,
       count(DISTINCT mp.player_id)::int AS active_players,
       coalesce(sum(mp.minutes), 0)::int AS total_minutes,
       coalesce(sum(mp.minutes) FILTER (
         WHERE tm.year IS NOT NULL AND p.birth_date IS NOT NULL
           AND extract(year from p.birth_date) > tm.year
       ), 0)::int AS young_minutes
     FROM tenants t
     JOIN players p ON p.tenant_id = t.slug
     JOIN teams tm ON tm.id = p.team_id
     JOIN match_players mp ON mp.player_id = p.id
     WHERE ${fedMembershipFilter('t.slug')}
     GROUP BY t.slug, t.display_name
     ORDER BY t.display_name`,
  );
  return q.rows.map((r) => {
    const total = Number(r.total_minutes);
    return {
      slug: r.slug,
      name: r.name,
      activePlayers: Number(r.active_players),
      totalMinutes: total,
      youngPct: total === 0 ? null : Math.round((Number(r.young_minutes) / total) * 100),
    };
  });
}

export interface FederationBenchmarkRow {
  slug: string;
  name: string;
  plan: string;
  players: number;
  matches: number;
  coverage: number | null;
  avgRating: number | null;
  attack: number | null;
  defence: number | null;
  passing: number | null;
}

/**
 * Бенчмаркинг клубов (Эпик 7, FR24) — сводка ключевых KPI на клуб для сравнения
 * и рэнкинга: игроки, матчи, охват данными, средний индекс эффективности.
 * Источник экспорта CSV (FR23, на фронте).
 */
export async function federationBenchmark(conn: PoolClient): Promise<FederationBenchmarkRow[]> {
  // Корр. подзапрос среднего рейтинга по клубу для измерения key (с алиасом).
  const clubRating = (key: string, alias?: string) =>
    `(SELECT round(avg(CASE WHEN jsonb_typeof(mp.ratings->'${key}')='number' THEN (mp.ratings->>'${key}')::numeric` +
    (alias ? ` WHEN jsonb_typeof(mp.ratings->'${alias}')='number' THEN (mp.ratings->>'${alias}')::numeric` : '') +
    ` END), 2) FROM match_players mp JOIN players p2 ON p2.id = mp.player_id WHERE p2.tenant_id = t.slug)`;
  const q = await conn.query<{
    slug: string; name: string; plan: string;
    players: number; matches: number; coverage: number | null; avg_rating: string | null;
    attack: string | null; defence: string | null; passing: string | null;
  }>(
    `SELECT
       t.slug, t.display_name AS name, t.plan,
       (SELECT count(*)::int FROM players p WHERE p.tenant_id = t.slug) AS players,
       (SELECT count(*)::int FROM matches m WHERE m.tenant_id = t.slug) AS matches,
       (SELECT round(avg((m.data_quality->>'score')::numeric))::int
          FROM matches m
         WHERE m.tenant_id = t.slug AND jsonb_typeof(m.data_quality->'score') = 'number') AS coverage,
       ${clubRating('overall')} AS avg_rating,
       ${clubRating('attack', 'attacking')} AS attack,
       ${clubRating('defence', 'defending')} AS defence,
       ${clubRating('passing')} AS passing
     FROM tenants t
     WHERE ${fedMembershipFilter('t.slug')}
     ORDER BY t.display_name`,
  );
  const n = (v: string | null) => (v == null ? null : Number(v));
  return q.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    plan: r.plan,
    players: Number(r.players),
    matches: Number(r.matches),
    coverage: r.coverage == null ? null : Number(r.coverage),
    avgRating: n(r.avg_rating),
    attack: n(r.attack),
    defence: n(r.defence),
    passing: n(r.passing),
  }));
}
