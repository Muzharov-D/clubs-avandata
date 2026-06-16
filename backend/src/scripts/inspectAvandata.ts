/**
 * Разведка привязки к АванДата-бэкенду (back.avandata.ru) — ТОЛЬКО ЧТЕНИЕ, без
 * записи в нашу БД. Логинится, проходит каталог (сезоны/турниры/дивизионы), ищет
 * тур с разобранными матчами (analyzedMatches > 0) и печатает реальную форму
 * данных игроков — чтобы спроектировать импорт. Запуск:
 *   AVANDATA_EMAIL=... AVANDATA_PASSWORD=... npx tsx src/scripts/inspectAvandata.ts
 */
import {
  isAvandataConfigured, getSeasons, getTourStatistics, getMatches,
  getPlayersByRole, getPlayersByEventType,
} from '../services/avandataApi.js';

function trunc(v: unknown, n = 1400): string {
  const s = JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + ' …(+' + (s.length - n) + ')' : s;
}

async function main(): Promise<void> {
  if (!isAvandataConfigured()) {
    console.error('Заданы AVANDATA_EMAIL/PASSWORD? Сейчас — нет. Прерываю.');
    process.exit(1);
  }
  const seasons = await getSeasons();
  console.log(`\n=== СЕЗОНЫ (${seasons.length}) ===`);
  for (const s of seasons) {
    console.log(`• сезон ${s.id} «${s.title}» (${s.year}) — турниров: ${s.tournaments.length}`);
    for (const t of s.tournaments) {
      const divs = t.divisions.map((d) => `${d.title}#${d.id}(туров ${d.lastPlayedTour}/${d.toursCount})`).join(', ');
      console.log(`   └ турнир ${t.id} ${t.category} «${t.title.slice(0, 48)}…» г.р. ${t.dateBirthFrom}-${t.dateBirthTo} | ${divs}`);
    }
  }

  // Ищем первый тур с разобранными матчами.
  console.log(`\n=== ПОИСК РАЗОБРАННЫХ ТУРОВ ===`);
  let found: { seasonId: number; tournamentId: number; divisionId: number; tour: number } | null = null;
  let scanned = 0;
  outer:
  for (const s of seasons) {
    for (const t of s.tournaments) {
      for (const d of t.divisions) {
        for (let tour = 1; tour <= Math.max(1, d.lastPlayedTour); tour++) {
          if (scanned++ > 60) break outer; // лимит разведки
          try {
            const st = await getTourStatistics(t.id, d.id, tour);
            if (st.analyzedMatches > 0) {
              console.log(`  ✓ РАЗОБРАН: турнир ${t.id} «${t.title.slice(0, 30)}…» / ${d.title} / тур ${tour} → matches ${st.totalMatches}, analyzed ${st.analyzedMatches}, players ${st.totalPlayersPlayed}`);
              found = { seasonId: s.id, tournamentId: t.id, divisionId: d.id, tour };
              break outer;
            }
          } catch (e) {
            console.log(`  · ${t.id}/${d.id}/тур${tour}: ${(e as Error).message.slice(0, 80)}`);
          }
        }
      }
    }
  }

  if (!found) {
    console.log('\nРазобранных матчей не нашёл в пределах лимита — игроки наполняются только на analyzed-турах.');
    return;
  }

  console.log(`\n=== ФОРМА ДАННЫХ НА РАЗОБРАННОМ ТУРЕ ${JSON.stringify(found)} ===`);
  const matches = await getMatches(found.tournamentId, found.divisionId, found.tour);
  console.log(`\n[МАТЧИ] (${matches.length}) пример:\n` + trunc(matches[0]));
  const byRole = await getPlayersByRole(found.seasonId, found.tournamentId, found.divisionId, found.tour);
  console.log(`\n[ИГРОКИ by-role]:\n` + trunc(byRole));
  const byEvent = await getPlayersByEventType(found.seasonId, found.tournamentId, found.divisionId, found.tour);
  console.log(`\n[ИГРОКИ by-event-type]:\n` + trunc(byEvent));
}

main().then(() => process.exit(0)).catch((e) => { console.error('ОШИБКА:', e); process.exit(1); });
