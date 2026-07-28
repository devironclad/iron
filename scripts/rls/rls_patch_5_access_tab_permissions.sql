-- ============================================================
-- PATCH 5 — Granular Access sub-page permissions
-- Splits the single "page:access" resource into two independent
-- resource keys: page:access:profiles (Profiles & Permissions tab)
-- and page:access:users (User Management tab). This seeds both
-- from each profile's existing "page:access" can_view/can_edit
-- values, so behavior is unchanged until an admin deliberately
-- differentiates them in the Access UI. Without this seed, the
-- new resource keys would have no rows and default to
-- deny-by-default for every profile (including Administrator),
-- locking everyone out of both Access sub-pages.
-- ============================================================

BEGIN;

INSERT INTO ls_permissions (profile_id, resource_key, can_view, can_edit)
SELECT profile_id, 'page:access:profiles', can_view, can_edit
FROM ls_permissions
WHERE resource_key = 'page:access'
ON CONFLICT (profile_id, resource_key) DO NOTHING;

INSERT INTO ls_permissions (profile_id, resource_key, can_view, can_edit)
SELECT profile_id, 'page:access:users', can_view, can_edit
FROM ls_permissions
WHERE resource_key = 'page:access'
ON CONFLICT (profile_id, resource_key) DO NOTHING;

COMMIT;
