/**
 * Shared types/constants/helpers between the amenities providers
 * (src/lib/amenities/overpass.ts — primary, free, no key — and
 * src/lib/amenities/locationiq.ts — fallback, free tier, needs an API key).
 * See src/app/api/auctions/[id]/amenities/route.ts for how they're chained.
 */

export const DEFAULT_RADIUS_MILES = 5;
export const MAX_PER_CATEGORY = 5;
export const MILES_TO_METERS = 1609.344;
const MILES_PER_MINUTE = 0.6; // business rule for estimating travel time

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

function estimateMinutes(distMi: number): number {
  return Math.max(1, Math.round(distMi / MILES_PER_MINUTE));
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
    source: "coordinates" | "geocoded";
    provider: "OpenStreetMap (Overpass)" | "OpenStreetMap (LocationIQ)";
  }
): string {
  const lines: string[] = [];
  lines.push(
    `Amenities (${meta.radiusMiles}mi radius, ${meta.lat.toFixed(5)}, ${meta.lon.toFixed(5)}) — ` +
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
