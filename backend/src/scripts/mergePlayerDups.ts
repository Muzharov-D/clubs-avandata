/**
 * Дедуп игроков. Кластеры «один человек, два-три дубля» (опечатка / перепутан
 * порядок имя-фамилия / «Фамилия И» vs «Имя Ф»).
 *
 * ПРАВИЛО (общее для всех команд):
 *  1. Выживает запись с id формата `…-nNN` (этот формат использует парсер
 *     матчей — match_players ссылается на него). Если nNN нет — любой стабильный.
 *  2. В выжившую запись сливаем ЛУЧШЕЕ значение каждого поля по всему кластеру:
 *     - full_name  → «Имя Фамилия» (фамилия определяется по суффиксу), с ё.
 *     - number     → доверяем хеш-записи (SportVisor), иначе любое не-null.
 *     - position / position_full → хеш-запись, иначе не-null.
 *     - birth_date → правдоподобный год (в диапазоне команды ±2), иначе хеш.
 *     - photo_url  → не-null (приоритет хеш).
 *     - external_ids → объединение.
 *  3. Все ссылки (match_players, match_callups, trainings, users) с удаляемых
 *     id переводим на выжившую запись.
 *  4. Удаляемые записи DELETE.
 *
 * По умолчанию DRY-RUN (только печать). Применить: `--apply`.
 *   npx tsx src/scripts/mergePlayerDups.ts          # план
 *   npx tsx src/scripts/mergePlayerDups.ts --apply   # применить
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

const APPLY = process.argv.includes('--apply');

interface PlayerRow {
  id: string; tenant_id: string; team_id: string; full_name: string;
  number: number | null; position: string | null; position_full: string | null;
  birth_date: string | null; photo_url: string | null; external_ids: Record<string, unknown> | null;
}

// ── нормализация имён ─────────────────────────────────────────────────────
function norm(s: string): string {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(name: string): { word: string; isInitial: boolean }[] {
  return norm(name).split(' ').filter(Boolean).map((w) => ({ word: w, isInitial: w.length === 1 }));
}
function sameName(a: string, b: string): boolean {
  const ta = tokens(a); const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const used = new Set<number>(); let matched = 0;
  for (const x of ta) {
    for (let j = 0; j < tb.length; j++) {
      if (used.has(j)) continue;
      const y = tb[j];
      const eq = (x.isInitial || y.isInitial) ? x.word[0] === y.word[0] : x.word === y.word;
      if (eq) { used.add(j); matched++; break; }
    }
  }
  return matched >= 2 && matched >= Math.min(ta.length, tb.length);
}

const SURNAME_RE = /(ов|ев|ёв|ин|ын|ский|ской|цкий|цкой|ко|ук|юк|ич|дзе|ян|швили|их|ых|ой|ая|ова|ева|ина)$/i;
function looksSurname(w: string): boolean { return SURNAME_RE.test(w); }

/** Выбираем лучшее «Имя Фамилия» из кластера: 2 полных токена, фамилия в конце, с ё. */
function bestName(rows: PlayerRow[]): string {
  // кандидаты — имена из ≥2 полных (не инициал) токенов
  const full = rows
    .map((r) => r.full_name.trim())
    .filter((n) => n.split(/\s+/).filter((t) => t.replace(/[.\-]/g, '').length > 1).length >= 2);
  const pool2 = full.length ? full : rows.map((r) => r.full_name.trim());
  // предпочитаем написание с «ё»
  const withYo = pool2.find((n) => /ё/.test(n));
  const pick = withYo ?? pool2[0];
  const parts = pick.split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    const [a, b] = parts;
    // фамилия должна быть второй; если первая выглядит фамилией — меняем местами
    if (looksSurname(a) && !looksSurname(b)) return `${b} ${a}`;
  }
  return pick;
}

function birthYear(d: string | null): number | null {
  if (!d) return null;
  const y = new Date(d).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}
function teamYear(teamId: string): number | null {
  const m = teamId.match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}
function isHashId(id: string): boolean { return !/-n\d+$/.test(id); }

