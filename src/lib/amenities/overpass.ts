/**
 * Nearby-amenities lookup for an Auction record — primary provider.
 *
 * Free, no API key: geocoding via Nominatim and POIs via the Overpass API.
 * Both are public-good services with a fair-use policy — this module makes
 * a small, bounded number of sequential requests per lookup (never
 * parallel, never looped over many records at once) and always sends an
 * identifying User-Agent as their usage policy asks.
 *
 * See: MEMORY project_regrid.md sibling doc / conversation "amenidades" —
 * categories and default radius (5 miles) were defined by the business
 * (Ironcladgroup) for the "Find Amenities" button on the Auction form.
 * See src/app/api/auctions/[id]/amenities/route.ts for the fallback chain
 * to src/lib/amenities/locationiq.ts when this provider is unavailable.
 */

import {
  AmenityItem,
  AmenityResults,
  DEFAULT_RADIUS_MILES,
  MILES_TO_METERS,
  NAMED_PLACES,
  USER_AGENT,
  emptyResults,
  finalizeResults,
  haversineMiles,
  sleep,
} from "./shared";

// Single trusted Overpass endpoint. We tried failing over to public mirrors
// (e.g. overpass.osm.ch) but that's a data-correctness trap: mirrors can be
// out of sync or hold a regional extract, so they silently return an empty
// result instead of an error — verified live, the same US-coverage query
// returned 4 supermarkets from overpass-api.de and 0 from overpass.osm.ch.
// A wrong "none found" written to Surrounds is worse than a retry prompt, so
// instead we retry the ONE known-good server with backoff on 429/504.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_RETRIES = 1; // 1 retry (2 attempts total) per call — enough for a transient 429, not a queue
const OVERPASS_RETRY_DELAY_MS = 3_000;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_TIMEOUT_MS = 10_000;

// Category -> OSM tag definition. Kept in one place so the mapping is easy
// to audit/adjust (see "Sobre esta busca" sheet from the manual test run).
const POINT_CATEGORIES: Record<string, string> = {
  "Gas Station": 'node["amenity"="fuel"]',
  Hospital: 'node["amenity"="hospital"]',
  Pharmacy: 'node["amenity"="pharmacy"]',
  School: 'node["amenity"="school"]',
  Park: 'node["leisure"="park"]',
  Supermarket: 'node["shop"="supermarket"]',
  "Retail Store":
    'node["shop"~"^(mall|department_store|general|variety_store|clothes|shoes|electronics|furniture|hardware|doityourself|convenience|gift|books|jewelry|sports|toys)$"]',
  "Tourist Attraction":
    'node["tourism"~"^(attraction|museum|viewpoint|artwork|gallery|zoo)$"]',
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function overpassQuery(ql: string): Promise<any[]> {
  let lastError: string = "unknown error";
  for (let attempt = 0; attempt <= OVERPASS_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "User-Agent": USER_AGENT },
        body: ql,
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status === 504) {
        lastError = `overloaded (${res.status})`;
      } else if (!res.ok) {
        lastError = `responded ${res.status}`;
      } else {
        const json = await res.json();
        return json.elements || [];
      }
    } catch (e: any) {
      lastError = e?.name === "AbortError" ? "timed out" : e?.message || "failed";
    } finally {
      clearTimeout(timer);
    }
    if (attempt < OVERPASS_RETRIES) await sleep(OVERPASS_RETRY_DELAY_MS);
  }
  throw new Error(`Overpass API is rate-limited right now (${lastError})`);
}

/**
 * Geocode a free-text address via Nominatim (OSM). Used only as a fallback
 * when the asset has no `coordinates` value saved yet. Shared by both
 * providers — geocoding isn't the part that's been failing.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  const { lat, lon } = results[0];
  return { lat: parseFloat(lat), lon: parseFloat(lon) };
}

/**
 * Runs the Overpass queries (points, ways/relations, place labels, named
 * brands) and returns each category — plus each configured named place —
 * sorted by distance (nearest first). Throws if Overpass is unavailable —
 * the caller (the API route) falls back to LocationIQ on that.
 */
