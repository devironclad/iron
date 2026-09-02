-- ============================================================
-- PATCH 18 — COSL List View -> import de Auctions em ls_assets
--
-- Cada listing do catalogo COSL (endpoint /auctions/grid_read)
-- com Added On >= 2026-08-29 e cujo condado ja exista em ls_county
-- (state = 'AR') gera um novo registro AUCTION em ls_assets.
-- auction_date do asset = "Added On" + 30 dias.
--
-- Dedup: coluna ls_assets.cosl_property_id (alimentada EXCLUSIVAMENTE
-- por esse processo; demais registros ficam NULL). Se o usuario
-- excluir um asset importado, ele volta a ser criado na proxima
-- execucao caso ainda esteja no catalogo (decisao: "reimportar sempre").
--
-- Ver: src/lib/cosl/{listings,import-listings}.ts
--      src/app/api/cron/cosl-listings-import/route.ts
--      scripts/import-cosl-listings.js
--      scripts/cosl/pg_cron_listings_setup.sql   (agendador diario)
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- 1. Coluna de dedup em ls_assets
-- nullable, sem default -> registros existentes e inseridos pelo
-- sistema ficam NULL, sem impacto. Indice unico PARCIAL: so
-- restringe linhas com valor; varios NULL sao permitidos.
-- ----------------------------------------------------------
ALTER TABLE ls_assets ADD COLUMN IF NOT EXISTS cosl_property_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ls_assets_cosl_property_id
  ON ls_assets (cosl_property_id)
  WHERE cosl_property_id IS NOT NULL;

-- ----------------------------------------------------------
-- 2. Corrige typo de cadastro: COSL usa "CARROLL"; a base tinha
-- "Carrol". Mantem o mesmo id (FKs de ls_assets nao quebram).
-- (O alias 'ar|carroll' -> 'ar|carrol' em import-county-details.js
--  fica obsoleto apos isso e sera removido.)
-- ----------------------------------------------------------
UPDATE ls_county SET name = 'Carroll' WHERE state = 'AR' AND name = 'Carrol';

-- ----------------------------------------------------------
-- 3. Status da ultima execucao do import (1 linha)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cosl_listing_sync_meta (
    id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_run_at        TIMESTAMPTZ,
    last_success_at    TIMESTAMPTZ,
    status             TEXT,           -- 'ok' | 'error'
    message            TEXT,
    catalog_total      INTEGER,        -- linhas no catalogo COSL
    after_date_filter  INTEGER,        -- linhas com Added >= cutoff
    inserted           INTEGER,        -- assets criados nesta execucao
    skipped_existing   INTEGER,        -- ja tinham cosl_property_id
    skipped_no_county  INTEGER,        -- condado nao existe em ls_county (AR)
    skipped_counties   JSONB,          -- {"YELL": 3, "CONWAY": 2}
    duration_ms        INTEGER
);

INSERT INTO cosl_listing_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE cosl_listing_sync_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_authenticated" ON cosl_listing_sync_meta;
CREATE POLICY "select_authenticated" ON cosl_listing_sync_meta
  FOR SELECT TO authenticated USING (true);

COMMIT;
