/**
 * "Find Amenities" button on the Auction edit form
 * (src/app/auctions/new/page.tsx). Looks up nearby amenities for one
 * Auction record and saves the formatted result into the existing
 * ls_assets.surrounds field (overwrites it — by design, per the business:
 * no new column, this button is the source of truth for Surrounds).
 *
 * Two providers, tried in order:
 *  1. Overpass (src/lib/amenities/overpass.ts) — free, no key, primary.
 *  2. LocationIQ (src/lib/amenities/locationiq.ts) — free tier, needs
 *     LOCATIONIQ_API_KEY; used only if Overpass throws (rate-limited/down).
 *     Skipped silently if no key is configured.
 *
 * Uses the record's saved `coordinates` field when present; otherwise
 * falls back to geocoding `address` via Nominatim. Gated by its own Access
 * permission ("action:find_amenities", see src/app/access/page.tsx RESOURCES)
 * rather than the general page:auctions edit right — the business hands
 * this out per employee independently of general auction-edit access.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { userHasPermission } from "@/lib/server-permissions";
import { logSystemAction } from "@/lib/activity";
import { fetchNearbyAmenities, geocodeAddress } from "@/lib/amenities/overpass";
import { fetchNearbyAmenitiesViaLocationIQ } from "@/lib/amenities/locationiq";
import { DEFAULT_RADIUS_MILES, formatAmenitiesText } from "@/lib/amenities/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150; // worst case: Overpass chain (4 calls x 2 attempts x 10s + retries) then the LocationIQ fallback chain (7 calls)

// OpenStreetMap (Overpass/Nominatim) has no per-account daily quota, but both
// enforce a fair-use policy at the IP level (Nominatim: max ~1 req/s;
// Overpass: no fixed number, but bursts get a 429). Every server instance of
// this app shares one outbound IP, so a global (not per-user) cool-down
// between lookups protects the whole team from tripping that limit — not
// just the person clicking twice. Reuses the existing activity_log instead
// of a new table/column.
const MIN_INTERVAL_MS = 15_000;

function parseCoordinates(raw: string | null): { lat: number; lon: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => parseFloat(p.trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [lat, lon] = parts;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = Number(id);
  if (!assetId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Gated by its own Access -> Actions permission, not the general
  // page:auctions edit right — lets the business hand this out per employee
  // (Access -> Actions -> "Find Amenities (Auctions)"), same pattern as
  // action:copy_auction / action:export_auctions.
  if (!(await userHasPermission(user.id, "action:find_amenities"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: lastRun } = await supabaseAdmin
    .from("activity_log")
    .select("changed_at")
    .eq("table_name", "ls_assets")
    .eq("operation", "AMENITIES_LOOKUP")
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sinceMs = lastRun ? Date.now() - new Date(lastRun.changed_at).getTime() : Infinity;
  if (sinceMs < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { throttled: true, retryInSec: Math.ceil((MIN_INTERVAL_MS - sinceMs) / 1000) },
      { status: 429 }
    );
  }

  const { data: asset, error: assetError } = await supabaseAdmin
    .from("ls_assets")
    .select("id, record_type, address, coordinates")
    .eq("id", assetId)
    .single();
  if (assetError || !asset) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }
  if (asset.record_type !== "AUCTION") {
    return NextResponse.json({ error: "Not an auction record" }, { status: 400 });
  }

  let point = parseCoordinates(asset.coordinates);
  let source: "coordinates" | "geocoded" = "coordinates";
  if (!point) {
    if (!asset.address) {
      return NextResponse.json(
        { error: "This record has no Coordinates or Address set — can't search for amenities." },
        { status: 422 }
      );
    }
    const geo = await geocodeAddress(asset.address);
    if (!geo) {
      return NextResponse.json(
        { error: "Couldn't geocode this record's address." },
        { status: 422 }
      );
    }
    point = geo;
    source = "geocoded";
  }

  // Mark the cool-down right before hitting Overpass — not only on success.
  // A failed/timed-out attempt still burns through several Overpass
  // requests, so it needs to count against the throttle too; otherwise
  // repeated failures (Overpass having a bad minute) let the user retry
  // immediately, piling up bursts instead of backing off.
  await logSystemAction(user.id, "ls_assets", "AMENITIES_LOOKUP");

  let results;
  let provider: "OpenStreetMap (Overpass)" | "OpenStreetMap (LocationIQ)" = "OpenStreetMap (Overpass)";
  try {
    results = await fetchNearbyAmenities(point.lat, point.lon, DEFAULT_RADIUS_MILES);
  } catch (overpassErr: any) {
    if (!process.env.LOCATIONIQ_API_KEY) {
      return NextResponse.json(
        { error: overpassErr.message || "Amenities lookup failed" },
        { status: 502 }
      );
    }
    try {
      results = await fetchNearbyAmenitiesViaLocationIQ(point.lat, point.lon, DEFAULT_RADIUS_MILES);
      provider = "OpenStreetMap (LocationIQ)";
    } catch (locationiqErr: any) {
      return NextResponse.json(
        {
          error:
            `Overpass: ${overpassErr.message || "failed"}. ` +
            `LocationIQ fallback also failed: ${locationiqErr.message || "failed"}.`,
        },
        { status: 502 }
      );
    }
  }

  const text = formatAmenitiesText(results, {
    lat: point.lat,
    lon: point.lon,
    radiusMiles: DEFAULT_RADIUS_MILES,
    source,
    provider,
  });

  const { error: updateError } = await supabaseAdmin
    .from("ls_assets")
    .update({ surrounds: text })
    .eq("id", assetId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, text, lat: point.lat, lon: point.lon, source, provider });
}
