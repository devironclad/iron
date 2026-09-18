/**
 * Nearby-amenities lookup — fallback provider, used only when Overpass
 * (src/lib/amenities/overpass.ts) is unavailable. LocationIQ hosts its own
 * OpenStreetMap-based infrastructure (not the shared public Overpass pool),
 * so it has a real per-account quota instead of a "fair use, no promises"
 * policy. Free tier, requires LOCATIONIQ_API_KEY (see .env.local) — the
 * business generated this key themselves; if it's not set, this provider is
 * simply skipped and the route falls straight to an error.
 *
 * Uses the same OSM tag vocabulary as the Overpass module (LocationIQ's
 * /nearby endpoint takes "key:value" OSM tags directly), so the category
 * list stays in sync conceptually even though it's a separate endpoint.
 * Two known gaps vs. Overpass, both acceptable for a fallback:
 *  - Interstate: LocationIQ doesn't expose the `ref` tag, so we can't filter
 *    to "ref starts with I " — falls back to all highway=motorway segments,
 *    identified by road name only (e.g. "Wilbur D. Mills Freeway" instead
 *    of "I 630 - Wilbur D. Mills Freeway").
 *  - Lake: can't filter to water=lake/reservoir specifically — returns any
 *    natural=water feature (could include a river) within range.
 */

import {
  AmenityItem,
  AmenityResults,
  DEFAULT_RADIUS_MILES,
  MAX_PER_CATEGORY,
  MILES_TO_METERS,
  NAMED_PLACES,
  USER_AGENT,
  emptyResults,
  finalizeResults,
  haversineMiles,
  sleep,
} from "./shared";

const BASE_URL = "https://us1.locationiq.com/v1";
const TIMEOUT_MS = 15_000;

// class:type tag -> our category name (mirrors overpass.ts's POINT_CATEGORIES,
// just flattened since LocationIQ's tag param is a plain "key:value" list).
const TAG_TO_CATEGORY: Record<string, string> = {
  "amenity:fuel": "Gas Station",
  "amenity:hospital": "Hospital",
  "amenity:pharmacy": "Pharmacy",
  "amenity:school": "School",
  "leisure:park": "Park",
  "shop:supermarket": "Supermarket",
};
const RETAIL_SHOP_TYPES = [
  "mall", "department_store", "general", "variety_store", "clothes", "shoes",
  "electronics", "furniture", "hardware", "doityourself", "convenience",
  "gift", "books", "jewelry", "sports", "toys",
];
const TOURISM_TYPES = ["attraction", "museum", "viewpoint", "artwork", "gallery", "zoo"];

