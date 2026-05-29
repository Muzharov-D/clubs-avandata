-- =============================================================================
-- 0007 FORCE RLS — настоящая изоляция тенантов на уровне БД (defense-in-depth).
--
-- Снова включаем и ФОРСИМ RLS на tenant-scoped таблицах + политика tenant_isolation:
--   видно строку, если app.bypass_rls='on' (админ/cron) ИЛИ
--   tenant_id = app.tenant_id (выставляется withTenant на каждом соединении).
--
-- Почему это безопасно (в отличие от 0003, которая уронила auth):
--   • users / tenants / refresh_tokens НЕ форсятся — auth-флоу (cross-tenant
--     поиск юзера по email) работает как раньше.
--   • Все live-роуты (data/upload/public/cron+services) уже идут через
--     withTenant/withBypassRLS — аудит подтверждён, плюс CI-тест изоляции.
--   • withBypassRLS теперь ставит app.bypass_rls='on' (под FORCE row_security=off
--     владельцем игнорируется), withTenant ставит 'off'.
--   • На managed-PG, где роль приложения = superuser/owner с bypass, FORCE инертен
--     (RLS обходится) — поведение не меняется. Где роль обычная — изоляция реальна.
--
-- to_regclass-guard: на таблицы, которых ещё нет, просто не трогаем.
-- =============================================================================

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'teams','players','matches','match_players',
    'calendar','calendar_meta','standings','cup_brackets',
    'trainings','training_attendance','training_templates','match_callups'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
          USING (
            current_setting('app.bypass_rls', true) = 'on'
            OR tenant_id = current_setting('app.tenant_id', true)
          )
          WITH CHECK (
            current_setting('app.bypass_rls', true) = 'on'
            OR tenant_id = current_setting('app.tenant_id', true)
          )
      $f$, t);
    END IF;
  END LOOP;
END $$;
