-- ============================================================
-- PATCH 14 — County details + Contacts
-- Adiciona campos de detalhe ao cadastro de County (Address,
-- Phone, 2 links genéricos label+url, Notes) e uma nova tabela
-- ls_county_contacts para o usuário cadastrar quantos contatos
-- forem necessários por county. Escrita continua exclusivamente
-- via /api/manager (supabaseAdmin), mesmo padrão já usado por
-- ls_county — por isso só existe policy de SELECT aqui.
-- ============================================================

BEGIN;

ALTER TABLE ls_county
  ADD COLUMN IF NOT EXISTS address      TEXT,
  ADD COLUMN IF NOT EXISTS phone        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS link1_label  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS link1_url    TEXT,
  ADD COLUMN IF NOT EXISTS link2_label  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS link2_url    TEXT,
  ADD COLUMN IF NOT EXISTS notes        TEXT;

CREATE TABLE IF NOT EXISTS ls_county_contacts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    county_id  UUID NOT NULL REFERENCES ls_county(id) ON DELETE CASCADE,
    name       VARCHAR(255) NOT NULL,
    role       VARCHAR(255),
    email      VARCHAR(255),
    phone      VARCHAR(50),
    notes      TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_county_contacts_county_id ON ls_county_contacts(county_id);

ALTER TABLE ls_county_contacts ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de ls_county: leitura liberada para qualquer usuário
-- autenticado, sem policy de INSERT/UPDATE/DELETE (escrita só via
-- supabaseAdmin em /api/manager).
CREATE POLICY "select_authenticated" ON ls_county_contacts FOR SELECT TO authenticated USING (true);

COMMIT;
