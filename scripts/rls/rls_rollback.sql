-- ============================================================
-- RLS ROLLBACK SCRIPT - Ironcladgroup
-- Run if something breaks after rls_enable.sql.
-- DISABLES RLS on all tables → full access restored immediately.
-- Policies are left in place (dormant) so re-enable is safe.
-- ============================================================

BEGIN;

-- Group A: Lookups
ALTER TABLE ls_origem            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_status            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_priority          DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_county            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_auction_type      DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_auction_model     DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_property_type     DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_fema              DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_wetlands          DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_debit             DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_gismap            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_property_access   DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_road_access       DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_ref_construction  DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_amenity_category  DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_amenity_type      DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_request_category  DISABLE ROW LEVEL SECURITY;

-- Group B: Access control
ALTER TABLE ls_profiles          DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_permissions       DISABLE ROW LEVEL SECURITY;

-- Group C: Users
ALTER TABLE ls_users_metadata    DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_user_profiles     DISABLE ROW LEVEL SECURITY;

-- Group D: Assets
ALTER TABLE ls_assets            DISABLE ROW LEVEL SECURITY;

-- Group E: Asset sub-tables
ALTER TABLE ls_asset_amenities   DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_asset_marketing   DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_asset_tax         DISABLE ROW LEVEL SECURITY;

-- Group F: Audit
ALTER TABLE ls_audit_logs        DISABLE ROW LEVEL SECURITY;

-- Group G: Notifications
ALTER TABLE ls_notifications     DISABLE ROW LEVEL SECURITY;

-- Group H-I: Requests
ALTER TABLE ls_requests          DISABLE ROW LEVEL SECURITY;
ALTER TABLE ls_request_comments  DISABLE ROW LEVEL SECURITY;

COMMIT;
