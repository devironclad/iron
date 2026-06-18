-- ============================================================
-- RLS ENABLE SCRIPT - Ironcladgroup
-- Run ONCE in Supabase SQL Editor (production, off-peak hours)
-- Steps: 1) create helper function  2) create policies  3) enable RLS
-- All steps in one transaction for safety.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1 — Helper function
-- SECURITY DEFINER so it can read ls_users_metadata without
-- being blocked by its own RLS policy.
-- ============================================================

CREATE OR REPLACE FUNCTION is_employee()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ls_users_metadata
    WHERE id = auth.uid() AND user_type = 'employee'
  );
$$;

-- ============================================================
-- STEP 2 — Policies
-- Created BEFORE enabling RLS so the window of "no access" is
-- zero — policies go dormant until ENABLE fires below.
-- ============================================================

-- ----------------------------------------------------------
-- GROUP A: Lookup tables (manager-managed)
-- Rule: anyone authenticated can read; writes go through the
--       /api/manager route (supabaseAdmin bypasses RLS).
-- ----------------------------------------------------------

CREATE POLICY "select_authenticated" ON ls_origem         FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_status         FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_priority       FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_county         FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_auction_type   FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_auction_model  FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_property_type  FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_fema           FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_wetlands       FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_debit          FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_gismap         FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_property_access FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_road_access    FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_ref_construction FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_amenity_category FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_amenity_type   FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON ls_request_category FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------
-- GROUP B: Access control tables (managed via /api/access/*)
-- ----------------------------------------------------------

-- ls_profiles — everyone can read profile definitions
CREATE POLICY "select_authenticated" ON ls_profiles
  FOR SELECT TO authenticated USING (true);

-- ls_permissions — everyone can read profile permissions (needed by hasPermission())
CREATE POLICY "select_authenticated" ON ls_permissions
  FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------
-- GROUP C: User tables
-- ----------------------------------------------------------

-- ls_users_metadata — everyone reads (names, avatars, user_type);
--                     each user can update only their own row (avatar, display name).
--                     create/delete go through /api/users (supabaseAdmin).
CREATE POLICY "select_authenticated" ON ls_users_metadata
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "update_own" ON ls_users_metadata
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ls_user_profiles — junction user→profile; reads needed for permissions lookup;
--                    writes go through /api/access/user-assignment (supabaseAdmin).
CREATE POLICY "select_authenticated" ON ls_user_profiles
  FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------
-- GROUP D: ls_assets
-- Employees see everything; partners see only their own assets.
-- Writes are employees-only (create/edit auction from /auctions/new).
-- ----------------------------------------------------------

CREATE POLICY "employee_select" ON ls_assets
  FOR SELECT TO authenticated
  USING (is_employee());

CREATE POLICY "partner_select_own" ON ls_assets
  FOR SELECT TO authenticated
  USING (NOT is_employee() AND owner_partner_id = auth.uid());

CREATE POLICY "employee_insert" ON ls_assets
  FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY "employee_update" ON ls_assets
  FOR UPDATE TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

CREATE POLICY "employee_delete" ON ls_assets
  FOR DELETE TO authenticated
  USING (is_employee());

-- ----------------------------------------------------------
-- GROUP E: Asset sub-tables (amenities, marketing, tax)
-- Employees: full access.
-- Partners: SELECT only, restricted to their own asset's records.
-- ----------------------------------------------------------

-- ls_asset_amenities
CREATE POLICY "employee_all" ON ls_asset_amenities
  FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

CREATE POLICY "partner_select_own" ON ls_asset_amenities
  FOR SELECT TO authenticated
  USING (
    NOT is_employee() AND
    EXISTS (
      SELECT 1 FROM ls_assets
      WHERE ls_assets.id = asset_id
        AND ls_assets.owner_partner_id = auth.uid()
    )
  );

-- ls_asset_marketing
CREATE POLICY "employee_all" ON ls_asset_marketing
  FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

CREATE POLICY "partner_select_own" ON ls_asset_marketing
  FOR SELECT TO authenticated
  USING (
    NOT is_employee() AND
    EXISTS (
      SELECT 1 FROM ls_assets
      WHERE ls_assets.id = asset_id
        AND ls_assets.owner_partner_id = auth.uid()
    )
  );

-- ls_asset_tax
CREATE POLICY "employee_all" ON ls_asset_tax
  FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

CREATE POLICY "partner_select_own" ON ls_asset_tax
  FOR SELECT TO authenticated
  USING (
    NOT is_employee() AND
    EXISTS (
      SELECT 1 FROM ls_assets
      WHERE ls_assets.id = asset_id
        AND ls_assets.owner_partner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------
-- GROUP F: ls_audit_logs
-- Employees see all logs.
-- Partners see logs for their own assets only.
-- INSERT goes through /api/audit (supabaseAdmin).
-- ----------------------------------------------------------

CREATE POLICY "employee_select" ON ls_audit_logs
  FOR SELECT TO authenticated
  USING (is_employee());

CREATE POLICY "partner_select_own_assets" ON ls_audit_logs
  FOR SELECT TO authenticated
  USING (
    NOT is_employee() AND
    EXISTS (
      SELECT 1 FROM ls_assets
      WHERE ls_assets.id = asset_id
        AND ls_assets.owner_partner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------
-- GROUP G: ls_notifications
-- Each user sees and manages only their own notifications.
-- INSERT goes through supabaseAdmin (server-side triggers/functions).
-- ----------------------------------------------------------

CREATE POLICY "select_own" ON ls_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "update_own" ON ls_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete_own" ON ls_notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------------------------------------
-- GROUP H: ls_requests
-- Employees: full access (create, update status, delete).
-- Partners: SELECT only on requests where they are the requester.
-- ----------------------------------------------------------

CREATE POLICY "employee_select" ON ls_requests
  FOR SELECT TO authenticated
  USING (is_employee());

CREATE POLICY "employee_insert" ON ls_requests
  FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY "employee_update" ON ls_requests
  FOR UPDATE TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

CREATE POLICY "employee_delete" ON ls_requests
  FOR DELETE TO authenticated
  USING (is_employee());

CREATE POLICY "partner_select_own" ON ls_requests
  FOR SELECT TO authenticated
  USING (NOT is_employee() AND requester_id = auth.uid());

-- ----------------------------------------------------------
-- GROUP I: ls_request_comments
-- Employees: full access.
-- Partners: SELECT only on comments belonging to their own requests.
-- ----------------------------------------------------------

CREATE POLICY "employee_select" ON ls_request_comments
  FOR SELECT TO authenticated
  USING (is_employee());

CREATE POLICY "employee_insert" ON ls_request_comments
  FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY "employee_update" ON ls_request_comments
  FOR UPDATE TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

CREATE POLICY "employee_delete" ON ls_request_comments
  FOR DELETE TO authenticated
  USING (is_employee());

CREATE POLICY "partner_select_own_request_comments" ON ls_request_comments
  FOR SELECT TO authenticated
  USING (
    NOT is_employee() AND
    EXISTS (
      SELECT 1 FROM ls_requests
      WHERE ls_requests.id = request_id
        AND ls_requests.requester_id = auth.uid()
    )
  );

-- ============================================================
-- STEP 3 — Enable RLS on all tables
-- Policies above are already in place, so this flip is instant.
-- ============================================================

-- Group A: Lookups
ALTER TABLE ls_origem            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_status            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_priority          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_county            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_auction_type      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_auction_model     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_property_type     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_fema              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_wetlands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_debit             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_gismap            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_property_access   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_road_access       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_ref_construction  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_amenity_category  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_amenity_type      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_request_category  ENABLE ROW LEVEL SECURITY;

-- Group B: Access control
ALTER TABLE ls_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_permissions       ENABLE ROW LEVEL SECURITY;

-- Group C: Users
ALTER TABLE ls_users_metadata    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_user_profiles     ENABLE ROW LEVEL SECURITY;

-- Group D: Assets
ALTER TABLE ls_assets            ENABLE ROW LEVEL SECURITY;

-- Group E: Asset sub-tables
ALTER TABLE ls_asset_amenities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_asset_marketing   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_asset_tax         ENABLE ROW LEVEL SECURITY;

-- Group F: Audit
ALTER TABLE ls_audit_logs        ENABLE ROW LEVEL SECURITY;

-- Group G: Notifications
ALTER TABLE ls_notifications     ENABLE ROW LEVEL SECURITY;

-- Group H-I: Requests
ALTER TABLE ls_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ls_request_comments  ENABLE ROW LEVEL SECURITY;

COMMIT;
