-- ============================================================
-- PATCH 6 — Auto-resolve Partner Purchase Interest on request close
-- Replaces the manual "Clear" action with automation: when the
-- ls_requests ticket linked to a purchase-interest row reaches a
-- closed status (any status with is_closed = true — Resolved,
-- Cancelled, etc.), the interest row is soft-cleared by stamping
-- resolved_at, instead of being deleted. History is preserved;
-- "active" interest is simply resolved_at IS NULL.
--
-- Since resolved rows are kept, the old UNIQUE(asset_id, partner_id)
-- constraint (from patch 4) would block a partner from registering
-- interest again after a prior round was resolved. We replace it with
-- a partial unique index that only enforces uniqueness among ACTIVE
-- (resolved_at IS NULL) rows.
-- ============================================================

BEGIN;

ALTER TABLE ls_asset_partner_interest ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

-- Drop whatever the old full UNIQUE(asset_id, partner_id) constraint was
-- named (auto-generated at CREATE TABLE time in patch 4) — found
-- dynamically instead of guessed, so this is safe regardless of naming.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'ls_asset_partner_interest'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE ls_asset_partner_interest DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ls_asset_partner_interest_active
  ON ls_asset_partner_interest (asset_id, partner_id)
  WHERE resolved_at IS NULL;

-- Trigger: whenever a request's status changes (or is set on insert) to a
-- closed status, soft-clear any still-active interest row pointing at it.
-- A no-op for every ls_requests row that isn't linked from
-- ls_asset_partner_interest (i.e. every ticket type other than
-- "Purchase Interest"), so this doesn't affect the rest of the Requests
-- module.
CREATE OR REPLACE FUNCTION resolve_partner_interest_on_request_close()
RETURNS TRIGGER AS $$
DECLARE
  v_is_closed BOOLEAN;
BEGIN
  SELECT is_closed INTO v_is_closed FROM ls_request_status WHERE id = NEW.status_id;
  IF v_is_closed THEN
    UPDATE ls_asset_partner_interest
    SET resolved_at = now()
    WHERE request_id = NEW.id AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_resolve_partner_interest_on_request_close ON ls_requests;
CREATE TRIGGER tr_resolve_partner_interest_on_request_close
AFTER INSERT OR UPDATE OF status_id ON ls_requests
FOR EACH ROW EXECUTE FUNCTION resolve_partner_interest_on_request_close();

COMMIT;