async function locationiqGet(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) throw new Error("LOCATIONIQ_API_KEY is not configured");
  const qs = new URLSearchParams({ ...params, key, format: "json" });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}?${qs.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    });
    // LocationIQ's /nearby and /search return 404 "Unable to geocode"/"not
    // found" for a legitimate zero-result query (verified live) — not an
    // error, just an empty result set. A rural parcel with no lake/airport/
    // interstate within range hits this on every call, so it has to be
    // treated the same as a 200 with []. Any other non-OK status is a real
    // failure (bad key, rate limit, 5xx) and still throws.
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new Error(`LocationIQ responded ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function boundingBox(lat: number, lon: number, radiusMiles: number): string {
  const dLat = radiusMiles / 69; // ~69 miles per degree latitude
  const dLon = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180));
  const left = lon - dLon, right = lon + dLon, top = lat + dLat, bottom = lat - dLat;
  return `${left},${top},${right},${bottom}`;
}

export async function fetchNearbyAmenitiesViaLocationIQ(
  lat: number,
  lon: number,
  radiusMiles: number = DEFAULT_RADIUS_MILES
): Promise<AmenityResults> {
  const radius = Math.round(radiusMiles * MILES_TO_METERS);
  const results: AmenityResults = emptyResults();

  // 1) Point categories — split into 3 calls. LocationIQ's /nearby rejects
  // `tag` lists above ~16-20 entries with a plain 400 (verified empirically:
  // 16 tags OK, 22 tags fails), so the combined 28-tag list from
  // overpass.ts's POINT_CATEGORIES doesn't fit in one request here.
  const baseTags = Object.keys(TAG_TO_CATEGORY);
  const basePoints = await locationiqGet("/nearby", {
    lat: String(lat),
    lon: String(lon),
    tag: baseTags.join(","),
    radius: String(radius),
    limit: "100",
  });
  for (const el of basePoints) {
    if (el.lat == null || el.lon == null) continue;
    const distMi = haversineMiles(lat, lon, parseFloat(el.lat), parseFloat(el.lon));
    const cat = TAG_TO_CATEGORY[`${el.class}:${el.type}`];
    if (cat) results[cat].push({ name: el.name || "(unnamed)", distMi });
  }

  await sleep(500);
  const shopTags = RETAIL_SHOP_TYPES.map((t) => `shop:${t}`);
  const shopPoints = await locationiqGet("/nearby", {
    lat: String(lat),
    lon: String(lon),
    tag: shopTags.join(","),
    radius: String(radius),
    limit: "100",
  });
  for (const el of shopPoints) {
    if (el.lat == null || el.lon == null) continue;
    const distMi = haversineMiles(lat, lon, parseFloat(el.lat), parseFloat(el.lon));
    results["Retail Store"].push({ name: `${el.name || "(unnamed)"} (${el.type})`, distMi });
  }

  await sleep(500);
  const tourismTags = TOURISM_TYPES.map((t) => `tourism:${t}`);
  const tourismPoints = await locationiqGet("/nearby", {
    lat: String(lat),
    lon: String(lon),
    tag: tourismTags.join(","),
    radius: String(radius),
    limit: "100",
  });
  for (const el of tourismPoints) {
    if (el.lat == null || el.lon == null) continue;
    const distMi = haversineMiles(lat, lon, parseFloat(el.lat), parseFloat(el.lon));
    results["Tourist Attraction"].push({ name: `${el.name || "(unnamed)"} (${el.type})`, distMi });
  }

  // 2) Lakes, airports, interstates.
  await sleep(500);
  const ways = await locationiqGet("/nearby", {
    lat: String(lat),
    lon: String(lon),
    tag: "natural:water,aeroway:aerodrome,highway:motorway",
    radius: String(radius),
    limit: "50",
  });
  const interstateByName = new Map<string, AmenityItem>();
  for (const el of ways) {
    if (el.lat == null || el.lon == null) continue;
    const distMi = haversineMiles(lat, lon, parseFloat(el.lat), parseFloat(el.lon));
    const name = el.name || "(unnamed)";
    if (el.class === "natural" && el.type === "water") {
      results.Lake.push({ name, distMi });
    } else if (el.class === "aeroway" && el.type === "aerodrome") {
      results.Airport.push({ name, distMi });
    } else if (el.class === "highway" && el.type === "motorway") {
      const prev = interstateByName.get(name);
      if (!prev || distMi < prev.distMi) interstateByName.set(name, { name, distMi });
    }
  }
  results.Interstate = [...interstateByName.values()];

  // 3) Downtown proxy: nearest city/town label, wider radius.
  await sleep(500);
  const placeRadius = Math.max(radius, Math.round(15 * MILES_TO_METERS));
  const places = await locationiqGet("/nearby", {
    lat: String(lat),
    lon: String(lon),
    tag: "place:city,place:town",
    radius: String(placeRadius),
    limit: "10",
  });
  for (const el of places) {
    if (el.lat == null || el.lon == null) continue;
    const distMi = haversineMiles(lat, lon, parseFloat(el.lat), parseFloat(el.lon));
    results.Downtown.push({ name: `${el.name || ""} [${el.type}]`, distMi });
  }

  // 4) Named places — one /search call per configured brand, biased to a
  // bounding box around the point (bounded=1) instead of global search.
  const bbox = boundingBox(lat, lon, radiusMiles);
  for (const brand of NAMED_PLACES) {
    await sleep(500);
    try {
      const matches = await locationiqGet("/search", {
        q: brand,
        viewbox: bbox,
        bounded: "1",
        limit: String(MAX_PER_CATEGORY),
      });
      for (const el of matches) {
        if (el.lat == null || el.lon == null) continue;
        const distMi = haversineMiles(lat, lon, parseFloat(el.lat), parseFloat(el.lon));
        results[brand].push({ name: el.display_name?.split(",")[0] || brand, distMi });
      }
    } catch {
      // A single brand search failing shouldn't fail the whole lookup —
      // it'll just show "none found" for that one.
    }
  }

  return finalizeResults(results);
}
