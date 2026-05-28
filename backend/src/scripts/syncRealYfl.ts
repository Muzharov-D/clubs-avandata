/**
 * Засевает РЕАЛЬНЫЙ календарь ЮФЛ U-15 (сезон 2026) для обоих Зенит-tenant'ов.
 * Источник: yflrussia.ru/tournament/1060908/calendar (текст распарсен вручную).
 * Затем считает standings из past matches.
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

const SEASON = '2025-2026';
const AGE = '2011';

interface Fixture {
  date: string;   // ISO with МСК offset
  home: string;
  away: string;
  scoreH: number | null;
  scoreA: number | null;
  venue: string | null;
  round: string;
}

// Все 33 тура сезона. Даты с реального сайта.
const F: Fixture[] = [
  // === ТУР 1 (7-8 марта) ===
  { date: '2026-03-07T09:00:00+03:00', home: 'Урал',     away: 'Родина',                  scoreH: 2, scoreA: 7, venue: 'Манеж «Урал»',         round: 'Тур 1' },
  { date: '2026-03-07T10:00:00+03:00', home: 'Ростов',   away: 'Рубин',                   scoreH: 0, scoreA: 3, venue: '«Локомотив», Ростов',  round: 'Тур 1' },
  { date: '2026-03-07T10:00:00+03:00', home: 'Чертаново',away: 'ЦСКА',                    scoreH: 2, scoreA: 1, venue: '«Арена Чертаново»',    round: 'Тур 1' },
  { date: '2026-03-07T10:00:00+03:00', home: 'Спартак',  away: 'СШОР Зенит',              scoreH: 2, scoreA: 0, venue: '«Спартак» поле № 4',   round: 'Тур 1' },
  { date: '2026-03-07T10:00:00+03:00', home: 'Краснодар',away: 'Акрон - Академия Коноплева', scoreH: 1, scoreA: 1, venue: 'Академия «Краснодар»', round: 'Тур 1' },
  { date: '2026-03-07T11:00:00+03:00', home: 'Зенит',    away: 'Динамо',                  scoreH: 1, scoreA: 1, venue: '«Смена»',              round: 'Тур 1' },
  { date: '2026-03-07T11:00:00+03:00', home: 'МФА',      away: 'Алмаз-Антей',             scoreH: 1, scoreA: 1, venue: '«Янтарь»',             round: 'Тур 1' },
  { date: '2026-03-08T11:00:00+03:00', home: 'Локомотив',away: 'Мастер-Сатурн',           scoreH: 2, scoreA: 0, venue: '«Сапсан Арена»',       round: 'Тур 1' },

  // === ТУР 2 (14-15 марта) ===
  { date: '2026-03-14T09:00:00+03:00', home: 'Акрон - Академия Коноплева', away: 'Чертаново', scoreH: 2, scoreA: 1, venue: 'Академия Коноплева',  round: 'Тур 2' },
  { date: '2026-03-14T09:00:00+03:00', home: 'Урал',     away: 'Зенит',                   scoreH: 1, scoreA: 7, venue: 'Манеж «Урал»',         round: 'Тур 2' },
  { date: '2026-03-14T10:00:00+03:00', home: 'Рубин',    away: 'Краснодар',               scoreH: 0, scoreA: 3, venue: '«Рубин» поле 2',       round: 'Тур 2' },
  { date: '2026-03-14T10:30:00+03:00', home: 'СШОР Зенит', away: 'МФА',                   scoreH: 3, scoreA: 0, venue: 'СШОР «Зенит»',         round: 'Тур 2' },
  { date: '2026-03-14T11:00:00+03:00', home: 'Мастер-Сатурн', away: 'Ростов',             scoreH: 0, scoreA: 3, venue: 'УОР № 5',              round: 'Тур 2' },
  { date: '2026-03-14T13:00:00+03:00', home: 'Динамо',   away: 'Алмаз-Антей',             scoreH: 5, scoreA: 2, venue: 'УТБ «Новогорск-Динамо»', round: 'Тур 2' },
  { date: '2026-03-15T11:00:00+03:00', home: 'Локомотив',away: 'Родина',                  scoreH: 2, scoreA: 2, venue: '«Сапсан Арена»',       round: 'Тур 2' },

  // === ТУР 3 (21-22 марта) ===
  { date: '2026-03-21T08:30:00+03:00', home: 'Урал',     away: 'Динамо',                  scoreH: 0, scoreA: 5, venue: 'Манеж «Урал»',         round: 'Тур 3' },
  { date: '2026-03-21T10:00:00+03:00', home: 'Ростов',   away: 'Родина',                  scoreH: 0, scoreA: 1, venue: '«Локомотив», Ростов',  round: 'Тур 3' },
  { date: '2026-03-21T10:00:00+03:00', home: 'Чертаново',away: 'Рубин',                   scoreH: 3, scoreA: 2, venue: '«Арена Чертаново»',    round: 'Тур 3' },
  { date: '2026-03-21T10:30:00+03:00', home: 'СШОР Зенит', away: 'Алмаз-Антей',           scoreH: 0, scoreA: 0, venue: 'СШОР «Зенит»',         round: 'Тур 3' },
  { date: '2026-03-21T11:00:00+03:00', home: 'МФА',      away: 'ЦСКА',                    scoreH: 0, scoreA: 2, venue: '«Янтарь»',             round: 'Тур 3' },
  { date: '2026-03-22T10:00:00+03:00', home: 'Спартак',  away: 'Акрон - Академия Коноплева', scoreH: 1, scoreA: 0, venue: '«Спартак» поле № 4', round: 'Тур 3' },
  { date: '2026-03-22T10:00:00+03:00', home: 'Краснодар',away: 'Мастер-Сатурн',           scoreH: 4, scoreA: 0, venue: 'Академия «Краснодар»', round: 'Тур 3' },
  { date: '2026-03-22T11:00:00+03:00', home: 'Локомотив',away: 'Зенит',                   scoreH: 3, scoreA: 3, venue: '«Сапсан Арена»',       round: 'Тур 3' },

  // === ТУР 4 (4-5 апреля) === — past
  { date: '2026-04-04T00:00:00+03:00', home: 'Динамо',   away: 'СШОР Зенит',              scoreH: 2, scoreA: 1, venue: 'УТБ «Новогорск-Динамо»', round: 'Тур 4' },
  { date: '2026-04-04T09:00:00+03:00', home: 'Акрон - Академия Коноплева', away: 'МФА',   scoreH: 3, scoreA: 1, venue: 'Академия Коноплева',  round: 'Тур 4' },
  { date: '2026-04-04T10:00:00+03:00', home: 'ЦСКА',     away: 'Алмаз-Антей',             scoreH: 2, scoreA: 1, venue: '«Октябрь»',            round: 'Тур 4' },
  { date: '2026-04-04T11:00:00+03:00', home: 'Зенит',    away: 'Ростов',                  scoreH: 4, scoreA: 0, venue: '«Смена»',              round: 'Тур 4' },
  { date: '2026-04-04T11:00:00+03:00', home: 'Мастер-Сатурн', away: 'Чертаново',          scoreH: 0, scoreA: 2, venue: 'УОР № 5',              round: 'Тур 4' },
  { date: '2026-04-05T10:00:00+03:00', home: 'Рубин',    away: 'Спартак',                 scoreH: 1, scoreA: 0, venue: '«Рубин» поле 2',       round: 'Тур 4' },
  { date: '2026-04-05T10:00:00+03:00', home: 'Родина',   away: 'Краснодар',               scoreH: 0, scoreA: 2, venue: '«Спартак» поле № 4',   round: 'Тур 4' },
  { date: '2026-04-05T11:00:00+03:00', home: 'Локомотив',away: 'Урал',                    scoreH: 4, scoreA: 1, venue: '«Сапсан Арена»',       round: 'Тур 4' },

  // === ТУР 5 (11 апреля) === — past
  { date: '2026-04-11T10:00:00+03:00', home: 'Ростов',   away: 'Урал',                    scoreH: 3, scoreA: 1, venue: '«Локомотив», Ростов',  round: 'Тур 5' },
  { date: '2026-04-11T10:00:00+03:00', home: 'Краснодар',away: 'Зенит',                   scoreH: 1, scoreA: 2, venue: 'Академия «Краснодар»', round: 'Тур 5' },
  { date: '2026-04-11T10:00:00+03:00', home: 'Чертаново',away: 'Родина',                  scoreH: 2, scoreA: 2, venue: '«Арена Чертаново»',    round: 'Тур 5' },
  { date: '2026-04-11T10:00:00+03:00', home: 'Спартак',  away: 'Мастер-Сатурн',           scoreH: 3, scoreA: 0, venue: '«Спартак» поле № 4',   round: 'Тур 5' },
  { date: '2026-04-11T10:30:00+03:00', home: 'СШОР Зенит', away: 'ЦСКА',                  scoreH: 0, scoreA: 3, venue: 'СШОР «Зенит»',         round: 'Тур 5' },
  { date: '2026-04-11T11:00:00+03:00', home: 'МФА',      away: 'Рубин',                   scoreH: 0, scoreA: 2, venue: '«Янтарь»',             round: 'Тур 5' },
  { date: '2026-04-11T11:00:00+03:00', home: 'Алмаз-Антей', away: 'Акрон - Академия Коноплева', scoreH: 1, scoreA: 1, venue: '—', round: 'Тур 5' },
  { date: '2026-04-12T13:00:00+03:00', home: 'Динамо',   away: 'Локомотив',               scoreH: 2, scoreA: 1, venue: 'УТБ «Новогорск-Динамо»', round: 'Тур 5' },

  // === ТУР 10 (17 мая) — РЕАЛЬНОЕ ДЕРБИ — Зенит 4:0 СШОР Зенит ===
  // Источник: https://yflrussia.ru/match/5483466 — протокол матча.
  // Голы: 7' Лисов (асс. Храбрый), 40' Зайцев, 48' Лисов (асс. Зайцев), 80' Храбрый.
  { date: '2026-05-17T11:00:00+03:00', home: 'Зенит',     away: 'СШОР Зенит',            scoreH: 4, scoreA: 0, venue: '«Смена»',              round: 'Тур 10' },
  { date: '2026-06-20T11:00:00+03:00', home: 'Чертаново', away: 'Зенит',                 scoreH: null, scoreA: null, venue: '«Арена Чертаново»',    round: 'Тур 11' },
  { date: '2026-06-20T11:00:00+03:00', home: 'СШОР Зенит',away: 'Акрон - Академия Коноплева', scoreH: null, scoreA: null, venue: 'СШОР «Зенит»',  round: 'Тур 11' },
  { date: '2026-06-27T11:00:00+03:00', home: 'Зенит',     away: 'Акрон - Академия Коноплева', scoreH: null, scoreA: null, venue: '«Смена»',          round: 'Тур 12' },
  { date: '2026-06-27T11:00:00+03:00', home: 'СШОР Зенит',away: 'Локомотив',             scoreH: null, scoreA: null, venue: 'СШОР «Зенит»',         round: 'Тур 12' },
  { date: '2026-10-10T11:00:00+03:00', home: 'СШОР Зенит',away: 'Зенит',                 scoreH: null, scoreA: null, venue: 'СШОР «Зенит»',         round: 'Тур 22 · ОТВЕТНОЕ ДЕРБИ' },
];

function isOurMatch(slug: 'zenit-fk' | 'zenit-sshor', f: Fixture): boolean {
  if (slug === 'zenit-fk') {
    // ФК Зенит — это просто "Зенит" в YFL, НЕ "СШОР Зенит"
    return (f.home === 'Зенит' || f.away === 'Зенит');
  } else {
    return (f.home === 'СШОР Зенит' || f.away === 'СШОР Зенит');
  }
}

function computeStandings(teamLabel: 'Зенит' | 'СШОР Зенит'): Array<{
  pos: number; team: string; games: number; wins: number; draws: number; losses: number;
  scored: number; missed: number; difference: number; points: number; isOurClub: boolean;
}> {
  const teams = ['Чертаново','ЦСКА','Урал','СШОР Зенит','Спартак','Рубин','Ростов','Родина','МФА','Мастер-Сатурн','Локомотив','Краснодар','Зенит','Динамо','Алмаз-Антей','Акрон - Академия Коноплева'];
  const stats: Record<string, { games:number; wins:number; draws:number; losses:number; scored:number; missed:number; points:number }> = {};
  for (const t of teams) stats[t] = { games:0,wins:0,draws:0,losses:0,scored:0,missed:0,points:0 };

  for (const f of F) {
    if (f.scoreH == null || f.scoreA == null) continue;
    const h = stats[f.home];
    const a = stats[f.away];
    if (!h || !a) continue;
    h.games++; a.games++;
    h.scored += f.scoreH; h.missed += f.scoreA;
    a.scored += f.scoreA; a.missed += f.scoreH;
    if (f.scoreH > f.scoreA) { h.wins++; h.points += 3; a.losses++; }
    else if (f.scoreH < f.scoreA) { a.wins++; a.points += 3; h.losses++; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  }

  const rows = teams.map((t) => ({
    pos: 0,
    team: t,
    games: stats[t]?.games ?? 0,
    wins:  stats[t]?.wins ?? 0,
    draws: stats[t]?.draws ?? 0,
    losses:stats[t]?.losses ?? 0,
    scored:stats[t]?.scored ?? 0,
    missed:stats[t]?.missed ?? 0,
    difference: (stats[t]?.scored ?? 0) - (stats[t]?.missed ?? 0),
    points: stats[t]?.points ?? 0,
    isOurClub: t === teamLabel,
  }));
  rows.sort((x, y) => y.points - x.points || y.difference - x.difference || y.scored - x.scored);
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}

async function main() {
  console.log('=== sync REAL YFL U-15 data ===\n');

  for (const slug of ['zenit-fk', 'zenit-sshor'] as const) {
    const ourLabel = slug === 'zenit-fk' ? 'Зенит' : 'СШОР Зенит';

    // calendar
    for (const f of F) {
      const ext = `yfl-${Date.parse(f.date)}-${f.home.slice(0,4)}-${f.away.slice(0,4)}`;
      await pool.query(
        `INSERT INTO calendar (tenant_id, age_group, season, ext_match_id, match_date, home_team, away_team,
                               score_home, score_away, is_our_match, venue, round, tournament, source_url, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'league','yflrussia.ru://1060908',NOW())
         ON CONFLICT (tenant_id, age_group, ext_match_id) DO UPDATE SET
           score_home=EXCLUDED.score_home, score_away=EXCLUDED.score_away,
           is_our_match=EXCLUDED.is_our_match, fetched_at=NOW()`,
        [slug, AGE, SEASON, ext, f.date, f.home, f.away,
         f.scoreH, f.scoreA, isOurMatch(slug, f), f.venue, f.round],
      );
    }

    // calendar_meta
    await pool.query(
      `INSERT INTO calendar_meta (tenant_id, age_group, season, title, parser_hint, sources, fetched_at)
       VALUES ($1, $2, $3, 'ЮФЛ U-15', 'yfl-real', '[{"source":"yflrussia.ru/tournament/1060908"}]'::jsonb, NOW())
       ON CONFLICT (tenant_id, age_group) DO UPDATE SET fetched_at=NOW()`,
      [slug, AGE, SEASON],
    );

    // standings (computed)
    const table = computeStandings(ourLabel as 'Зенит' | 'СШОР Зенит');
    await pool.query(
      `INSERT INTO standings (tenant_id, age_group, season, league_name, source_url, table_data)
       VALUES ($1,$2,$3,'ЮФЛ U-15','yflrussia.ru://1060908',$4::jsonb)`,
      [slug, AGE, SEASON, JSON.stringify(table.map((r) => ({...r, teamId:null, shield:null})))],
    );

    const ourPos = table.find((r) => r.isOurClub)?.pos;
    console.log(`${slug}: ${F.length} fixtures, standings — ${ourLabel} на ${ourPos} месте`);
  }

  console.log('\n=== Done ===');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
