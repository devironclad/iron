-- ============================================================
-- RLS PATCH 2 — INSERT próprio em ls_users_metadata
-- Corrige erro "Error syncing user metadata" no sidebar.
-- O upsert do sidebar sincroniza dados do próprio usuário;
-- precisamos permitir INSERT quando a row ainda não existe.
-- ============================================================

BEGIN;

CREATE POLICY "insert_own" ON ls_users_metadata
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

COMMIT;
