/**
 * Collector for the COSL "List View" catalogue.
 *
 *   POST /auctions/grid_read  ->  JSON { Data: [...], Total }   (no login)
 *
 * Returns every listing in one response. We keep only those added on or after
 * COSL_LISTINGS_SINCE (the "Added On" cutoff rule).
 */

import { COSL_BASE_URL } from "./client";

/** Fixed cutoff on the "Added On" field — see the import spec. */
export const COSL_LISTINGS_SINCE = "2026-08-29T00:00:00";

interface CoslListingRaw {
  Owner: string | null;
  CoSLCountyName: string | null;
  CoSLParcelNumber: string | null;
  Acreage: number | null;
  StartingBid: number | null;
  Start: string | null;
  End: string | null;
  Added: string | null;
  CoSLPropertyId: number;
  ListingToken: string | null;
  GisId: number | null;
  SaleType: string | null;
}

export interface CoslListing {
  coslPropertyId: number;
  owner: string | null;
  county: string | null; // raw COSL county name (UPPERCASE)
  parcelNumber: string | null;
  acreage: number | null;
  startingBid: number | null;
  addedAt: string | null; // ISO, already US Central as returned by COSL
  auctionDate: string | null; // "Added On" + 30 days, YYYY-MM-DD
  listingUrl: string | null;
}

/** Business rule: auction_date on the imported asset = Added On + 30 days. */
export function auctionDateFromAdded(addedIso: string | null): string | null {
  if (!addedIso) return null;
  const d = new Date(`${addedIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

export class CoslListingsError extends Error {}

export async function fetchCoslListings(): Promise<{ catalogTotal: number; listings: CoslListing[] }> {
  const res = await fetch(`${COSL_BASE_URL}/auctions/grid_read`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json",
    },
    body: "",
  });
  if (!res.ok) throw new CoslListingsError(`grid_read returned HTTP ${res.status}`);

  const json = (await res.json()) as { Data?: CoslListingRaw[]; Total?: number };
  const rows = json.Data ?? [];
  const cutoff = new Date(COSL_LISTINGS_SINCE).getTime();

  const listings = rows
    .filter((r) => r.Added && new Date(r.Added).getTime() >= cutoff)
    .map((r) => ({
      coslPropertyId: r.CoSLPropertyId,
      owner: r.Owner ? r.Owner.replace(/\s+/g, " ").trim() : null,
      county: r.CoSLCountyName ? r.CoSLCountyName.trim() : null,
      parcelNumber: r.CoSLParcelNumber ? r.CoSLParcelNumber.trim() : null,
      acreage: r.Acreage ?? null,
      startingBid: r.StartingBid ?? null,
      addedAt: r.Added ?? null,
      auctionDate: auctionDateFromAdded(r.Added ?? null),
      listingUrl: r.ListingToken ? `${COSL_BASE_URL}/auction/listing/${r.ListingToken}` : null,
    }));

  return { catalogTotal: rows.length, listings };
}
