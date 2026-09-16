import { supabaseAdmin } from "./supabase-admin";

/**
 * Records one productivity-log row for an action taken through a server
 * route that writes with service_role (Manager, Access, Users, Bids
 * refresh). Those routes bypass RLS, so the generic DB trigger (which
 * reads auth.uid()) never fires for them — this is the explicit
 * equivalent, called from the one place that already knows who the
 * caller is (every such route authenticates before writing).
 *
 * `operation` is free text for these routes (not limited to the SQL
 * INSERT/UPDATE/DELETE used by the trigger) — e.g. "INVITE",
 * "RESET_PASSWORD", "REFRESH" — since it's more informative for a
 * productivity report than forcing everything into 3 buckets.
 *
 * Never throws — logging must not break the action it's recording.
 */
export async function logSystemAction(
  userId: string,
  tableName: string,
  operation: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("activity_log")
      .insert({ table_name: tableName, operation, changed_by: userId });
    if (error) console.error(`activity log (${tableName}/${operation}):`, error.message);
  } catch (err) {
    console.error(`activity log (${tableName}/${operation}) threw:`, err);
  }
}
