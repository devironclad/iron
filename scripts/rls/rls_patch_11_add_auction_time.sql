-- ============================================================
-- PATCH 11 — Add auction_time column to ls_assets
-- auction_date was changed from timestamp to date in v1.7.0 to fix
-- ID ordering within the same auction day, and can no longer store a
-- time-of-day. Rather than reverting that (and risking the ordering
-- issue it fixed), this adds a separate auction_time column so the
-- Auction Date field can keep an editable time-of-day without
-- touching auction_date or any auction_date-based ordering/filtering.
-- ============================================================

BEGIN;

ALTER TABLE ls_assets
  ADD COLUMN IF NOT EXISTS auction_time TIME;

COMMIT;
