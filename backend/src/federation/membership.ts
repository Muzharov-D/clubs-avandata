/**
 * Единый шов изоляции региона.
 *
 * Каждый tenant-scoped SELECT в федеративных запросах ОБЯЗАН включать этот
 * фрагмент в WHERE — он ограничивает строки клубами-членами федерации
 * (tier='full'). Читает `app.federation_id`, который ставит `withFederation`.
 * Вне контекста федерации (пустой app.federation_id) подзапрос пуст → 0 строк
 * (fail-closed).
 *
 * Это ЕДИНСТВЕННЫЙ источник фильтра членства — НЕ дублировать инлайном в роутах.
 * `withFederation` ставит bypass_rls='on', поэтому RLS на tenant-таблицах
 * обойдён — изоляция региона держится ИСКЛЮЧИТЕЛЬНО на этом фрагменте.
 * Обязательность проверяется тестом изоляции (scripts/test-rls-isolation.mjs,
 * Story 0.7).
 *
 * Использование (raw SQL, как в data/routes.ts):
 *   `SELECT ... FROM teams WHERE ${FED_MEMBERSHIP_SQL} AND age_group = $1`
 */
export function fedMembershipFilter(column = 'tenant_id'): string {
  return (
    `${column} IN (SELECT tenant_slug FROM federation_tenants ` +
    `WHERE federation_slug = current_setting('app.federation_id', true) AND tier = 'full')`
  );
}

/**
 * Готовый фрагмент для unqualified колонки `tenant_id` (= `fedMembershipFilter()`).
 * Для join'ов с неоднозначной колонкой используй `fedMembershipFilter('p.tenant_id')`.
 */
export const FED_MEMBERSHIP_SQL = fedMembershipFilter();
