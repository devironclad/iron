/**
 * Shared "collect My Bids and write it to Supabase" routine, used by both the
 * hourly cron route and the authenticated manual-refresh route.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { collectMyBids } from "./my-bids";

export type SyncOutcome =
  | { ok: true; rowCount: number; bidderId: number; durationMs: number }
  | { ok: false; error: string; durationMs: number };

/** Records a non-data outcome ('skipped' / 'error') on cosl_sync_meta. */
export async function recordCoslSyncMeta(
  status: "skipped" | "error",
  message: string,
  durationMs: number,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("sync_cosl_my_bids", {
    p_replace: false,
    p_rows: [],
    p_status: status,
    p_message: message,
    p_duration_ms: durationMs,
  });
  if (error) console.error("cosl sync: failed to record meta:", error.message);
}

/**
 * Logs into COSL, collects the current My Bids rows and atomically replaces
 * cosl_my_bids. On failure the error is recorded on cosl_sync_meta and the
 * existing data is left untouched.
 */
export async function runCoslMyBidsSync(): Promise<SyncOutcome> {
  const started = Date.now();
  try {
    const { rows, bidderId } = await collectMyBids(
      process.env.COSL_EMAIL ?? "",
      process.env.COSL_PASSWORD ?? "",
    );
    const durationMs = Date.now() - started;

    const { error } = await supabaseAdmin.rpc("sync_cosl_my_bids", {
      p_replace: true,
      p_rows: rows,
      p_status: "ok",
      p_message: null,
      p_duration_ms: durationMs,
    });
    if (error) throw new Error(`rpc sync_cosl_my_bids: ${error.message}`);

    return { ok: true, rowCount: rows.length, bidderId, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const error = err instanceof Error ? err.message.slice(0, 500) : "unknown collector error";
    await recordCoslSyncMeta("error", error, durationMs);
    return { ok: false, error, durationMs };
  }
}
