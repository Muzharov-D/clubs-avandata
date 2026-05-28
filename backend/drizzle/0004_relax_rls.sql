-- =============================================================================
-- 0004 Relax RLS — Render PG user не имеет BYPASSRLS, FORCE RLS блокирует auth.
-- Изоляция теперь на application-уровне: явный WHERE tenant_id в каждом query.
-- RLS остаётся как defense-in-depth: app user (owner) bypassed автоматически,
-- but если будет non-owner role — RLS политики сработают.
-- =============================================================================

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'teams','players','matches','match_players','calendar','calendar_meta',
    'standings','cup_brackets','trainings','training_attendance','training_templates',
    'match_callups','push_subscriptions','notif_log','notif_deferred','notif_recipient_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- users — полностью отключаем RLS (auth flow нуждается в cross-tenant lookup,
-- и контролируется на application-уровне через JWT).
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
