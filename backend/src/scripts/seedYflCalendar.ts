/**
 * Сид календаря ЮФЛ U-15 (турнир 1060908) из РЕАЛЬНЫХ данных yflrussia.ru.
 *
 * Источник данных: backend/src/scripts/data/yfl-1060908.json — 240 фикстур,
 * извлечённых из календаря yflrussia.ru через браузер (сайт за WAF SafeLine,
 * серверный curl блокируется; платформа — JoinSport, st.joinsport.io).
 * Извлечение (повторяемо): открыть yflrussia.ru/tournament/1060908/calendar,
 * пройтись по li.timetable__item — .timetable__time / .timetable__place-name /
 * a.timetable__team (team_id в href = JoinSport id) / .timetable__score-main /
 * .timetable__round; даты в DOM строчными (CSS uppercase).
 *
 * Сеет для обоих Зенит-tenant'ов (zenit-fk = «Зенит», zenit-sshor = «СШОР Зенит»):
 * полный календарь + calendar_meta + standings (считаются из сыгранных матчей).
 * Перед заливкой ОЧИЩАЕТ старый календарь age=2011 (старый seed был неполным/хардкод).
 *
 * Запуск: cd backend && npx tsx src/scripts/seedYflCalendar.ts
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASON = '2025-2026';
const AGE = '2011';

interface Fx {
  date: string; time: string | null; venue: string | null;
  homeName: string; homeId: string | null; awayName: string; awayId: string | null;
  scoreH: number | null; scoreA: number | null; tour: number | null;
}

const FIXTURES: Fx[] = JSON.parse(
  readFileSync(join(__dirname, 'data', 'yfl-1060908.json'), 'utf-8'),
);

const TENANTS: Array<{ slug: string; label: string }> = [
  { slug: 'zenit-fk', label: 'Зенит' },
  { slug: 'zenit-sshor', label: 'СШОР Зенит' },
];

function matchDateIso(f: Fx): string {
  const t = f.time && /^\d{2}:\d{2}$/.test(f.time) ? f.time : '00:00';
  return `${f.date}T${t}:00+03:00`; // МСК
}

function computeStandings(ourLabel: string) {
  const teams = [...new Set(FIXTURES.flatMap((f) => [f.homeName, f.awayName]))];
  const s: Record<string, { g: number; w: number; d: number; l: number; sc: number; ms: number; p: number }> = {};
  for (const t of teams) s[t] = { g: 0, w: 0, d: 0, l: 0, sc: 0, ms: 0, p: 0 };
  for (const f of FIXTURES) {
    if (f.scoreH == null || f.scoreA == null) continue;
    const h = s[f.homeName]; const a = s[f.awayName];
    if (!h || !a) continue;
    h.g++; a.g++; h.sc += f.scoreH; h.ms += f.scoreA; a.sc += f.scoreA; a.ms += f.scoreH;
    if (f.scoreH > f.scoreA) { h.w++; h.p += 3; a.l++; }
    else if (f.scoreH < f.scoreA) { a.w++; a.p += 3; h.l++; }
    else { h.d++; a.d++; h.p++; a.p++; }
  }
  const rows = teams.map((t) => {
    const st = s[t]!;
    return {
      pos: 0, team: t, games: st.g, wins: st.w, draws: st.d, losses: st.l,
      scored: st.sc, missed: st.ms, difference: st.sc - st.ms, points: st.p,
      isOurClub: t === ourLabel, teamId: null, shield: null,
    };
  });
  rows.sort((x, y) => y.points - x.points || y.difference - x.difference || y.scored - x.scored);
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}

async function main() {
  console.log(`=== seed YFL calendar (1060908): ${FIXTURES.length} fixtures ===\n`);
  for (const { slug, label } of TENANTS) {
    // Чистим старый (неполный) календарь, чтобы не осталось stale-строк с другими ext_match_id.
    await pool.query(`DELETE FROM calendar WHERE tenant_id = $1 AND age_group = $2`, [slug, AGE]);
    await pool.query(`DELETE FROM standings WHERE tenant_id = $1 AND age_group = $2`, [slug, AGE]);

    let ours = 0;
    for (const f of FIXTURES) {
      const isOur = f.homeName === label || f.awayName === label;
      if (isOur) ours++;
      const ext = `yfl-t${f.tour}-${f.homeId ?? f.homeName}-${f.awayId ?? f.awayName}`;
      await pool.query(
        `INSERT INTO calendar (
           tenant_id, age_group, season, ext_match_id, match_date, home_team, away_team,
           ext_home_team_id, ext_away_team_id, score_home, score_away, is_our_match,
           venue, round, tournament, source_url, fetched_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'league','yflrussia.ru://1060908',NOW())
         ON CONFLICT (tenant_id, age_group, ext_match_id) DO UPDATE SET
           match_date=EXCLUDED.match_date, score_home=EXCLUDED.score_home,
           score_away=EXCLUDED.score_away, is_our_match=EXCLUDED.is_our_match,
           venue=EXCLUDED.venue, round=EXCLUDED.round, fetched_at=NOW()`,
        [slug, AGE, SEASON, ext, matchDateIso(f), f.homeName, f.awayName,
         f.homeId, f.awayId, f.scoreH, f.scoreA, isOur, f.venue,
         f.tour != null ? `Тур ${f.tour}` : null],
      );
    }

    await pool.query(
      `INSERT INTO calendar_meta (tenant_id, age_group, season, title, parser_hint, sources, fetched_at)
       VALUES ($1,$2,$3,'ЮФЛ U-15','yfl-browser','[{"source":"yflrussia.ru/tournament/1060908"}]'::jsonb,NOW())
       ON CONFLICT (tenant_id, age_group) DO UPDATE SET
         season=EXCLUDED.season, parser_hint=EXCLUDED.parser_hint, sources=EXCLUDED.sources, fetched_at=NOW()`,
      [slug, AGE, SEASON],
    );

    const table = computeStandings(label);
    await pool.query(
      `INSERT INTO standings (tenant_id, age_group, season, league_name, source_url, table_data)
       VALUES ($1,$2,$3,'ЮФЛ U-15','yflrussia.ru://1060908',$4::jsonb)`,
      [slug, AGE, SEASON, JSON.stringify(table)],
    );
    const pos = table.find((r) => r.isOurClub)?.pos;
    console.log(`${slug}: ${FIXTURES.length} матчей (наших: ${ours}), ${label} — ${pos} место`);
  }
  console.log('\n=== Done ===');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
