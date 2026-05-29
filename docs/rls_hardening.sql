-- ============================================================================
-- RLS HARDENING — НЕ авто-применяется (лежит в docs/, не в drizzle/).
-- ============================================================================
--
-- Зачем отдельно: миграция 0004 расслабила RLS (owner-bypass на Render PG без
-- BYPASSRLS-роли). Включение forced RLS снова сделает изоляцию жёсткой — но если
-- ХОТЯ БЫ ОДИН запрос идёт мимо withTenant()/withBypassRLS(), он начнёт получать
-- пустые результаты или падать. Именно поэтому это НЕ в drizzle/*.sql (которые
-- применяются автоматически при деплое) — иначе риск повторно «уронить» прод.
--
-- Применять ОСОЗНАННО, после:
--   1. Аудита: все tenant-запросы идут через withTenant; все admin — через
--      withBypassRLS; app.tenant_id выставляется на каждом соединении.
--   2. Прогона на staging/branch БД (Supabase branch или дубль Render PG).
--   3. Подготовки отката (DOWN ниже).
--
-- Применение (вручную, не через migrate.ts):
--   psql "$DATABASE_URL" -f docs/rls_hardening.sql
-- ============================================================================

-- UP ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'teams','players','matches','match_players','calendar','calendar_meta',
    'standings','cup_brackets','trainings','match_callups'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      -- Доступ только к строкам своего тенанта; bypass — если выставлен app.bypass_rls.
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

-- DOWN (откат) ────────────────────────────────────────────────────────────────
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'teams','players','matches','match_players','calendar','calendar_meta',
--     'standings','cup_brackets','trainings','match_callups'
--   ] LOOP
--     IF to_regclass(t) IS NOT NULL THEN
--       EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
--       EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
--       EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
--     END IF;
--   END LOOP;
-- END $$;
