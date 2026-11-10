-- Marks how each ls_asset_amenities row was created, so the Properties
-- "Find Amenities" button can replace only its own rows ('auto') and never
-- touch manually entered ones. Existing rows become 'manual' via the default.
ALTER TABLE ls_asset_amenities
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual','auto'));
