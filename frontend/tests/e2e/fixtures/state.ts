/**
 * Пути к сохранённым auth-состояниям (storageState). Логинимся ОДИН раз в
 * auth.setup.ts и переиспользуем сессию во всех auth-зависимых спеках — иначе
 * UI-логин в каждом тесте быстро упирается в рейт-лимит/lockout прод-бэка
 * (argon2 + защита от перебора).
 */
export const ADMIN_STATE = 'playwright/.auth/admin.json';
