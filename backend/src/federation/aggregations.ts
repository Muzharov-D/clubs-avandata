import type { PoolClient } from 'pg';
import { FED_MEMBERSHIP_SQL } from './membership.js';

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
