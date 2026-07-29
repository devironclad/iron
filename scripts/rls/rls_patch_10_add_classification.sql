-- ============================================================
-- PATCH 10 — Add Classification field to ls_assets
-- New list field for the Auctions/Properties Attributes section:
-- PLA, PAA, PMX, PWT.
-- ============================================================

BEGIN;

CREATE TYPE classification_enum AS ENUM ('PLA', 'PAA', 'PMX', 'PWT');

ALTER TABLE ls_assets
  ADD COLUMN IF NOT EXISTS classification classification_enum;

COMMIT;
