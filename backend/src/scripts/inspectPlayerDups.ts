/**
 * READ-ONLY. Ищет вероятные дубли игроков (опечатка / перепутан порядок
 * имя-фамилия / «Фамилия И» vs «Имя Ф»). Ничего не меняет — только печатает.
 *
 * Запуск: npx tsx src/scripts/inspectPlayerDups.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

/** ё→е, нижний регистр, точки/дефисы → пробел, схлопываем пробелы. */
function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Токены имени → массив {full, letter}. Одиночная буква = инициал. */
function tokens(name: string): { word: string; isInitial: boolean }[] {
  return norm(name)
    .split(' ')
    .filter(Boolean)
    .map((w) => ({ word: w, isInitial: w.length === 1 }));
}

/**
 * Совпадают ли два имени как «один человек».
 * Логика: для каждого имени берём набор токенов. Сопоставляем токены A с
 * токенами B так, что full-слово матчит инициал по первой букве, либо
 * full-слово == full-слово. Порядок не важен (перепутаны имя/фамилия).
 */
function sameName(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  // Берём максимум 2 значимых токена (имя+фамилия)
  const used = new Set<number>();
  let matched = 0;
  for (const x of ta) {
    for (let j = 0; j < tb.length; j++) {
      if (used.has(j)) continue;
      const y = tb[j];
      const eq = x.isInitial || y.isInitial
        ? x.word[0] === y.word[0]          // хотя бы один инициал → по первой букве
        : x.word === y.word;               // оба полные → точное совпадение
      if (eq) { used.add(j); matched++; break; }
    }
  }
  // Нужно ≥2 совпавших токена (имя И фамилия) — иначе слишком слабо.
  return matched >= 2 && matched >= Math.min(ta.length, tb.length);
}

async function main() {
  const url = process.env.DATABASE_URL || '';
  const host = url.replace(/\/\/[^@]*@/, '//***@');
  console.log('DATABASE_URL host:', host.slice(0, 80));

  // players под FORCE RLS — без bypass владелец видит 0 строк. Берём ОДНО
  // соединение, ставим bypass-флаг, и ВСЕ запросы гоним через него (conn),
  // а не через pool (pool.query взял бы другое соединение без флага).
  const conn = await pool.connect();
  await conn.query('SET row_security = on');
  await conn.query("SELECT set_config('app.bypass_rls', 'on', false)");

  const { rows: players } = await conn.query<{
    id: string; tenant_id: string; team_id: string; full_name: string;
    number: number | null; position: string | null; birth_date: string | null;
    photo_url: string | null; external_ids: unknown;
  }>(
    `SELECT id, tenant_id, team_id, full_name, number, position,
            birth_date, photo_url, external_ids
       FROM players ORDER BY tenant_id, team_id, full_name`,
  );
  console.log(`Всего игроков: ${players.length}\n`);

  // Подсветка целевого кейса
  const targetRe = /семен|семён|максим/i;
  const targets = players.filter((p) => targetRe.test(p.full_name));
  if (targets.length) {
    console.log('── Кандидаты по «Семёнов / Максим» ──');
    for (const p of targets) {
      console.log(`  ${p.id} | team=${p.team_id} | "${p.full_name}" | #${p.number ?? '—'} | ${p.position ?? '—'} | bd=${p.birth_date ?? '—'} | photo=${p.photo_url ? 'да' : 'нет'}`);
    }
    console.log('');
  }

  // Общий проход: кластеры дублей внутри одной команды
  const byTeam = new Map<string, typeof players>();
  for (const p of players) {
    const k = `${p.tenant_id}::${p.team_id}`;
    if (!byTeam.has(k)) byTeam.set(k, []);
    byTeam.get(k)!.push(p);
  }

  let clusters = 0;
  for (const [team, list] of byTeam) {
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      if (seen.has(list[i].id)) continue;
      const group = [list[i]];
      for (let j = i + 1; j < list.length; j++) {
        if (seen.has(list[j].id)) continue;
        if (sameName(list[i].full_name, list[j].full_name)) {
          group.push(list[j]);
          seen.add(list[j].id);
        }
      }
      if (group.length > 1) {
        clusters++;
        console.log(`── Дубль (team ${team}) ──`);
        for (const g of group) {
          const ext = JSON.stringify(g.external_ids ?? {});
          console.log(`  ${g.id} | "${g.full_name}" | #${g.number ?? '—'} | ${g.position ?? '—'} | bd=${g.birth_date ?? '—'} | photo=${g.photo_url ? 'да' : 'нет'} | ext=${ext}`);
        }
        // Счётчики ссылок
        for (const g of group) {
          const mp = await conn.query('SELECT COUNT(*)::int AS n FROM match_players WHERE player_id=$1', [g.id]);
          const mc = await conn.query('SELECT COUNT(*)::int AS n FROM match_callups WHERE player_id=$1', [g.id]);
          console.log(`     refs ${g.id}: match_players=${mp.rows[0].n}, match_callups=${mc.rows[0].n}`);
        }
        console.log('');
      }
    }
  }
  console.log(`Найдено кластеров-дублей: ${clusters}`);
  try { await conn.query("SELECT set_config('app.bypass_rls', 'off', false)"); } catch { /* ignore */ }
  conn.release();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
