-- ============================================================
-- PATCH 20 — Rastreamento de Atividade: extensao "tela atual"
--
-- Acrescenta a coluna path e troca a chave de fusao de blocos de
-- user_id para (user_id, path) — um bloco agora fecha por tempo
-- (gap > 10 min) OU por troca de tela, o que vier primeiro.
--
-- Blocos gravados antes deste patch ficam com path = NULL (nao
-- retroage). A assinatura da funcao muda (ganha p_path), por isso
-- e DROP + CREATE em vez de CREATE OR REPLACE.
--
-- Ver: src/components/ActivityHeartbeat.tsx
--      src/app/api/activity/ping/route.ts
--      scripts/queries/user_activity.sql   (consultas #5 e #6)
-- ============================================================

BEGIN;

ALTER TABLE user_activity ADD COLUMN IF NOT EXISTS path TEXT;

CREATE INDEX IF NOT EXISTS idx_user_activity_user_path_last_ping
  ON user_activity (user_id, path, last_ping_at DESC);

DROP FUNCTION IF EXISTS record_activity_ping(UUID);

CREATE OR REPLACE FUNCTION record_activity_ping(p_user_id UUID, p_path TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    UPDATE user_activity u
       SET last_ping_at = now(),
           ping_count   = ping_count + 1
     WHERE u.id = (
       SELECT id FROM user_activity
        WHERE user_id = p_user_id
          AND path IS NOT DISTINCT FROM p_path   -- mesma tela (ou ambos NULL)
          AND last_ping_at >= now() - INTERVAL '10 minutes'
        ORDER BY last_ping_at DESC
        LIMIT 1
     );

    IF NOT FOUND THEN
        INSERT INTO user_activity (user_id, path) VALUES (p_user_id, p_path);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION record_activity_ping(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_activity_ping(UUID, TEXT) TO service_role;

COMMIT;
