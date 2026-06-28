/**
 * Чистые предикаты авторизации (без БД) — ЕДИНЫЙ ИСТОЧНИК правил доступа,
 * покрытый юнит-тестами. Роуты вызывают эти функции и применяют решение
 * (deny → 403; ownTeam → фильтр по team_id; all → без фильтра).
 *
 * Правила (зафиксированы ревью):
 * - Запись по матчам/тренировкам: head_coach — любая команда клуба; team_coach —
 *   ТОЛЬКО своя (teamId обязателен, иначе deny — fail-closed); игрок — read-only → deny.
 *   Составы (callups) — то же, но «своя» = совпадение возраста.
 * - Чтение клубной аналитики (сводка/таланты/карта потерь): club-wide роли
 *   (head_coach / platform_admin), НЕ игрок и НЕ тренер команды.
 *
 * NB: роль sporting_director слита в head_coach (миграция 0019) — единый клубный
 * кабинет «Старший тренер». Ветки sporting_director ниже сохранены как безвредный
 * мёртвый код (значение валидно в CHECK, но более не назначается).
 */

export type WriteScope = 'all' | 'deny' | { ownTeam: string };

/** Право записи по матчам/тренировкам (team-scoped). */
export function teamWriteScope(role: string | undefined, teamId: string | null | undefined): WriteScope {
  if (role === 'head_coach') return 'all';
  if (role === 'team_coach') return teamId ? { ownTeam: teamId } : 'deny';
  return 'deny';
}

/** Право записи состава на матч (callups): «своя» = teamId === `${slug}-${age}`. */
export function callupWriteScope(
  role: string | undefined,
  teamId: string | null | undefined,
  slug: string,
  age: string,
): WriteScope {
  if (role === 'head_coach') return 'all';
  if (role === 'team_coach') return teamId && teamId === `${slug}-${age}` ? { ownTeam: teamId } : 'deny';
  return 'deny';
}

/** Доступ к клубной аналитике клуба целиком (сводка/таланты/карта потерь). */
export function canReadClubAnalytics(role: string | undefined): boolean {
  return role === 'head_coach' || role === 'sporting_director' || role === 'platform_admin';
}
