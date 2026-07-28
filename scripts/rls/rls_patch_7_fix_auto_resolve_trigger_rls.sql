-- ============================================================
-- PATCH 7 — Fix: auto-resolve trigger silently blocked by RLS
-- The trigger added in patch 6 runs with the privileges of whoever
-- performed the UPDATE on ls_requests. When that's an employee using
-- the Requests UI (the normal, authenticated-role path — not the
-- service_role/supabaseAdmin used in our earlier manual tests),
-- Postgres RLS on ls_asset_partner_interest silently blocks the
-- trigger's internal UPDATE, because that table intentionally has NO
-- update policy for anyone (only "employee_select" for reads — see
-- rls_patch_4). The outer request-status update still succeeds and
-- reports no error, so this failure is invisible in the UI — the
-- interest just never gets resolved_at stamped.
--
-- Fix: mark the trigger function SECURITY DEFINER (with a locked
-- search_path, standard Postgres hardening for SECURITY DEFINER
-- functions) so its internal UPDATE always runs with the function
-- owner's privileges and bypasses RLS, regardless of which role
-- triggered it. This mirrors is_employee(), which is already
-- SECURITY DEFINER for the same reason. We deliberately do NOT add a
-- generic UPDATE policy on ls_asset_partner_interest for
-- "authenticated" users (the RLS_patch_3 style fix used for
-- ls_notifications) because "authenticated" includes partners, and
-- that would reopen direct write access to a table partners must
-- never be able to touch.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION resolve_partner_interest_on_request_close()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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

COMMIT;
