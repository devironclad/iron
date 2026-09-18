-- ============================================================
-- PATCH 22 — Granular "Find Amenities" action permission
--
-- Decouples the "Find Amenities" button on the Auction form (and its API
-- route, src/app/api/auctions/[id]/amenities/route.ts) from the general
-- page:auctions edit permission, so it can be turned on/off per employee
-- independently via Access -> Actions.
--
-- Seeds action:find_amenities from each profile's current page:auctions
-- can_edit value, so nobody who could already use the button loses access
-- on day one — it just becomes independently toggleable from here on.
-- Same seeding pattern as rls_patch_5_access_tab_permissions.sql.
-- ============================================================

BEGIN;

INSERT INTO ls_permissions (profile_id, resource_key, can_view, can_edit)
SELECT profile_id, 'action:find_amenities', can_edit, can_edit
FROM ls_permissions
WHERE resource_key = 'page:auctions'
ON CONFLICT (profile_id, resource_key) DO NOTHING;

COMMIT;
