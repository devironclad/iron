/**
 * COSL "My Bids" collector — invoked hourly by Supabase pg_cron
 * (net.http_post) with the shared secret. See:
 *   scripts/rls/rls_patch_17_cosl_my_bids.sql   (tables + sync_cosl_my_bids RPC)
 *   scripts/cosl/pg_cron_setup.sql              (schedule — run after deploy)
 *
 * Manual refresh from the page uses a separate authenticated route:
 *   src/app/api/bids/refresh/route.ts
 *
 * Query params (both require a valid secret):
 *   ?force=1  bypass the business-hours gate  (non-production only)
 *   ?dry=1    login + collect, return rows, DO NOT write to the database
 */

import { NextRequest, NextResponse } from "next/server";
import { collectMyBids } from "@/lib/cosl/my-bids";
import { runCoslMyBidsSync, recordCoslSyncMeta } from "@/lib/cosl/sync";
import { isWithinArkansasBusinessHours } from "@/lib/cosl/schedule";

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

  const started = Date.now();
  const { searchParams } = new URL(req.url);
  const dry = searchParams.get("dry") === "1";
  const force =
    searchParams.get("force") === "1" && process.env.NODE_ENV !== "production";

  if (!force && !isWithinArkansasBusinessHours()) {
    if (!dry) {
      await recordCoslSyncMeta(
        "skipped",
        "outside Arkansas business hours (08:00-17:00 CT)",
        Date.now() - started,
      );
    }
    return NextResponse.json({ skipped: true, reason: "outside Arkansas business hours" });
  }

  if (dry) {
    try {
      const { rows, bidderId } = await collectMyBids(
        process.env.COSL_EMAIL ?? "",
        process.env.COSL_PASSWORD ?? "",
      );
      return NextResponse.json({
        dry: true,
        bidderId,
        rowCount: rows.length,
        durationMs: Date.now() - started,
        rows,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "unknown collector error";
      return NextResponse.json({ ok: false, dry: true, error: message }, { status: 502 });
    }
  }

  const outcome = await runCoslMyBidsSync();
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
