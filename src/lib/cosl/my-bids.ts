/**
 * Collector for COSL "My Auctions -> My Bids".
 *
 * Flow (authenticated):
 *   GET /auctions/my-auctions           -> the bidder id is embedded in the
 *                                          Kendo grid config: my-bids_grid_read/{id}
 *   GET /auctions/my-bids_grid_read/{id} -> JSON { Data: [...], Total }
 *
 * The endpoint returns every row in a single response today, but we page
 * defensively in case the shared bidding account grows past the grid's
 * server-side page size.
 */

import { CoslSession, coslLogin } from "./client";

export interface CoslMyBidRaw {
  CoSLPropertyId: number;
  AuctionListingId: number;
  ListingStart: string | null;
  ListingEnd: string | null;
  MaxBid: number | null;
  DisplayMaxBid: string | null;
  CoSLParcelNumber: string | null;
  CoSLCountyName: string | null;
  Acreage: number | null;
  Owner: string | null;
  Status: string | null;
  WinningBidAmount: number | null;
  MyBidCount: number | null;
  TotalBids: number | null;
  StartInCST: string | null;
  EndInCST: string | null;
  DisplayStatus: number | null;
}

/** Row shape expected by the sync_cosl_my_bids() RPC (snake_case = column names). */
export interface CoslMyBidRow {
  auction_listing_id: number;
  cosl_property_id: number | null;
  owner: string | null;
  county: string | null;
  parcel_number: string | null;
  acreage: number | null;
  listing_start: string | null;
  listing_end: string | null;
  start_cst: string | null;
  end_cst: string | null;
  max_bid: number | null;
  display_max_bid: string | null;
  winning_bid_amount: number | null;
  my_bid_count: number | null;
  total_bids: number | null;
  status: string | null;
  display_status: number | null;
  standing_label: string | null;
}

const PAGE_SIZE = 200;
const MAX_PAGES = 50;

export class CoslCollectError extends Error {}

function extractBidderId(html: string): number {
  const m = html.match(/my-bids_grid_read\/(\d+)/);
  if (!m) throw new CoslCollectError("bidder id not found on /auctions/my-auctions");
  return Number(m[1]);
}

/**
 * DisplayStatus -> label. Only 2 = "Winning" is confirmed from the live grid.
 * "My Bids" only lists auctions that are still open and that we have bid on,
 * so a non-winning row means we have been outbid.
 * TODO: confirm the full enum against an outbid position and refine.
 */
function standingLabel(displayStatus: number | null): string | null {
  if (displayStatus == null) return null;
  return displayStatus === 2 ? "Winning" : "Outbid";
}

function normalize(r: CoslMyBidRaw): CoslMyBidRow {
  return {
    auction_listing_id: r.AuctionListingId,
    cosl_property_id: r.CoSLPropertyId ?? null,
    owner: r.Owner?.trim() ?? null,
    county: r.CoSLCountyName?.trim() ?? null,
    parcel_number: r.CoSLParcelNumber?.trim() ?? null,
    acreage: r.Acreage ?? null,
    listing_start: r.ListingStart ?? null,
    listing_end: r.ListingEnd ?? null,
    start_cst: r.StartInCST ?? null,
    end_cst: r.EndInCST ?? null,
    max_bid: r.MaxBid ?? null,
    display_max_bid: r.DisplayMaxBid ?? null,
    winning_bid_amount: r.WinningBidAmount ?? null,
    my_bid_count: r.MyBidCount ?? null,
    total_bids: r.TotalBids ?? null,
    status: r.Status?.trim() ?? null,
    display_status: r.DisplayStatus ?? null,
    standing_label: standingLabel(r.DisplayStatus ?? null),
  };
}

async function fetchBidderId(session: CoslSession): Promise<number> {
  const res = await session.fetch("/auctions/my-auctions", { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new CoslCollectError("session not authenticated (redirected from /auctions/my-auctions)");
  }
  if (!res.ok) throw new CoslCollectError(`/auctions/my-auctions returned HTTP ${res.status}`);
  return extractBidderId(await res.text());
}

async function fetchAllRaw(session: CoslSession, bidderId: number): Promise<CoslMyBidRaw[]> {
  const rows: CoslMyBidRaw[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      skip: String((page - 1) * PAGE_SIZE),
      take: String(PAGE_SIZE),
    });
    const res = await session.fetch(`/auctions/my-bids_grid_read/${bidderId}?${qs}`, {
      headers: { "x-requested-with": "XMLHttpRequest", accept: "application/json" },
      redirect: "manual",
    });
    if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
      throw new CoslCollectError("session expired while reading my-bids");
    }
    if (!res.ok) throw new CoslCollectError(`my-bids_grid_read returned HTTP ${res.status}`);

    const json = (await res.json()) as { Data?: CoslMyBidRaw[]; Total?: number };
    const batch = json.Data ?? [];
    rows.push(...batch);

    const total = json.Total ?? rows.length;
    if (batch.length === 0 || rows.length >= total) break;
  }
  return rows;
}

export interface CollectMyBidsResult {
  rows: CoslMyBidRow[];
  bidderId: number;
}

/** Full run: login, read the grid, return normalized rows ready for the RPC. */
export async function collectMyBids(
  email: string,
  password: string,
): Promise<CollectMyBidsResult> {
  const session = await coslLogin(email, password);
  const bidderId = await fetchBidderId(session);
  const raw = await fetchAllRaw(session, bidderId);
  return { rows: raw.map(normalize), bidderId };
}
