/**
 * "Find Amenities" button on the Properties -> Amenities tab
 * (src/app/properties/[id]/page.tsx). Same search as the Auctions button
 * (src/lib/amenities/lookup.ts), but every item found becomes its own row in
 * ls_asset_amenities instead of one text block in ls_assets.surrounds
 * (Surrounds is NOT touched here).
 *
 * Rules (business, 2026-11-06):
 *  - Up to 3 items per category, Airport/Downtown up to 2 (nearest first).
 *  - Search categories map onto the existing catalog categories — no new
 *    category is ever created. Park -> Square, Tourist Attraction -> Theme
 *    Park, Retail Store -> Mall, Walmart/Publix -> Supermarket,
 *    Walgreens/CVS -> Pharmacy.
 *  - The amenity type (ls_amenity_type) is the cleaned place name; reused if
 *    it already exists in that category (case-insensitive), created otherwise.
 *  - Re-running replaces only the rows this button created
 *    (ls_asset_amenities.source = 'auto'); manual rows are never touched, and a
 *    type that already exists as a manual row on the property is skipped.
 *
 * A per-property lock (src/lib/amenities/lock.ts) blocks a second run while one
 * is in progress (409); GET reports it so the page can resume after the user
 * leaves and comes back.
 *
 * Same permission ("action:find_amenities") and global 15s cool-down as the
 * Auctions route.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { userHasPermission } from "@/lib/server-permissions";
import { logSystemAction } from "@/lib/activity";
import { geocodeAddress } from "@/lib/amenities/overpass";
import { lookupAmenities } from "@/lib/amenities/lookup";
import { acquireAmenitiesLock, isAmenitiesLookupRunning, releaseAmenitiesLock } from "@/lib/amenities/lock";
import { CATEGORY_ORDER, NAMED_PLACES, estimateMinutes } from "@/lib/amenities/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MIN_INTERVAL_MS = 15_000;
const MAX_PER_CATEGORY = 3;
const MAX_WIDE_CATEGORY = 2;

// Search category -> catalog category (ls_amenity_category.name).
const CATEGORY_MAP: Record<string, string> = {
  Airport: "Airport",
  Downtown: "Downtown",
  "Gas Station": "Gas Station",
  Hospital: "Hospital",
  Interstate: "Interstate",
  Lake: "Lake",
  Pharmacy: "Pharmacy",
  School: "School",
  Park: "Square",
  Supermarket: "Supermarket",
  "Retail Store": "Mall",
  "Tourist Attraction": "Theme Park",
  Walmart: "Supermarket",
  Publix: "Supermarket",
  Walgreens: "Pharmacy",
  CVS: "Pharmacy",
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function parseCoordinates(raw: string | null): { lat: number; lon: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => parseFloat(p.trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [lat, lon] = parts;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** "Shell - Shell" -> "Shell", "Ross (clothes)" -> "Ross", "Ocala [city]" -> "Ocala". */
function cleanName(raw: string, searchCategory: string): string {
  let name = raw.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/, "").trim();
  if (name.includes(" - ") && (searchCategory === "Gas Station" || searchCategory === "Supermarket")) {
    // baseName + " - brand": the catalog uses the brand ("Shell", "Walmart").
    const brand = name.split(" - ").pop()!.trim();
    if (brand) name = brand;
  } else if (name.includes(" - ")) {
    const [a, b] = name.split(" - ").map((s) => s.trim());
    if (a && b && norm(a) === norm(b)) name = a;
  }
  return name;
}

