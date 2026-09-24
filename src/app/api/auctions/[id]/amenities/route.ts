/**
 * "Find Amenities" button on the Auction edit form
 * (src/app/auctions/new/page.tsx). Looks up nearby amenities for one
 * Auction record and saves the formatted result into the existing
 * ls_assets.surrounds field (overwrites it — by design, per the business:
 * no new column, this button is the source of truth for Surrounds).
 *
 * Three independent sections, each with its own provider order (2026-09-22:
 * Airport/Downtown search a 100mi radius per the business — Overpass can't
 * reliably do that for Downtown, see src/lib/amenities/shared.ts):
 *  1. Standard categories (5mi, everything except Airport/Downtown):
 *     Overpass primary, LocationIQ fallback.
 *  2. Airport (100mi): LocationIQ primary (fast), Overpass fallback (works,
 *     just slow — single attempt).
 *  3. Downtown (100mi): LocationIQ primary (Overpass 504s above ~25-30mi),
 *     Overpass fallback at a DEGRADED 25mi radius only.
 * LocationIQ needs LOCATIONIQ_API_KEY (.env.local) — skipped silently if
 * unset, in which case Airport/Downtown fall straight to Overpass.
 *
 * A section that fails on both providers shows "none found" rather than
 * failing the whole request — the request only errors out if ALL THREE
 * sections fail.
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
import {
  fetchAirportViaOverpass,
  fetchDowntownViaOverpass,
  fetchNearbyAmenities,
  geocodeAddress,
} from "@/lib/amenities/overpass";
import {
  fetchAirportViaLocationIQ,
  fetchDowntownViaLocationIQ,
  fetchNearbyAmenitiesViaLocationIQ,
} from "@/lib/amenities/locationiq";
import {
  DEFAULT_RADIUS_MILES,
  OVERPASS_DOWNTOWN_FALLBACK_MILES,
  WIDE_RADIUS_MILES,
  emptyResults,
  formatAmenitiesText,
  sleep,
} from "@/lib/amenities/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180; // worst case: standard section (~66s) + Airport Overpass fallback (~22s) + Downtown Overpass fallback (~23s) + sleeps/geocode/db

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

  try {
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

  const hasLocationIQ = !!process.env.LOCATIONIQ_API_KEY;
  const providersUsed = new Set<string>();
  const sectionErrors: string[] = [];

  // 1) Standard categories (5mi) — Overpass primary, LocationIQ fallback.
  let results = emptyResults();
  let standardOk = false;
  try {
    results = await fetchNearbyAmenities(point.lat, point.lon, DEFAULT_RADIUS_MILES);
    providersUsed.add("Overpass");
    standardOk = true;
  } catch (overpassErr: any) {
    if (hasLocationIQ) {
      try {
        results = await fetchNearbyAmenitiesViaLocationIQ(point.lat, point.lon, DEFAULT_RADIUS_MILES);
        providersUsed.add("LocationIQ");
        standardOk = true;
      } catch (liqErr: any) {
        sectionErrors.push(`standard categories: Overpass ${overpassErr.message}; LocationIQ ${liqErr.message}`);
      }
    } else {
      sectionErrors.push(`standard categories: Overpass ${overpassErr.message}`);
    }
  }

  await sleep(300);

  // 2) Airport (100mi) — LocationIQ primary, Overpass fallback.
  let airportOk = false;
  if (hasLocationIQ) {
    try {
      results.Airport = await fetchAirportViaLocationIQ(point.lat, point.lon, WIDE_RADIUS_MILES);
      providersUsed.add("LocationIQ");
      airportOk = true;
    } catch (liqErr: any) {
      try {
        results.Airport = await fetchAirportViaOverpass(point.lat, point.lon, WIDE_RADIUS_MILES);
        providersUsed.add("Overpass");
        airportOk = true;
      } catch (opErr: any) {
        sectionErrors.push(`Airport: LocationIQ ${liqErr.message}; Overpass ${opErr.message}`);
      }
    }
  } else {
    try {
      results.Airport = await fetchAirportViaOverpass(point.lat, point.lon, WIDE_RADIUS_MILES);
      providersUsed.add("Overpass");
      airportOk = true;
    } catch (opErr: any) {
      sectionErrors.push(`Airport: Overpass ${opErr.message}`);
    }
  }

  await sleep(300);

  // 3) Downtown (100mi primary / 25mi degraded fallback) — LocationIQ primary.
  let downtownOk = false;
  if (hasLocationIQ) {
    try {
      results.Downtown = await fetchDowntownViaLocationIQ(point.lat, point.lon, WIDE_RADIUS_MILES);
      providersUsed.add("LocationIQ");
      downtownOk = true;
    } catch (liqErr: any) {
      try {
        results.Downtown = await fetchDowntownViaOverpass(point.lat, point.lon, OVERPASS_DOWNTOWN_FALLBACK_MILES);
        providersUsed.add("Overpass");
        downtownOk = true;
      } catch (opErr: any) {
        sectionErrors.push(`Downtown: LocationIQ ${liqErr.message}; Overpass ${opErr.message}`);
      }
    }
  } else {
    try {
      results.Downtown = await fetchDowntownViaOverpass(point.lat, point.lon, OVERPASS_DOWNTOWN_FALLBACK_MILES);
      providersUsed.add("Overpass");
      downtownOk = true;
    } catch (opErr: any) {
      sectionErrors.push(`Downtown: Overpass ${opErr.message}`);
    }
  }

  // Only fail the whole request if every section failed on every provider —
  // a section that comes up empty otherwise just shows "none found".
  if (!standardOk && !airportOk && !downtownOk) {
    return NextResponse.json({ error: sectionErrors.join(" | ") }, { status: 502 });
  }

  const provider = `OpenStreetMap (${[...providersUsed].join(", ") || "unavailable"})`;
  const text = formatAmenitiesText(results, {
    lat: point.lat,
    lon: point.lon,
    radiusMiles: DEFAULT_RADIUS_MILES,
    wideRadiusMiles: WIDE_RADIUS_MILES,
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

  return NextResponse.json({
    ok: true,
    text,
    lat: point.lat,
    lon: point.lon,
    source,
    provider,
    partialFailures: sectionErrors.length ? sectionErrors : undefined,
  });
  } catch (e: any) {
    // Safety net: anything thrown above (geocodeAddress's fetch has no
    // timeout/retry, a Supabase call could throw, etc.) would otherwise
    // surface as an unhandled exception -> Next.js dev error-page HTML ->
    // the client's res.json() fails with a cryptic "unexpected character"
    // parse error instead of a readable message.
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
