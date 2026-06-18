-- ============================================================
-- RLS PATCH — tabelas faltantes do rls_enable.sql
-- Executar após rls_enable.sql já ter sido aplicado.
-- ============================================================

BEGIN;

CREATE POLICY "select_authenticated" ON ls_request_priority
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "select_authenticated" ON ls_request_status
  FOR SELECT TO authenticated USING (true);

ALTER TABLE ls_request_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_request_status   ENABLE ROW LEVEL SECURITY;

COMMIT;
