-- ============================================================
-- RLS PATCH 4 — Partner Purchase Interest
-- Nova tabela ls_asset_partner_interest: registra qual parceiro
-- demonstrou interesse de compra em qual propriedade da Ironclad.
-- Parceiros NÃO têm nenhum acesso direto a esta tabela (nem leitura,
-- nem escrita) — toda leitura/escrita para o parceiro passa pelas
-- API routes server-side (supabaseAdmin, bypassa RLS). A única
-- policy aqui é para a equipe (funcionários) conseguir ler a tabela
-- direto do client, usada no filtro "Possui interesse de compra"
-- da visão Ironclad em /properties.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ls_asset_partner_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id BIGINT NOT NULL REFERENCES ls_assets(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES ls_users_metadata(id) ON DELETE CASCADE,
    message TEXT,
    request_id BIGINT REFERENCES ls_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (asset_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_ls_asset_partner_interest_asset_id   ON ls_asset_partner_interest(asset_id);
CREATE INDEX IF NOT EXISTS idx_ls_asset_partner_interest_partner_id ON ls_asset_partner_interest(partner_id);

ALTER TABLE ls_asset_partner_interest ENABLE ROW LEVEL SECURITY;

-- Sem policy de INSERT/UPDATE/DELETE para ninguém — escrita só via
-- supabaseAdmin (service role), mesmo padrão de ls_audit_logs.
CREATE POLICY "employee_select" ON ls_asset_partner_interest
  FOR SELECT TO authenticated
  USING (is_employee());

-- Categoria de chamado usada quando um parceiro registra interesse.
-- Nome em inglês (convenção do sistema: todo texto/dado visível é em inglês).
INSERT INTO ls_request_category (name)
SELECT 'Purchase Interest'
WHERE NOT EXISTS (SELECT 1 FROM ls_request_category WHERE name = 'Purchase Interest');

-- Garante que as lookups usadas pela rota de criação do chamado existem
-- (podem já existir em produção; os inserts de exemplo no schema.sql
-- estão comentados, então confirmamos aqui em vez de assumir).
INSERT INTO ls_request_status (name, color, is_closed)
SELECT 'Open', '#3b82f6', FALSE
WHERE NOT EXISTS (SELECT 1 FROM ls_request_status WHERE name = 'Open');

INSERT INTO ls_request_priority (name, color, sla_hours)
SELECT 'High', '#f97316', 24
WHERE NOT EXISTS (SELECT 1 FROM ls_request_priority WHERE name = 'High');

COMMIT;
