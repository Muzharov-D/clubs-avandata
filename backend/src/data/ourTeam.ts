import type { PoolClient } from 'pg';

/**
 * Ext FFSPB id НАШЕЙ команды для (tenant × age_group). Единый источник истины
 * матчинга «наша команда» — вместо подстрочного сравнения имён (которое ловило
 * «СШОР Зенит» на matcher «Зенит» и «Легирус-2» на «Легирус» → переворот
 * счёта/формы и неверная подсветка строки таблицы).
 *
 * Логика: мы участвуем в КАЖДОМ нашем матче (is_our_match=TRUE), соперники
 * меняются от тура к туру. Значит самый частый ext_team_id среди home/away
 * наших матчей — это мы. Подход САМОКОРРЕКТИРУЕТСЯ: даже если is_our_match был
 * выставлен подстрокой неточно, ложный соперник встретится 1 раз, а мы — во
 * всех турах, поэтому побеждаем по частоте. Тот же приём уже используется для
 * бэкфилла фото (upload/routes.ts, calendarService).
 *
 * Возвращает null, если у tenant ещё нет наших матчей с ext id (тогда
 * вызывающий код падает на фолбэк по имени).
 */
export async function resolveOurExtId(
  conn: PoolClient,
  tenantSlug: string,
  ageGroup: string,
): Promise<string | null> {
  const { rows } = await conn.query<{ extId: string }>(
    `SELECT ext_id FROM (
       SELECT ext_home_team_id AS ext_id FROM calendar
         WHERE tenant_id = $1 AND age_group = $2 AND is_our_match = TRUE
       UNION ALL
       SELECT ext_away_team_id AS ext_id FROM calendar
         WHERE tenant_id = $1 AND age_group = $2 AND is_our_match = TRUE
     ) t
     WHERE ext_id IS NOT NULL
     GROUP BY ext_id ORDER BY COUNT(*) DESC LIMIT 1`,
    [tenantSlug, ageGroup],
  );
  return rows[0]?.extId ?? null;
}

/**
 * Пересчитать флаг isOurClub в строках турнирной таблицы по ext team id.
 * Строки standings.table_data хранят teamId (ext id команды из FFSPB).
 *
 * ГАРД: переопределяем isOurClub ТОЛЬКО если ourExtId реально совпал хотя бы с
 * одной строкой. Если id-пространства календаря и таблицы FFSPB вдруг не
 * совпадают (или ext id не найден) — НЕ трогаем сохранённое значение, чтобы не
 * потерять подсветку нашей строки. Хуже текущего стать не может.
 */
export async function markOurStandingsRow(
  conn: PoolClient,
  tenantSlug: string,
  ageGroup: string,
  table: unknown,
): Promise<unknown> {
  if (!Array.isArray(table)) return table;
  const ourExtId = await resolveOurExtId(conn, tenantSlug, ageGroup);
  if (ourExtId == null) return table;
  const idOf = (row: unknown): string => String((row as { teamId?: unknown })?.teamId ?? '');
  const hit = table.some((row) => idOf(row) === ourExtId);
  if (!hit) return table;
  return table.map((row) => ({ ...(row as object), isOurClub: idOf(row) === ourExtId }));
}
