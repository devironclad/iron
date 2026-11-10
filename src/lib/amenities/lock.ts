/**
 * Per-property "lookup in progress" lock for the Properties Find Amenities
 * button. No schema change: reuses activity_log with a dedicated table_name
 * and operations LOCK:<id> / UNLOCK:<id>. A lock counts as running only if it
 * is newer than the last unlock AND younger than STALE_MS (route maxDuration
 * is 180s), so a crashed/timed-out run can never block a property forever.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";

const LOCK_TABLE = "amenities_lock";
const STALE_MS = 200_000;

async function lastAt(operation: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("activity_log")
    .select("changed_at")
    .eq("table_name", LOCK_TABLE)
    .eq("operation", operation)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? new Date(data.changed_at).getTime() : null;
}

export async function isAmenitiesLookupRunning(assetId: number): Promise<boolean> {
  const [lock, unlock] = await Promise.all([lastAt(`LOCK:${assetId}`), lastAt(`UNLOCK:${assetId}`)]);
  if (lock === null) return false;
  if (unlock !== null && unlock >= lock) return false;
  return Date.now() - lock < STALE_MS;
}

export async function acquireAmenitiesLock(userId: string, assetId: number): Promise<boolean> {
  if (await isAmenitiesLookupRunning(assetId)) return false;
  const { error } = await supabaseAdmin
    .from("activity_log")
    .insert({ table_name: LOCK_TABLE, operation: `LOCK:${assetId}`, changed_by: userId });
  return !error;
}

export async function releaseAmenitiesLock(userId: string, assetId: number): Promise<void> {
  try {
    await supabaseAdmin
      .from("activity_log")
      .insert({ table_name: LOCK_TABLE, operation: `UNLOCK:${assetId}`, changed_by: userId });
  } catch (err) {
    console.error("amenities unlock failed:", err);
  }
}
