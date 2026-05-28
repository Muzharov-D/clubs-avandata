-- =============================================================================
-- 0003 Force Row-Level Security
-- -----------------------------------------------------------------------------
-- По умолчанию RLS не применяется к owner таблицы. Наш app PG-user является
-- owner (так как создаёт таблицы), поэтому policies не работают для него.
--
-- FORCE ROW LEVEL SECURITY заставляет PG применять policies в т.ч. для owner.
-- withBypassRLS() обходит через `SET row_security = off`.
-- =============================================================================

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'teams','players','matches','match_players','calendar','calendar_meta',
    'standings','cup_brackets','trainings','training_attendance','training_templates',
    'match_callups','push_subscriptions','notif_log','notif_deferred','notif_recipient_log',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
