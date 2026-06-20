/**
 * Онбординг ОДНОГО клуба из FFSPB в готовый tenant-кабинет (стратегия B —
 * машина роста сети данных: каждый новый клуб усиливает региональные бенчмарки).
 *
 * Создаёт за один запуск: tenant + главного тренера + команды + РОСТЕРЫ игроков
 * (с датой рождения → «карта потерь»/RAE) + календарь матчей + турнирную таблицу.
 * Переиспользует проверенные сервисы (calendarService, standingsService,
 * playerPhotoService); добавляет недостающее — заливку ростера в players.
 *
 * Источник — официальный FFSPB API (нужен FFSPB_API_KEY + доступ к stat.ffspb.org;
 * с Render IP-блок → запускать локально / где есть доступ). Идемпотентен (UPSERT).
 *
 * СОЗНАТЕЛЬНО один клуб за запуск — НЕ bulk-загрузчик (уважает «масс-залив
 * автоблокирован»): один --slug, без цикла по клубам, без CSV/stdin. Ещё клуб —
 * отдельный осознанный запуск.
 *
 * FFSPB не имеет сущности «клуб»: команда = (tournamentId, ffspbTeamId). Маппинг
 * команд клуба задаёт оператор (id видны на stat.ffspb.org/tournament<T>/team<X>):
 *   --teams="<age>:<tournamentId>:<ffspbTeamId>[:<cupTournamentId>], ..."
 *
 * Запуск:
 *   cd backend && npx tsx src/scripts/onboardClub.ts \
 *     --slug=legirus --name="Легирус" \
 *     --hc-email=coach@legirus.ru --hc-name="Главный тренер" \
 *     --teams="2010:44324:420631,2011:44325:420632"
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { pool } from '../db/client.js';
import { withTenant, withBypassRLS } from '../db/tenantContext.js';
import { listTeamPlayers, isFfspbConfigured } from '../services/ffspbApi.js';
import { syncTenantCalendarTournament } from '../services/calendarService.js';
import { syncTenantStandings } from '../services/standingsService.js';
import { syncTenantMatchParticipation } from '../services/participationService.js';
import {
  ffspbFullName,
  extractBirthDate,
  extractPositionFull,
  shortPosition,
  extractPhoto,
} from '../services/playerPhotoService.js';

// ---- CLI ----------------------------------------------------------------
function arg(name: string): string | undefined {
  const pre = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pre));
  return hit ? hit.slice(pre.length) : undefined;
}
function req(name: string): string {
  const v = arg(name);
  if (!v) { console.error(`onboardClub: обязателен --${name}=...`); process.exit(1); }
  return v;
}

interface TeamSpec {
  ageGroup: string;       // '2010'
  tournamentId: string;   // FFSPB турнир лиги (матчи + таблица)
  ffspbTeamId: string;    // FFSPB id команды (ростер игроков)
  cupId: string | null;   // опц. FFSPB турнир кубка (матчи)
}

function parseTeams(raw: string): TeamSpec[] {
  const specs: TeamSpec[] = [];
  for (const chunk of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [age, tid, team, cup] = chunk.split(':').map((s) => s.trim());
    if (!age || !tid || !team) {
      throw new Error(`плохой формат команды "${chunk}" — нужно age:tournamentId:ffspbTeamId[:cupId]`);
    }
    specs.push({ ageGroup: age, tournamentId: tid, ffspbTeamId: team, cupId: cup || null });
  }
  if (!specs.length) throw new Error('--teams пуст');
  return specs;
}

// ---- Заливка ростера в players (недостающий кусок) ----------------------
// Игроки тянутся ПО НАШЕЙ команде (ffspbTeamId) — значит все они наши. Дата
// рождения здесь критична: на ней строится «карта потерь»/RAE. Под withTenant
// (RLS пускает строки, где tenant_id = app.tenant_id) — как в calendarService.
async function ingestRoster(slug: string, teamId: string, ffspbTeamId: string): Promise<number> {
  const roster = (await listTeamPlayers(ffspbTeamId)) as Array<Record<string, unknown>>;
  let n = 0;
  await withTenant(slug, async (_tx, conn) => {
    for (const p of roster) {
      const pid = p.id;
      if (pid == null) continue;
      const full = ffspbFullName(p);
      if (!full) continue;
      const positionFull = extractPositionFull(p);
      const position = shortPosition(positionFull);
      const birthDate = extractBirthDate(p);
      const photo = extractPhoto(p);
      const firstName = typeof p.firstName === 'string' ? p.firstName : null;
      const lastName =
        typeof p.surname === 'string' ? p.surname
        : typeof p.lastName === 'string' ? p.lastName
        : null;
      const numRaw = Number(p.number ?? p.gameNumber ?? p.playerNumber ?? NaN);
      const number = Number.isFinite(numRaw) ? numRaw : null;

      await conn.query(
        `INSERT INTO players
           (id, tenant_id, team_id, full_name, first_name, last_name, number,
            position, position_full, birth_date, photo_url, external_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           team_id       = EXCLUDED.team_id,
           full_name     = EXCLUDED.full_name,
           first_name    = COALESCE(EXCLUDED.first_name,    players.first_name),
           last_name     = COALESCE(EXCLUDED.last_name,     players.last_name),
           number        = COALESCE(EXCLUDED.number,        players.number),
           position      = COALESCE(EXCLUDED.position,      players.position),
           position_full = COALESCE(EXCLUDED.position_full, players.position_full),
           birth_date    = COALESCE(EXCLUDED.birth_date,    players.birth_date),
           photo_url     = COALESCE(players.photo_url,      EXCLUDED.photo_url),
           external_ids  = players.external_ids || EXCLUDED.external_ids`,
        [
          `ext-ffspb-${pid}`, slug, teamId, full, firstName, lastName, number,
          position, positionFull, birthDate, photo, JSON.stringify({ ffspb: String(pid) }),
        ],
      );
      n++;
    }
  });
  return n;
}

// ---- Main ---------------------------------------------------------------
async function main() {
  const slug = req('slug');
  const name = req('name');
  const hcEmail = req('hc-email');
  const teamsRaw = req('teams');

  const displayName = arg('display-name') ?? name;
  const matcher = arg('matcher') ?? name;          // подстрока для «наш матч/наша строка таблицы»
  const season = arg('season') ?? '2025-2026';
  const hcName = arg('hc-name') ?? 'Главный тренер';
  const password = arg('hc-password') ?? `${slug}-${randomBytes(3).toString('hex')}`;

  if (!isFfspbConfigured()) { console.error('FFSPB_API_KEY не задан в .env'); process.exit(1); }
  const teams = parseTeams(teamsRaw);

  console.log(`=== Онбординг клуба «${name}» (${slug}) ===`);
  console.log(`команды: ${teams.map((t) => `${t.ageGroup}→тур ${t.tournamentId}/команда ${t.ffspbTeamId}`).join(', ')}\n`);

  // 1) tenant + главный тренер + команды — под bypass RLS (admin-операция).
  const providerConfig = {
    season,
    ourMatcher: matcher,
    tournaments: Object.fromEntries(
      teams.map((t) => [t.ageGroup, { ffspbTeamId: t.ffspbTeamId, leagueId: t.tournamentId, cupId: t.cupId }]),
    ),
  };
  await withBypassRLS(async (_tx, conn) => {
    await conn.query(
      `INSERT INTO tenants (slug, name, display_name, status, brand, data_provider, provider_config, plan)
       VALUES ($1,$2,$3,'active',$4::jsonb,'ffspb',$5::jsonb,'free')
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, display_name = EXCLUDED.display_name,
         data_provider = EXCLUDED.data_provider, provider_config = EXCLUDED.provider_config,
         updated_at = NOW()`,
      [slug, name, displayName, JSON.stringify({ titleSuffix: displayName }), JSON.stringify(providerConfig)],
    );
    const passwordHash = await argon2.hash(password);
    await conn.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4,$5,'head_coach')
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name`,
      [`u-${slug}-hc`, slug, hcEmail, passwordHash, hcName],
    );
    for (const t of teams) {
      await conn.query(
        `INSERT INTO teams (id, tenant_id, name, age_group, year, is_our_team, active)
         VALUES ($1,$2,$3,$4,$5,TRUE,TRUE)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, age_group = EXCLUDED.age_group`,
        [`${slug}-${t.ageGroup}`, slug, `${name} ${t.ageGroup}`, t.ageGroup, Number(t.ageGroup) || null],
      );
    }
  });
  console.log(`  ✓ tenant + тренер (${hcEmail}) + ${teams.length} команд`);

  // 2) по каждой команде: ростер игроков + календарь (+кубок) + таблица.
  let totalPlayers = 0;
  let totalMatches = 0;
  let totalStatRows = 0;
  for (const t of teams) {
    const teamId = `${slug}-${t.ageGroup}`;
    const np = await ingestRoster(slug, teamId, t.ffspbTeamId);
    totalPlayers += np;

    const cal = await syncTenantCalendarTournament({
      tenantSlug: slug, ageGroup: t.ageGroup, season,
      tournamentId: t.tournamentId, tournament: 'league', ourMatcher: matcher,
    });
    if (cal.ok) totalMatches += cal.count ?? 0;

    if (t.cupId) {
      await syncTenantCalendarTournament({
        tenantSlug: slug, ageGroup: t.ageGroup, season,
        tournamentId: t.cupId, tournament: 'cup', ourMatcher: matcher,
      });
    }

    const st = await syncTenantStandings({
      tenantSlug: slug, ageGroup: t.ageGroup, tournamentId: t.tournamentId, season, ourMatcher: matcher,
    });

    // Поминутное участие (matches + match_players.minutes) — топливо карты потерь/RAE.
    const part = await syncTenantMatchParticipation({
      tenantSlug: slug, ageGroup: t.ageGroup, teamId, ffspbTeamId: t.ffspbTeamId,
      tournamentId: t.tournamentId, tournament: 'league', season,
    });
    if (part.ok) totalStatRows += part.playerRows ?? 0;
    if (t.cupId) {
      const partCup = await syncTenantMatchParticipation({
        tenantSlug: slug, ageGroup: t.ageGroup, teamId, ffspbTeamId: t.ffspbTeamId,
        tournamentId: t.cupId, tournament: 'cup', season,
      });
      if (partCup.ok) totalStatRows += partCup.playerRows ?? 0;
    }

    console.log(
      `  ${teamId}: игроков ${np} · матчи ${cal.ok ? cal.count : 'СБОЙ(' + cal.error + ')'}` +
      ` · участие ${part.ok ? `${part.matches}м/${part.playerRows}строк` : 'СБОЙ(' + part.error + ')'}` +
      ` · таблица ${st.ok ? st.teamsCount : 'СБОЙ(' + st.error + ')'}`,
    );
  }

  console.log(`\n✓ Клуб «${name}» заведён: ${teams.length} команд, ${totalPlayers} игроков, ${totalMatches} матчей лиги, ${totalStatRows} строк участия (минуты → карта потерь).`);
  console.log(`  Вход тренера: ${hcEmail} / ${password}`);
  console.log(`  Спортдиректора/тренеров команд добавить: npm run seed:sporting-director / seed:coach (tenant=${slug}).`);

  await pool.end();
}

main().catch((err) => { console.error('onboardClub упал:', err); process.exit(1); });
