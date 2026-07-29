-- ============================================================
-- PATCH 9 — Replace mobile_home_allowed flag with existing mh_allowed
-- The boolean flag added in patch 8 for the Auctions screen is discarded
-- in favor of the list field already used on Properties (mh_allowed
-- enum: 'Yes'/'No'/'Modular Only'), so both screens share one source of
-- truth instead of two similarly-named fields.
-- ============================================================

BEGIN;

ALTER TABLE ls_assets DROP COLUMN IF EXISTS mobile_home_allowed;

COMMIT;
