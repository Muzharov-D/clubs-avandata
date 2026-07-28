-- =============================================================================
-- 0023 Наборы показателей по амплуа — настраивает КЛУБ, а не мы.
--
-- До этого наборы были зашиты в коде: 6 осей на линию, 3 главных, выбранные
-- нами. Владелец справедливо возразил — какие показатели ключевые для амплуа,
-- решает тренер, это его методика.
--
-- Строка на (клуб, линия). Нет строки — действует умолчание из
-- `modules/lite/metrics.ts`. Так новый клуб сразу видит осмысленный набор,
-- а изменивший — только своё.
--
-- axes  — все оси амплуа по порядку (они же слайсы пиццы);
-- focus — главные, подсвеченные, они же открыты игроку по умолчанию.
-- Оба списка сервер проверяет по каталогу: ось без опоры в базовых 36 не пройдёт.
--
-- Идемпотентно: CREATE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lite_line_metrics (
  tenant_id  text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  line       text NOT NULL CHECK (line IN ('GK', 'DEF', 'MID', 'FWD')),
  axes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  focus      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, line)
);

-- RLS — как у остальных tenant-scoped таблиц (см. 0010): безусловно, без DO-guard.
ALTER TABLE lite_line_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lite_line_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON lite_line_metrics;
CREATE POLICY tenant_isolation ON lite_line_metrics
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  );
