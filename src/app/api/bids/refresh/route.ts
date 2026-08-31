/**
 * Manual "refresh now" for the Bids page — triggered by clicking the freshness
 * badge. Unlike the cron route this is authenticated with the user's Supabase
 * session and ignores the business-hours window (a manual refresh is
 * deliberate). Requires can_edit on "page:bids".
 *
 * Throttled against the last successful sync to avoid hammering auction.cosl.org.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { userHasPermission } from "@/lib/server-permissions";
import { runCoslMyBidsSync } from "@/lib/cosl/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_INTERVAL_MS = 90_000;

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await userHasPermission(user.id, "page:bids", "edit"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Throttle: block if the last successful sync was very recent.
  const { data: meta } = await supabaseAdmin
    .from("cosl_sync_meta")
    .select("last_success_at, status")
    .eq("id", 1)
    .maybeSingle();

  const lastOk = meta?.last_success_at ? new Date(meta.last_success_at).getTime() : 0;
  const sinceMs = Date.now() - lastOk;
  if (meta?.status === "ok" && sinceMs < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { throttled: true, retryInSec: Math.ceil((MIN_INTERVAL_MS - sinceMs) / 1000) },
      { status: 429 },
    );
  }

  const outcome = await runCoslMyBidsSync();
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 502 });
}
