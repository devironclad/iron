/**
 * Shared types/constants/helpers between the amenities providers
 * (src/lib/amenities/overpass.ts — primary, free, no key — and
 * src/lib/amenities/locationiq.ts — fallback, free tier, needs an API key).
 * See src/app/api/auctions/[id]/amenities/route.ts for how they're chained.
 */

export const DEFAULT_RADIUS_MILES = 5;
export const MAX_PER_CATEGORY = 5;
export const MILES_TO_METERS = 1609.344;

// Business rule (2026-09-22): Airport and Downtown search a much wider area
// than everything else, because they're naturally farther away than a gas
// station or school. Overpass (the free public instance) can't reliably
// search place=city/town beyond ~25-30mi before timing out (504, verified
// live up to 3x) — LocationIQ's hosted infra handles the full 100mi in
// ~200ms, so it's the primary source for these two categories specifically,
// with Overpass as a degraded-radius fallback for Downtown only (Airport's
// aerodrome query does complete at 100mi on Overpass, just slowly ~11s).
export const WIDE_RADIUS_CATEGORIES = ["Airport", "Downtown"];
export const WIDE_RADIUS_MILES = 100;
export const OVERPASS_DOWNTOWN_FALLBACK_MILES = 25; // proven-safe Overpass ceiling for place=city/town

// Travel-time estimate: local roads (<=10mi) vs. highway (>10mi) speed.
const LOCAL_MILES_PER_MINUTE = 0.6; // ~36 mph
const HIGHWAY_MILES_PER_MINUTE = 1.0; // ~60 mph

export const USER_AGENT = "IroncladGroupApp/1.0 (info@ironcladgroup.org)";

export type AmenityItem = { name: string; distMi: number };
export type AmenityResults = Record<string, AmenityItem[]>;

// Specific brand/business names to look for regardless of how the county
// tagged them (a Walmart can be shop=supermarket, shop=department_store or
// shop=general in OSM, which makes it easy to miss from the tag-based
// categories, or to fall past the MAX_PER_CATEGORY cutoff). Business list —
// add/remove names here as needed, no other code change required.
export const NAMED_PLACES: string[] = ["Walmart", "Publix", "Walgreens", "CVS"];

export const CATEGORY_ORDER = [
  "Airport",
  "Downtown",
  "Gas Station",
  "Hospital",
  "Interstate",
  "Lake",
  "Pharmacy",
  "School",
  "Park",
  "Supermarket",
  "Retail Store",
  "Tourist Attraction",
  ...NAMED_PLACES,
];

export function emptyResults(): AmenityResults {
  const results: AmenityResults = {};
  for (const cat of CATEGORY_ORDER) results[cat] = [];
  return results;
}

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const meters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return meters / MILES_TO_METERS;
}

export function dedupe(items: AmenityItem[]): AmenityItem[] {
  const seen = new Set<string>();
  return items.filter((r) => {
    const key = `${r.name}|${Math.round(r.distMi * 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function finalizeResults(results: AmenityResults): AmenityResults {
  for (const cat of Object.keys(results)) {
    results[cat] = dedupe(results[cat])
      .sort((a, b) => a.distMi - b.distMi)
      .slice(0, MAX_PER_CATEGORY);
  }
  return results;
}

const HIGHWAY_THRESHOLD_MILES = 10;

function estimateMinutes(distMi: number): number {
  const mpm = distMi > HIGHWAY_THRESHOLD_MILES ? HIGHWAY_MILES_PER_MINUTE : LOCAL_MILES_PER_MINUTE;
  return Math.max(1, Math.round(distMi / mpm));
}

/**
 * Renders the results into the single text block saved to
 * ls_assets.surrounds — one line per item (up to MAX_PER_CATEGORY per
 * category): "Category - Name - Distance - Time".
 */
export function formatAmenitiesText(
  results: AmenityResults,
  meta: {
    lat: number;
    lon: number;
    radiusMiles: number;
    wideRadiusMiles: number;
    source: "coordinates" | "geocoded";
    /** Provider(s) actually used, e.g. "OpenStreetMap (Overpass)" or "OpenStreetMap (Overpass, LocationIQ)". */
    provider: string;
  }
): string {
  const lines: string[] = [];
  lines.push(
    `Amenities (${meta.radiusMiles}mi radius, ${meta.wideRadiusMiles}mi for Airport/Downtown, ` +
      `${meta.lat.toFixed(5)}, ${meta.lon.toFixed(5)}) — ` +
      `${meta.source === "coordinates" ? "record coordinates" : "geocoded address"} · ` +
      `${meta.provider} · ${new Date().toLocaleString("en-US")}`
  );
  lines.push("");
  for (const cat of CATEGORY_ORDER) {
    const items = results[cat] || [];
    if (!items.length) {
      lines.push(`${cat} - none found`);
      continue;
    }
    for (const item of items) {
      lines.push(`${cat} - ${item.name} - ${item.distMi.toFixed(2)}mi - ${estimateMinutes(item.distMi)}min`);
    }
  }
  return lines.join("\n");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
