/**
 * Авто-дедуп дублей игрока ПО НОМЕРУ.
 *
 * Загрузка отчёта может породить вторую запись того же игрока под тем же
 * номером: парсер на нечитаемой кириллице (русская локаль SportVisor) даёт
 * имя-обрезок, а перепутанный порядок «Имя Фамилия» ↔ «Фамилия И.» уводит
 * резолв по фамилии мимо существующей записи. Пример: «Андрей Дютиль» #15 (3
 * матча) и фантом «Дютиль А.» #15 (1 матч).
 *
 * Правило (консервативное, безопасное к легитимной смене владельца номера):
 *  - группируем игроков команды по number;
 *  - в группе кластер «один человек» = записи, попарно похожие по имени
 *    (sameName) ИЛИ с мусорным именем (инициал/гарбл);
 *  - если ВСЕ записи номера — один кластер: сливаем в выжившего (с наибольшим
 *    числом match_players → хранит историю), имя берём лучшее «Имя Фамилия»,
 *    ссылки match_players/callups/attendance → выживший (с защитой от PK),
 *    остальные DELETE;
 *  - если на номере несколько РАЗНЫХ людей — не трогаем.
 *
 * Вызывается автоматически в конце каждой загрузки матча (в той же tenant-
 * транзакции) — дубли самоликвидируются.
 */
import type { PoolClient } from 'pg';

interface Row { id: string; full_name: string; number: number; matches: number; }

function norm(s: string): string {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function toks(name: string): { word: string; isInitial: boolean }[] {
  return norm(name).split(' ').filter(Boolean).map((w) => ({ word: w, isInitial: w.length === 1 }));
}
/** «Один человек»: ≥2 совпавших токена (инициал совпадает по первой букве). */
function sameName(a: string, b: string): boolean {
  const ta = toks(a); const tb = toks(b);
  if (!ta.length || !tb.length) return false;
  const used = new Set<number>(); let matched = 0;
  for (const x of ta) {
    for (let j = 0; j < tb.length; j++) {
      if (used.has(j)) continue;
      const y = tb[j];
      if (!y) continue;
      const eq = (x.isInitial || y.isInitial) ? x.word[0] === y.word[0] : x.word === y.word;
      if (eq) { used.add(j); matched++; break; }
    }
  }
  return matched >= 2 && matched >= Math.min(ta.length, tb.length);
}
/** Мусорное имя: пусто, нечитаемая кириллица (), только инициалы. */
export function isJunkName(name: string): boolean {
  const n = String(name || '').trim();
  if (!n || n.includes('�')) return true;
  return n.replace(/[.\-]/g, ' ').split(/\s+/).filter((t) => t.length > 1).length === 0;
}
/** «Содержательность» имени для выбора отображаемого: 2 полных токена > 1 > 0. */
function nameScore(name: string): number {
  return norm(name).split(' ').filter((t) => t.length > 1).length;
}
const SURNAME_RE = /(ов|ев|ёв|ин|ын|ский|ской|цкий|цкой|ко|ук|юк|ич|дзе|ян|швили|их|ых|ова|ева|ина)$/i;
/** Лучшее «Имя Фамилия» из кластера (фамилия в конце, с ё если есть). */
function bestName(names: string[]): string {
  const full = names.filter((n) => nameScore(n) >= 2);
  const pool = full.length ? full : names;
  const pick = pool.find((n) => /ё/.test(n)) ?? pool[0] ?? '';
  const parts = pick.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts[0] && parts[1] && SURNAME_RE.test(parts[0]) && !SURNAME_RE.test(parts[1])) {
    return `${parts[1]} ${parts[0]}`;
  }
  return pick;
}

async function moveRefs(conn: PoolClient, fromId: string, toId: string): Promise<void> {
  // match_players: убрать строки дубля по матчам, где у выжившего УЖЕ есть строка
  // (PK (match_id, player_id)), затем перенести остальные.
  await conn.query(
    `DELETE FROM match_players WHERE player_id = $1
       AND match_id IN (SELECT match_id FROM match_players WHERE player_id = $2)`,
    [fromId, toId],
  );
  await conn.query('UPDATE match_players SET player_id = $1 WHERE player_id = $2', [toId, fromId]);
  await conn.query('UPDATE match_callups SET player_id = $1 WHERE player_id = $2', [toId, fromId]);
  await conn.query('UPDATE training_attendance SET player_id = $1 WHERE player_id = $2', [toId, fromId]);
  await conn.query('DELETE FROM players WHERE id = $1', [fromId]);
}

/** Слить дубли одного человека по номеру. Возвращает число удалённых записей. */
export async function dedupePhantomsByNumber(
  conn: PoolClient,
  tenantId: string,
  teamId: string,
): Promise<number> {
  const { rows } = await conn.query<Row>(
    `SELECT p.id, p.full_name AS full_name, p.number, COUNT(mp.match_id)::int AS matches
       FROM players p LEFT JOIN match_players mp ON mp.player_id = p.id
      WHERE p.tenant_id = $1 AND p.team_id = $2 AND p.number IS NOT NULL
      GROUP BY p.id, p.full_name, p.number`,
    [tenantId, teamId],
  );

  const byNum = new Map<number, Row[]>();
  for (const r of rows) {
    const g = byNum.get(r.number) ?? [];
    g.push(r); byNum.set(r.number, g);
  }

  let removed = 0;
  for (const group of byNum.values()) {
    if (group.length < 2) continue;
    // Якорь — запись с самым содержательным именем (и больше всех матчей).
    const anchor = [...group].sort((a, b) => nameScore(b.full_name) - nameScore(a.full_name) || b.matches - a.matches)[0]!;
    // Один человек, если каждая запись либо мусорная, либо sameName с якорем.
    const oneMan = group.every((r) => r.id === anchor.id || isJunkName(r.full_name) || sameName(anchor.full_name, r.full_name));
    if (!oneMan) continue; // на номере разные люди — не трогаем

    // Выживший — с наибольшим числом матчей (сохраняем историю).
    const survivor = [...group].sort((a, b) => b.matches - a.matches || nameScore(b.full_name) - nameScore(a.full_name))[0]!;
    const best = bestName(group.map((r) => r.full_name));
    for (const r of group) {
      if (r.id === survivor.id) continue;
      await moveRefs(conn, r.id, survivor.id);
      removed++;
    }
    if (best && best !== survivor.full_name) {
      const parts = best.split(/\s+/).filter(Boolean);
      const last = parts.length >= 2 ? parts[parts.length - 1] : best;
      const first = parts.length >= 2 ? parts.slice(0, -1).join(' ') : '';
      await conn.query(
        'UPDATE players SET full_name = $1, first_name = $2, last_name = $3 WHERE id = $4',
        [best, first, last, survivor.id],
      );
    }
  }
  return removed;
}
