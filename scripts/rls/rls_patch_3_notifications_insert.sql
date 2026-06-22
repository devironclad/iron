-- ============================================================
-- RLS PATCH 3 — INSERT em ls_notifications para authenticated
-- Triggers de banco inserem notificações rodando como o usuário
-- autenticado. Sem esta policy o INSERT é bloqueado pelo RLS.
-- ============================================================

BEGIN;

CREATE POLICY "authenticated_insert" ON ls_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

COMMIT;
