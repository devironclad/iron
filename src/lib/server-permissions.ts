import { supabaseAdmin } from "./supabase-admin";

/**
 * Server-side permission check (API routes use the service role client, which
 * bypasses RLS, so authorization must be enforced explicitly here).
 */
export async function userHasPermission(
  userId: string,
  resourceKey: string,
  action: "view" | "edit" = "view"
): Promise<boolean> {
  const { data: profileLink } = await supabaseAdmin
    .from("ls_user_profiles")
    .select("profile_id")
    .eq("user_id", userId)
    .single();

  if (!profileLink) return false;

  const { data: perm } = await supabaseAdmin
    .from("ls_permissions")
    .select("can_view, can_edit")
    .eq("profile_id", profileLink.profile_id)
    .eq("resource_key", resourceKey)
    .single();

  if (!perm) return false;
  return action === "edit" ? !!perm.can_edit : !!perm.can_view;
}
