-- ============================================================
-- PATCH 8 — Safety Index, Financial Rating, Mobile Home Allowed
-- Two new lookup tables (same shape/RLS as ls_origem etc.) plus a
-- boolean flag, all added to ls_assets. Used on the Auctions screen
-- (Property Attributes section).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ls_safety_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS ls_financial_rating (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL
);

INSERT INTO ls_safety_index (name)
SELECT v FROM (VALUES ('Low'), ('Medium'), ('High')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM ls_safety_index WHERE name = t.v);

INSERT INTO ls_financial_rating (name)
SELECT v FROM (VALUES ('Low'), ('Medium'), ('High')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM ls_financial_rating WHERE name = t.v);

ALTER TABLE ls_assets
  ADD COLUMN IF NOT EXISTS safety_index_id UUID REFERENCES ls_safety_index(id),
  ADD COLUMN IF NOT EXISTS financial_rating_id UUID REFERENCES ls_financial_rating(id),
  ADD COLUMN IF NOT EXISTS mobile_home_allowed BOOLEAN DEFAULT FALSE;

ALTER TABLE ls_safety_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_financial_rating ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_authenticated" ON ls_safety_index
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "select_authenticated" ON ls_financial_rating
  FOR SELECT TO authenticated USING (true);

-- Writes go only through /api/manager (supabaseAdmin, bypasses RLS),
-- same as every other simple lookup table — no INSERT/UPDATE/DELETE
-- policy needed here.

COMMIT;