/** Status for the page: is a lookup for this property still running? */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = Number(id);
  if (!assetId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ running: await isAmenitiesLookupRunning(assetId) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = Number(id);
  if (!assetId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let lockedBy: string | null = null;
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!(await userHasPermission(user.id, "action:find_amenities"))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (await isAmenitiesLookupRunning(assetId)) {
      return NextResponse.json({ running: true, error: "A search for this property is already in progress." }, { status: 409 });
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
    if (assetError || !asset) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    if (asset.record_type !== "PROPERTY") {
      return NextResponse.json({ error: "Not a property record" }, { status: 400 });
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
      if (!geo) return NextResponse.json({ error: "Couldn't geocode this record's address." }, { status: 422 });
      point = geo;
      source = "geocoded";
    }

    if (!(await acquireAmenitiesLock(user.id, assetId))) {
      return NextResponse.json({ running: true, error: "A search for this property is already in progress." }, { status: 409 });
    }
    lockedBy = user.id;

    await logSystemAction(user.id, "ls_assets", "AMENITIES_LOOKUP");

    const lookup = await lookupAmenities(point.lat, point.lon);
    if (lookup.allFailed) {
      return NextResponse.json({ error: lookup.sectionErrors.join(" | ") }, { status: 502 });
    }

    // ---- Catalog (categories + types) ----
    const [{ data: cats }, { data: types }] = await Promise.all([
      supabaseAdmin.from("ls_amenity_category").select("id, name"),
      supabaseAdmin.from("ls_amenity_type").select("id, name, category_id"),
    ]);
    const catIdByName = new Map((cats || []).map((c) => [norm(c.name), c.id as string]));
    const typeIdByKey = new Map((types || []).map((t) => [`${t.category_id}|${norm(t.name)}`, t.id as string]));

    // ---- Candidates ----
    // Per search category: clean names, collapse duplicates (keep nearest),
    // THEN apply the limit — otherwise 3 branches of the same store would eat
    // the whole quota. Retail Store / Tourist Attraction items whose name
    // already exists in the catalog under another category (e.g. "Dollar
    // General" -> Dollar Store) go to that category instead of Mall/Theme Park.
    const catNameById = new Map((cats || []).map((c) => [c.id as string, c.name as string]));
    const catalogCatByTypeName = new Map<string, string>();
    for (const t of types || []) {
      const n = catNameById.get(t.category_id as string);
      if (n && !catalogCatByTypeName.has(norm(t.name))) catalogCatByTypeName.set(norm(t.name), n);
    }
    type Cand = { catalogCat: string; typeName: string; distMi: number };
    const best = new Map<string, Cand>();
    for (const searchCat of CATEGORY_ORDER) {
      const defaultCat = CATEGORY_MAP[searchCat];
      if (!defaultCat) continue;
      const isNamed = NAMED_PLACES.includes(searchCat);
      const limit = isNamed ? 1 : searchCat === "Airport" || searchCat === "Downtown" ? MAX_WIDE_CATEGORY : MAX_PER_CATEGORY;
      const byName = new Map<string, { typeName: string; distMi: number }>();
      for (const it of lookup.results[searchCat] || []) {
        const typeName = isNamed ? searchCat : cleanName(it.name, searchCat);
        if (!typeName || typeName === "(unnamed)") continue;
        const k = norm(typeName);
        const prev = byName.get(k);
        if (!prev || it.distMi < prev.distMi) byName.set(k, { typeName, distMi: it.distMi });
      }
      const items = [...byName.values()].sort((x, y) => x.distMi - y.distMi).slice(0, limit);
      for (const it of items) {
        const reroute = searchCat === "Retail Store" || searchCat === "Tourist Attraction";
        const catalogCat = (reroute && catalogCatByTypeName.get(norm(it.typeName))) || defaultCat;
        const key = `${catalogCat}|${norm(it.typeName)}`;
        const prev = best.get(key);
        if (!prev || it.distMi < prev.distMi) best.set(key, { catalogCat, typeName: it.typeName, distMi: it.distMi });
      }
    }

    // ---- Existing rows on this property ----
    const { data: existing } = await supabaseAdmin
      .from("ls_asset_amenities")
      .select("amenity_type_id, source")
      .eq("asset_id", assetId);
    const manualTypeIds = new Set((existing || []).filter((r) => r.source !== "auto").map((r) => r.amenity_type_id as string));

    // ---- Resolve / create types, build rows ----
    const rows: any[] = [];
    let createdTypes = 0;
    let skippedManual = 0;
    for (const c of best.values()) {
      const categoryId = catIdByName.get(norm(c.catalogCat));
      if (!categoryId) continue; // catalog category missing — never create categories
      const key = `${categoryId}|${norm(c.typeName)}`;
      let typeId = typeIdByKey.get(key);
      if (!typeId) {
        const { data: created, error: typeErr } = await supabaseAdmin
          .from("ls_amenity_type")
          .insert({ category_id: categoryId, name: c.typeName })
          .select("id")
          .single();
        if (typeErr || !created) continue;
        typeId = created.id as string;
        typeIdByKey.set(key, typeId);
        createdTypes++;
      }
      if (manualTypeIds.has(typeId)) {
        skippedManual++;
        continue;
      }
      rows.push({
        asset_id: assetId,
        amenity_type_id: typeId,
        distance_miles: Math.round(c.distMi * 10) / 10,
        time_minutes: estimateMinutes(c.distMi),
        source: "auto",
      });
    }

    // ---- Replace only the previous 'auto' rows ----
    const { error: delError } = await supabaseAdmin
      .from("ls_asset_amenities")
      .delete()
      .eq("asset_id", assetId)
      .eq("source", "auto");
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    if (rows.length) {
      const { error: insError } = await supabaseAdmin.from("ls_asset_amenities").insert(rows);
      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      inserted: rows.length,
      createdTypes,
      skippedManual,
      source,
      provider: `OpenStreetMap (${lookup.providersUsed.join(", ") || "unavailable"})`,
      partialFailures: lookup.sectionErrors.length ? lookup.sectionErrors : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  } finally {
    if (lockedBy) await releaseAmenitiesLock(lockedBy, assetId);
  }
}