export async function fetchNearbyAmenities(
  lat: number,
  lon: number,
  radiusMiles: number = DEFAULT_RADIUS_MILES
): Promise<AmenityResults> {
  const radius = Math.round(radiusMiles * MILES_TO_METERS);
  const results: AmenityResults = emptyResults();

  // 1) Point amenities (amenity/shop/leisure/tourism) — one combined query.
  const pointsQl = `[out:json][timeout:8];
(
  ${Object.values(POINT_CATEGORIES)
    .map((tag) => `${tag}(around:${radius},${lat},${lon});`)
    .join("\n  ")}
);
out body;`;
  const points = await overpassQuery(pointsQl);
  for (const el of points) {
    const t = el.tags || {};
    if (el.lat == null || el.lon == null) continue;
    const distMi = haversineMiles(lat, lon, el.lat, el.lon);
    const baseName = t.name || "(unnamed)";
    if (t.amenity === "fuel") results["Gas Station"].push({ name: baseName + (t.brand ? ` - ${t.brand}` : ""), distMi });
    else if (t.amenity === "hospital") results.Hospital.push({ name: baseName, distMi });
    else if (t.amenity === "pharmacy") results.Pharmacy.push({ name: baseName, distMi });
    else if (t.amenity === "school") results.School.push({ name: baseName, distMi });
    else if (t.leisure === "park") results.Park.push({ name: baseName, distMi });
    else if (t.shop === "supermarket") results.Supermarket.push({ name: baseName + (t.brand ? ` - ${t.brand}` : ""), distMi });
    else if (t.shop) results["Retail Store"].push({ name: `${baseName} (${t.shop})`, distMi });
    else if (t.tourism) results["Tourist Attraction"].push({ name: `${baseName} (${t.tourism})`, distMi });
  }

  // 2) Ways/relations that need a centroid: lakes, airports, interstates.
  await sleep(1200); // be nice to the free API between calls
  const waysQl = `[out:json][timeout:8];
(
  way["natural"="water"]["water"~"^(lake|reservoir)$"](around:${radius},${lat},${lon});
  relation["natural"="water"]["water"~"^(lake|reservoir)$"](around:${radius},${lat},${lon});
  way["aeroway"="aerodrome"](around:${radius},${lat},${lon});
  node["aeroway"="aerodrome"](around:${radius},${lat},${lon});
  way["highway"="motorway"]["ref"~"^I "](around:${radius},${lat},${lon});
);
out center;`;
  const ways = await overpassQuery(waysQl);
  const interstateByRef = new Map<string, AmenityItem>();
  for (const el of ways) {
    const t = el.tags || {};
    const c = el.center || { lat: el.lat, lon: el.lon };
    if (c.lat == null || c.lon == null) continue;
    const distMi = haversineMiles(lat, lon, c.lat, c.lon);
    if (t.natural === "water") {
      results.Lake.push({ name: t.name || "(unnamed)", distMi });
    } else if (t.aeroway === "aerodrome") {
      results.Airport.push({ name: t.name || "(unnamed)", distMi });
    } else if (t.highway === "motorway") {
      const name = t.ref + (t.name ? ` - ${t.name}` : "");
      const prev = interstateByRef.get(name);
      if (!prev || distMi < prev.distMi) interstateByRef.set(name, { name, distMi });
    }
  }
  results.Interstate = [...interstateByRef.values()];

  // 3) Downtown proxy: nearest city/town label (+ a "Downtown" locality if
  // one exists), searched in a wider radius since city centers are sparse.
  await sleep(1200);
  const placeRadius = Math.max(radius, Math.round(15 * MILES_TO_METERS));
  const placesQl = `[out:json][timeout:8];
(
  node["place"~"^(suburb|quarter|neighbourhood|locality)$"]["name"~"Downtown"](around:${placeRadius},${lat},${lon});
  node["place"~"^(city|town)$"](around:${placeRadius},${lat},${lon});
);
out body;`;
  const places = await overpassQuery(placesQl);
  for (const el of places) {
    const t = el.tags || {};
    if (el.lat == null || el.lon == null) continue;
    const distMi = haversineMiles(lat, lon, el.lat, el.lon);
    results.Downtown.push({ name: `${t.name || ""} [${t.place}]`, distMi });
  }

  // 4) Named places — specific brands, matched by name regardless of tag.
  if (NAMED_PLACES.length) {
    await sleep(1200);
    const namePattern = NAMED_PLACES.map(escapeRegex).join("|");
    const namedQl = `[out:json][timeout:8];
(
  node["name"~"${namePattern}",i](around:${radius},${lat},${lon});
);
out body;`;
    const named = await overpassQuery(namedQl);
    for (const el of named) {
      const t = el.tags || {};
      if (el.lat == null || el.lon == null || !t.name) continue;
      const distMi = haversineMiles(lat, lon, el.lat, el.lon);
      const lowerName = t.name.toLowerCase();
      for (const brand of NAMED_PLACES) {
        if (lowerName.includes(brand.toLowerCase())) {
          results[brand].push({ name: t.name, distMi });
        }
      }
    }
  }

  return finalizeResults(results);
}
