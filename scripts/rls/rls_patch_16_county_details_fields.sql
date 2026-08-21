-- ============================================================
-- PATCH 16 — County Details field rework
-- Substitui os campos genéricos Phone / Link 1 / Link 2 do
-- cadastro de County por campos específicos por órgão:
-- Main Website, Tax Sale, Property Appraiser, Clerk Recording
-- Office e Zoning Planning (cada um com texto, link e telefone
-- quando aplicável). Escrita continua exclusivamente via
-- /api/manager (supabaseAdmin), mesmo padrão do patch 14.
--
-- As colunas antigas (phone, link1_label, link1_url, link2_label,
-- link2_url) NÃO são removidas nesta migração para não perder
-- dados já cadastrados — apenas deixam de ser usadas pela UI.
-- Rode um patch separado de DROP COLUMN depois de confirmar que
-- os dados relevantes (se houver) já foram migrados manualmente.
-- ============================================================

BEGIN;

ALTER TABLE ls_county
  ADD COLUMN IF NOT EXISTS main_website               TEXT,
  ADD COLUMN IF NOT EXISTS tax_sale                    TEXT,
  ADD COLUMN IF NOT EXISTS tax_sale_link                TEXT,
  ADD COLUMN IF NOT EXISTS tax_sale_phone               VARCHAR(50),
  ADD COLUMN IF NOT EXISTS property_appraiser           TEXT,
  ADD COLUMN IF NOT EXISTS property_appraiser_link      TEXT,
  ADD COLUMN IF NOT EXISTS property_appraiser_phone     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS clerk_recording_office       TEXT,
  ADD COLUMN IF NOT EXISTS clerk_recording_link         TEXT,
  ADD COLUMN IF NOT EXISTS clerk_recording_phone        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS zoning_planning              TEXT,
  ADD COLUMN IF NOT EXISTS zoning_planning_link         TEXT,
  ADD COLUMN IF NOT EXISTS zoning_planning_phone        VARCHAR(50);

COMMIT;