async function main() {
  const url = (process.env.DATABASE_URL || '').replace(/\/\/[^@]*@/, '//***@');
  console.log(`[${APPLY ? 'APPLY' : 'DRY-RUN'}] DB:`, url.slice(0, 70));

  const conn = await pool.connect();
  await conn.query('SET row_security = on');
  await conn.query("SELECT set_config('app.bypass_rls', 'on', false)");

  const { rows } = await conn.query<PlayerRow>(
    `SELECT id, tenant_id, team_id, full_name, number, position, position_full,
            birth_date::text AS birth_date, photo_url, external_ids
       FROM players ORDER BY tenant_id, team_id, full_name`,
  );

  // кластеры внутри команды
  const byTeam = new Map<string, PlayerRow[]>();
  for (const p of rows) {
    const k = `${p.tenant_id}::${p.team_id}`;
    (byTeam.get(k) ?? byTeam.set(k, []).get(k)!).push(p);
  }

  let merges = 0; let deletes = 0;
  if (APPLY) await conn.query('BEGIN');
  try {
    for (const [, list] of byTeam) {
      const seen = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        if (seen.has(list[i].id)) continue;
        const group = [list[i]];
        for (let j = i + 1; j < list.length; j++) {
          if (seen.has(list[j].id)) continue;
          if (sameName(list[i].full_name, list[j].full_name)) { group.push(list[j]); seen.add(list[j].id); }
        }
        if (group.length < 2) continue;

        // выживший: nNN-запись (приоритет — номер совпадает с хеш-записью), иначе первая
        const hash = group.find((g) => isHashId(g.id));
        const trustedNum = hash?.number ?? null;
        const nIds = group.filter((g) => !isHashId(g.id));
        const survivor = nIds.find((g) => trustedNum != null && g.number === trustedNum)
          ?? nIds[0] ?? group[0];
        const losers = group.filter((g) => g.id !== survivor.id);

        // лучшее значение каждого поля
        const ty = teamYear(survivor.team_id);
        const plausible = (d: string | null) => {
          const y = birthYear(d); return y != null && (ty == null || Math.abs(y - ty) <= 3);
        };
        const merged = {
          full_name: bestName(group),
          number: trustedNum ?? survivor.number ?? group.map((g) => g.number).find((n) => n != null) ?? null,
          position: hash?.position ?? group.map((g) => g.position).find((p) => p) ?? null,
          position_full: hash?.position_full ?? group.map((g) => g.position_full).find((p) => p) ?? null,
          birth_date:
            (plausible(hash?.birth_date ?? null) ? hash!.birth_date : null)
            ?? group.map((g) => g.birth_date).find((d) => plausible(d))
            ?? survivor.birth_date ?? null,
          photo_url: (hash?.photo_url) ?? group.map((g) => g.photo_url).find((p) => p) ?? null,
          external_ids: Object.assign({}, ...group.map((g) => g.external_ids ?? {})),
        };

        console.log(`\n── ${survivor.team_id} :: "${merged.full_name}" #${merged.number ?? '—'} ──`);
        console.log(`   выживает: ${survivor.id}`);
        console.log(`   поля: pos=${merged.position ?? '—'} bd=${merged.birth_date ?? '—'} photo=${merged.photo_url ? 'да' : 'нет'}`);
        for (const l of losers) console.log(`   удаляется: ${l.id} ("${l.full_name}" #${l.number ?? '—'} bd=${l.birth_date ?? '—'})`);
        merges++; deletes += losers.length;

        if (!APPLY) continue;

        // 1) применяем merged-поля к выжившему
        await conn.query(
          `UPDATE players SET full_name=$2, number=$3, position=$4, position_full=$5,
                  birth_date=$6, photo_url=$7, external_ids=$8 WHERE id=$1`,
          [survivor.id, merged.full_name, merged.number, merged.position, merged.position_full,
           merged.birth_date, merged.photo_url, JSON.stringify(merged.external_ids)],
        );
        // 2) переводим ссылки и удаляем дубли
        for (const l of losers) {
          await conn.query('UPDATE match_players SET player_id=$1 WHERE player_id=$2', [survivor.id, l.id]);
          await conn.query('UPDATE match_callups SET player_id=$1 WHERE player_id=$2', [survivor.id, l.id]);
          await conn.query('UPDATE training_attendance SET player_id=$1 WHERE player_id=$2', [survivor.id, l.id]);
          await conn.query('UPDATE users SET player_id=$1 WHERE player_id=$2', [survivor.id, l.id]);
          await conn.query('DELETE FROM players WHERE id=$1', [l.id]);
        }
      }
    }
    if (APPLY) { await conn.query('COMMIT'); console.log('\n✅ COMMIT'); }
  } catch (e) {
    if (APPLY) { await conn.query('ROLLBACK'); console.error('\n❌ ROLLBACK', e); }
    else throw e;
  }

  console.log(`\nИтог: кластеров ${merges}, удаляемых записей ${deletes}${APPLY ? '' : '  (DRY-RUN, ничего не изменено)'}`);
  try { await conn.query("SELECT set_config('app.bypass_rls', 'off', false)"); } catch { /* ignore */ }
  conn.release();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
