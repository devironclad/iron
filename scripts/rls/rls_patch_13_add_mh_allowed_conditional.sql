-- ============================================================
-- PATCH 13 — Add "Yes, conditional" value to mh_allowed_enum
-- ============================================================

BEGIN;

ALTER TYPE mh_allowed_enum ADD VALUE IF NOT EXISTS 'Yes, conditional';

COMMIT;
