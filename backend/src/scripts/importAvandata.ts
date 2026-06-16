/**
 * Импорт «моей базы» (back.avandata.ru) в кабинет — DRY-RUN: читает каталог,
 * собирает клубы/команды/матчи/игроков, маппит в нашу схему (ext-avandata-{id})
 * и ПЕЧАТАЕТ, что зальётся. НИЧЕГО НЕ ПИШЕТ в БД.
 *
 * Запуск (ключ берётся из backend/.env):
 *   npx tsx src/scripts/importAvandata.ts            # сезон 2026 (id 2)
 *   npx tsx src/scripts/importAvandata.ts 3          # другой сезон
 *
 * Реальная запись (создание тенантов/игроков в прод) — отдельный шаг по явному
 * ОК владельца (авто-классификатор гейтит запись в общую прод-БД).
 */
import {
  isAvandataConfigured, getSeasons, getClubList, getTeamsList,
  getTourStatistics, getMatches, getPlayersByRole,
} from '../services/avandataApi.js';

const clubSlug = (id: number) => `av-${id}`;

interface PlayerLite {
  id: number; title?: string; playerNumber?: number; dateOfBirth?: number;
  playerMatchRole?: { id: string; title: string }; team?: { id: number; title: string }; averageRating?: number;
}

async function main(): Promise<void> {
  if (!isAvandataConfigured()) { console.error('Нет AVANDATA_API_KEY/credentials в env.'); process.exit(1); }
  const seasonId = Number(process.argv[2]) || 2;

  const seasons = await getSeasons();
  const season = seasons.find((s) => s.id === seasonId);
  if (!season) { console.error(`Сезон ${seasonId} не найден. Есть: ${seasons.map((s) => s.id).join(', ')}`); process.exit(1); }
  console.log(`\n=== DRY-RUN ИМПОРТ · сезон ${season.id} «${season.title}» ===`);

  const divisionIds = Array.from(new Set(season.tournaments.flatMap((t) => t.divisions.map((d) => d.id))));

  // 1) КЛУБЫ
  const clubs = new Map<number, { id: number; title: string }>();
  for (const dId of divisionIds) {
    for (const c of await getClubList(season.id, dId)) clubs.set(c.id, { id: c.id, title: c.title });
  }

  // 2) КОМАНДЫ (по турниру×дивизиону, tour=1)
  const teams = new Map<number, { id: number; title: string; age: number }>();
  for (const t of season.tournaments) {
    for (const d of t.divisions) {
      try {
        for (const tf of await getTeamsList(t.id, d.id, 1)) {
          teams.set(tf.id, { id: tf.id, title: tf.title, age: t.dateBirthFrom });
        }
      } catch { /* пропускаем недоступные */ }
    }
  }

  // 3) МАТЧИ + ИГРОКИ (по турам; точные тоталы из tourStatistics, игроки — с разобранных туров)
  let totalMatches = 0, analyzedMatches = 0, totalGoals = 0, statCalls = 0;
  const players = new Map<number, PlayerLite>();
  const matchSamples: Array<{ ext: string; title: string }> = [];
  for (const t of season.tournaments) {
    for (const d of t.divisions) {
      for (let tour = 1; tour <= Math.max(1, d.lastPlayedTour); tour++) {
        if (statCalls++ > 400) { console.log('  …достигнут лимит сканирования туров'); break; }
        let st;
        try { st = await getTourStatistics(t.id, d.id, tour); } catch { continue; }
        totalMatches += st.totalMatches; analyzedMatches += st.analyzedMatches; totalGoals += st.totalGoals;
        if (st.analyzedMatches > 0) {
          try {
            const roleArr = (await getPlayersByRole(season.id, t.id, d.id, tour)) as Array<{ topPlayers?: PlayerLite[] }>;
            for (const g of roleArr) for (const p of g.topPlayers ?? []) if (p.id != null && !players.has(p.id)) players.set(p.id, p);
          } catch { /* */ }
          if (matchSamples.length < 4) {
            try {
              for (const m of await getMatches(t.id, d.id, tour)) {
                if (m.ffspbMatchId != null && matchSamples.length < 4) {
                  matchSamples.push({ ext: `ffspb-${m.ffspbMatchId}`, title: m.title });
                }
              }
            } catch { /* */ }
          }
        }
      }
    }
  }

  // ---- ОТЧЁТ ----
  const yearOnly = Array.from(players.values()).every((p) => p.dateOfBirth == null || p.dateOfBirth > 1900);
  console.log(`\n--- ЧТО ЗАЛЬЁТСЯ (dry-run, запись НЕ выполнялась) ---`);
  console.log(`КЛУБЫ:    ${clubs.size}  → тенанты ext (dataProvider=ffspb)`);
  console.log(`КОМАНДЫ:  ${teams.size}  → teams {slug}-{возраст}`);
  console.log(`ТУРНИРЫ:  ${season.tournaments.length} (дивизионы: ${divisionIds.join(', ')})`);
  console.log(`МАТЧИ:    ${totalMatches} всего, ${analyzedMatches} разобрано · голов ${totalGoals}`);
  console.log(`ИГРОКИ:   ${players.size} (только с разобранных матчей — у неразобранных игроков нет)`);

  console.log(`\nСЭМПЛ КЛУБОВ:`);
  for (const c of Array.from(clubs.values()).slice(0, 6)) console.log(`  ${clubSlug(c.id).padEnd(8)} ← «${c.title}»`);
  console.log(`\nСЭМПЛ КОМАНД:`);
  for (const tm of Array.from(teams.values()).slice(0, 6)) console.log(`  возраст ${tm.age} · «${tm.title}»`);
  console.log(`\nСЭМПЛ ИГРОКОВ → ext-avandata-{id}:`);
  for (const p of Array.from(players.values()).slice(0, 8)) {
    console.log(`  ext-avandata-${String(p.id).padEnd(5)} «${p.title}» г.р.${p.dateOfBirth ?? '—'} · ${p.playerMatchRole?.title ?? '—'} · ${p.team?.title ?? '—'} · рейтинг ${p.averageRating ?? '—'}`);
  }
  console.log(`\nСЭМПЛ МАТЧЕЙ → ext_match_id:`);
  for (const m of matchSamples) console.log(`  ${m.ext} ← «${m.title.trim()}»`);

  console.log(`\n--- ⚠️ ЧЕСТНЫЕ ОГРАНИЧЕНИЯ ---`);
  console.log(`• Дата рождения = ТОЛЬКО ГОД (${yearOnly ? 'подтверждено' : '?'}) → квартал неизвестен → RAE/«справедливость» по кварталам этот источник НЕ даёт (нужна полная дата из FFSPB/реестра).`);
  console.log(`• Игроки появляются ТОЛЬКО на разобранных матчах (${analyzedMatches}/${totalMatches}) — пул будет расти по мере разбора.`);
  console.log(`• Рейтинг игрока — целая шкала источника (напр. 170/110), не 0–10 → при импорте нормализуем.`);
  console.log(`• Полный вектор 37 метрик на игрока — нужен глубокий per-player эндпоинт (ещё не найден).`);
  console.log(`\nЗапись в прод НЕ выполнялась. Для реального импорта — отдельный шаг по ОК владельца.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('ОШИБКА:', e); process.exit(1); });
