/**
 * Imports COSL "List View" listings as new AUCTION rows in ls_assets.
 *
 * Field mapping (COSL -> ls_assets):
 *   Owner        -> observation
 *   County       -> county_id      (resolved against ls_county, state = 'AR')
 *   Parcel #     -> parcel_number
 *   Acres        -> size
 *   Starting Bid -> open_bid
 *   Listing URL  -> link_sources
 *   Added On     -> auction_date   (date portion)
 *   (fixed)         origem_id = "Land Tax or OTC", record_type = 'AUCTION'
 *   (dedup)         cosl_property_id = CoSLPropertyId
 *
 * Rules:
 *  - skip if the county is not already in ls_county (AR)
 *  - skip if cosl_property_id already exists on any ls_assets row
 *  - no updates on re-run; a deleted asset is re-created next run
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchCoslListings } from "./listings";

/** ls_origem row "Land Tax or OTC" */
const ORIGIN_LAND_TAX_OTC = "eca8b404-b924-4b77-b122-ed7a238bacb7";

/** COSL county name -> ls_county name, for known spelling differences (normalized keys). */
const COUNTY_ALIASES: Record<string, string> = {};

const normCounty = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ListingsImportResult {
  ok: boolean;
  error?: string;
  catalogTotal: number;
  afterDateFilter: number;
  inserted: number;
  skippedExisting: number;
  skippedNoCounty: number;
  skippedCounties: Record<string, number>;
  durationMs: number;
}

export async function runCoslListingsImport(dryRun = false): Promise<ListingsImportResult> {
  const started = Date.now();
  const base = {
    catalogTotal: 0,
    afterDateFilter: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedNoCounty: 0,
    skippedCounties: {} as Record<string, number>,
  };

  try {
    const { catalogTotal, listings } = await fetchCoslListings();
    base.catalogTotal = catalogTotal;
    base.afterDateFilter = listings.length;

    // AR counties: normalized name -> id
    const { data: counties, error: cErr } = await supabaseAdmin
      .from("ls_county")
      .select("id, name")
      .eq("state", "AR");
    if (cErr) throw new Error(`ls_county: ${cErr.message}`);
    const countyByName = new Map<string, string>();
    for (const c of counties ?? []) countyByName.set(normCounty(c.name), c.id);

    // Which cosl_property_ids are already imported
    const ids = listings.map((l) => l.coslPropertyId);
    const existing = new Set<number>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data: ex, error: exErr } = await supabaseAdmin
        .from("ls_assets")
        .select("cosl_property_id")
        .in("cosl_property_id", chunk);
      if (exErr) throw new Error(`ls_assets lookup: ${exErr.message}`);
      for (const r of ex ?? []) if (r.cosl_property_id != null) existing.add(Number(r.cosl_property_id));
    }

    for (const l of listings) {
      if (existing.has(l.coslPropertyId)) {
        base.skippedExisting++;
        continue;
      }

      const key = l.county ? normCounty(l.county) : "";
      const countyId = countyByName.get(key) ?? countyByName.get(COUNTY_ALIASES[key] ?? "");
      if (!countyId) {
        base.skippedNoCounty++;
        const label = l.county || "(blank)";
        base.skippedCounties[label] = (base.skippedCounties[label] ?? 0) + 1;
        continue;
      }

      if (dryRun) {
        base.inserted++;
        continue;
      }

      const { error: insErr } = await supabaseAdmin.from("ls_assets").insert({
        record_type: "AUCTION",
        origem_id: ORIGIN_LAND_TAX_OTC,
        observation: l.owner,
        county_id: countyId,
        parcel_number: l.parcelNumber,
        size: l.acreage,
        open_bid: l.startingBid,
        link_sources: l.listingUrl,
        auction_date: l.auctionDate, // Added On + 30 days
        cosl_property_id: l.coslPropertyId,
      });

      if (insErr) {
        // 23505 = unique_violation: it got imported concurrently — treat as skip.
        if ((insErr as { code?: string }).code === "23505") {
          base.skippedExisting++;
          continue;
        }
        throw new Error(`insert cosl_property_id=${l.coslPropertyId}: ${insErr.message}`);
      }
      base.inserted++;
    }

    const result: ListingsImportResult = { ok: true, ...base, durationMs: Date.now() - started };
    if (!dryRun) await writeMetaOk(result);
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 500) : "unknown listings import error";
    if (!dryRun) await writeMetaError(error, Date.now() - started);
    return { ok: false, error, ...base, durationMs: Date.now() - started };
  }
}

async function writeMetaOk(r: ListingsImportResult) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("cosl_listing_sync_meta")
    .update({
      last_run_at: now,
      last_success_at: now,
      status: "ok",
      message: null,
      catalog_total: r.catalogTotal,
      after_date_filter: r.afterDateFilter,
      inserted: r.inserted,
      skipped_existing: r.skippedExisting,
      skipped_no_county: r.skippedNoCounty,
      skipped_counties: r.skippedCounties,
      duration_ms: r.durationMs,
    })
    .eq("id", 1);
  if (error) console.error("cosl listings import: failed to write meta:", error.message);
}

async function writeMetaError(message: string, durationMs: number) {
  const { error } = await supabaseAdmin
    .from("cosl_listing_sync_meta")
    .update({ last_run_at: new Date().toISOString(), status: "error", message, duration_ms: durationMs })
    .eq("id", 1);
  if (error) console.error("cosl listings import: failed to write error meta:", error.message);
}
