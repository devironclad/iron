/**
 * COSL "List View" -> Auctions import. Invoked once a day by Supabase pg_cron
 * (net.http_post) with the shared secret. See:
 *   scripts/rls/rls_patch_18_cosl_listings_import.sql
 *   scripts/cosl/pg_cron_listings_setup.sql
 *   scripts/import-cosl-listings.js   (manual run)
 *
 * Query params (require a valid secret):
 *   ?dry=1  fetch + resolve + count, but DO NOT write anything
 */

import { NextRequest, NextResponse } from "next/server";
import { runCoslListingsImport } from "@/lib/cosl/import-listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return provided.length > 0 && provided === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const result = await runCoslListingsImport(dry);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
