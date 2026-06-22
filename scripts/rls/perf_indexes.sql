-- Performance indexes for Ironcladgroup
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- All statements use IF NOT EXISTS — safe to re-run.

-- ─── ls_assets ───────────────────────────────────────────────────────────────
-- Every single query on ls_assets filters by record_type (AUCTION / PROPERTY)
CREATE INDEX IF NOT EXISTS idx_ls_assets_record_type
  ON ls_assets (record_type);

-- Dashboard + auctions page filter by record_type + auction_date
CREATE INDEX IF NOT EXISTS idx_ls_assets_record_type_auction_date
  ON ls_assets (record_type, auction_date);

-- Properties page orders by ref_id DESC
CREATE INDEX IF NOT EXISTS idx_ls_assets_ref_id
  ON ls_assets (ref_id DESC);

-- RLS policies on ls_assets commonly reference owner_partner_id
CREATE INDEX IF NOT EXISTS idx_ls_assets_owner_partner_id
  ON ls_assets (owner_partner_id);

-- ─── ls_asset_tax ─────────────────────────────────────────────────────────────
-- recalc script + property page join always filter by asset_id
CREATE INDEX IF NOT EXISTS idx_ls_asset_tax_asset_id
  ON ls_asset_tax (asset_id);

-- ─── ls_requests ──────────────────────────────────────────────────────────────
-- Requests page filters by status_id, priority_id, category_id
CREATE INDEX IF NOT EXISTS idx_ls_requests_status_id
  ON ls_requests (status_id);

CREATE INDEX IF NOT EXISTS idx_ls_requests_assignee_id
  ON ls_requests (assignee_id);

CREATE INDEX IF NOT EXISTS idx_ls_requests_created_at
  ON ls_requests (created_at DESC);

-- ─── ls_users_metadata ────────────────────────────────────────────────────────
-- Joins from ls_requests (requester_id, assignee_id) and ls_assets (owner_partner_id)
CREATE INDEX IF NOT EXISTS idx_ls_users_metadata_user_type
  ON ls_users_metadata (user_type);
