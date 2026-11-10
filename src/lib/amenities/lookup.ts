/**
 * Provider chain shared by the Auctions and Properties "Find Amenities"
 * routes (src/app/api/auctions/[id]/amenities and
 * src/app/api/properties/[id]/amenities). Three independent sections, each
 * with its own provider order — see the Auctions route header for the why.
 * A section that fails on every provider just comes back empty; the caller
 * decides what to do when ALL sections failed (`allFailed`).
 */

import {
  fetchAirportViaOverpass,
  fetchDowntownViaOverpass,
  fetchNearbyAmenities,
} from "@/lib/amenities/overpass";
import {
  fetchAirportViaLocationIQ,
  fetchDowntownViaLocationIQ,
  fetchNearbyAmenitiesViaLocationIQ,
} from "@/lib/amenities/locationiq";
import {
  AmenityResults,
  DEFAULT_RADIUS_MILES,
  OVERPASS_DOWNTOWN_FALLBACK_MILES,
  WIDE_RADIUS_MILES,
  emptyResults,
  sleep,
} from "@/lib/amenities/shared";

export type AmenitiesLookup = {
  results: AmenityResults;
  providersUsed: string[];
  sectionErrors: string[];
  allFailed: boolean;
};

export async function lookupAmenities(lat: number, lon: number): Promise<AmenitiesLookup> {
  const hasLocationIQ = !!process.env.LOCATIONIQ_API_KEY;
  const providersUsed = new Set<string>();
  const sectionErrors: string[] = [];

  // 1) Standard categories (5mi) — Overpass primary, LocationIQ fallback.
  let results = emptyResults();
  let standardOk = false;
  try {
    results = await fetchNearbyAmenities(lat, lon, DEFAULT_RADIUS_MILES);
    providersUsed.add("Overpass");
    standardOk = true;
  } catch (overpassErr: any) {
    if (hasLocationIQ) {
      try {
        results = await fetchNearbyAmenitiesViaLocationIQ(lat, lon, DEFAULT_RADIUS_MILES);
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
      results.Airport = await fetchAirportViaLocationIQ(lat, lon, WIDE_RADIUS_MILES);
      providersUsed.add("LocationIQ");
      airportOk = true;
    } catch (liqErr: any) {
      try {
        results.Airport = await fetchAirportViaOverpass(lat, lon, WIDE_RADIUS_MILES);
        providersUsed.add("Overpass");
        airportOk = true;
      } catch (opErr: any) {
        sectionErrors.push(`Airport: LocationIQ ${liqErr.message}; Overpass ${opErr.message}`);
      }
    }
  } else {
    try {
      results.Airport = await fetchAirportViaOverpass(lat, lon, WIDE_RADIUS_MILES);
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
      results.Downtown = await fetchDowntownViaLocationIQ(lat, lon, WIDE_RADIUS_MILES);
      providersUsed.add("LocationIQ");
      downtownOk = true;
    } catch (liqErr: any) {
      try {
        results.Downtown = await fetchDowntownViaOverpass(lat, lon, OVERPASS_DOWNTOWN_FALLBACK_MILES);
        providersUsed.add("Overpass");
        downtownOk = true;
      } catch (opErr: any) {
        sectionErrors.push(`Downtown: LocationIQ ${liqErr.message}; Overpass ${opErr.message}`);
      }
    }
  } else {
    try {
      results.Downtown = await fetchDowntownViaOverpass(lat, lon, OVERPASS_DOWNTOWN_FALLBACK_MILES);
      providersUsed.add("Overpass");
      downtownOk = true;
    } catch (opErr: any) {
      sectionErrors.push(`Downtown: Overpass ${opErr.message}`);
    }
  }

  return {
    results,
    providersUsed: [...providersUsed],
    sectionErrors,
    allFailed: !standardOk && !airportOk && !downtownOk,
  };
}
