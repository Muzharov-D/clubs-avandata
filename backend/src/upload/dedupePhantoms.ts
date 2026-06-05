/**
 * Авто-дедуп ФАНТОМОВ по номеру.
 *
 * Парсер на отчёте с нечитаемой кириллицей (русская локаль SportVisor: имена в
 * PDF гарблятся в «») мог создать запись игрока с «мусорным» именем («А.» #15)
 * рядом с настоящим игроком того же номера («Андрей Дютиль» #15). Имя-обрезок
 * не проходит матчинг по фамилии, поэтому общий mergePlayerDups (кластеры по
 * имени) такой дубль не ловит — нужен дедуп ПО НОМЕРУ.
 *
 * Правило (консервативное, безопасное к легитимной смене владельца номера):
 *  - группируем игроков команды по number;
 *  - в группе сливаем ТОЛЬКО когда есть РОВНО ОДНО настоящее имя и ≥1 мусорное;
 *  - ссылки (match_players/match_callups/training_attendance) фантома → канон
 *    (с защитой от конфликта PK по матчу), запись фантома DELETE.
 *  - если у номера несколько НАСТОЯЩИХ имён — не трогаем (это могла быть смена
 *    игрока под номером, не наша забота).
 *
 * Вызывается автоматически в конце загрузки матча (в той же tenant-транзакции),
 * поэтому фантомы самоликвидируются и не накапливаются.
 */
import type { PoolClient } from 'pg';

/** «Мусорное» имя: пусто, нечитаемая кириллица (), только инициалы/точки. */
export function isJunkName(name: string): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  if (n.includes('�')) return true; // нечитаемая кириллица из PDF
  const meaningful = n.replace(/[.\-]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
  return meaningful.length === 0; // остались только инициалы → мусор
}

/**
 * Слить фантомов-однофамильцев по номеру в команде. Возвращает число удалённых.
 * Должна выполняться внутри транзакции с установленным tenant-контекстом (RLS).
 */
export async function dedupePhantomsByNumber(
  conn: PoolClient,
  tenantId: string,
  teamId: string,
): Promise<number> {
  const { rows } = await conn.query<{ id: string; full_name: string; number: number }>(
    `SELECT id, full_name AS "full_name", number
       FROM players
      WHERE tenant_id = $1 AND team_id = $2 AND number IS NOT NULL`,
    [tenantId, teamId],
  );

  const byNum = new Map<number, { id: string; full_name: string; number: number }[]>();
  for (const r of rows) {
    const g = byNum.get(r.number) ?? [];
    g.push(r);
    byNum.set(r.number, g);
  }

  let removed = 0;
  for (const group of byNum.values()) {
    if (group.length < 2) continue;
    const real = group.filter((r) => !isJunkName(r.full_name));
    const junk = group.filter((r) => isJunkName(r.full_name));
    // Сливаем только однозначный случай: один настоящий + мусорные дубли.
    if (real.length !== 1 || junk.length === 0) continue;
    const canonRow = real[0];
    if (!canonRow) continue;
    const canon = canonRow.id;

    for (const j of junk) {
      // match_players: убираем строки фантома по матчам, где у канона УЖЕ есть
      // строка (иначе PK (match_id, player_id) конфликтует), затем переносим.
      await conn.query(
        `DELETE FROM match_players
           WHERE player_id = $1
             AND match_id IN (SELECT match_id FROM match_players WHERE player_id = $2)`,
        [j.id, canon],
      );
      await conn.query('UPDATE match_players SET player_id = $1 WHERE player_id = $2', [canon, j.id]);
      // callups/attendance — у свежесозданного фантома их обычно нет; простой перенос.
      await conn.query('UPDATE match_callups SET player_id = $1 WHERE player_id = $2', [canon, j.id]);
      await conn.query('UPDATE training_attendance SET player_id = $1 WHERE player_id = $2', [canon, j.id]);
      await conn.query('DELETE FROM players WHERE id = $1', [j.id]);
      removed++;
    }
  }
  return removed;
}
