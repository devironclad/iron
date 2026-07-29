-- ============================================================
-- PATCH 12 — Add PAF value to classification_enum
-- ============================================================

BEGIN;

ALTER TYPE classification_enum ADD VALUE IF NOT EXISTS 'PAF';

COMMIT;
