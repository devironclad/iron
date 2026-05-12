import { supabase } from "./supabase";

export type Permission = {
  can_view: boolean;
  can_edit: boolean;
};

/**
 * Fetches the permissions for the currently logged-in user.
 */
export async function getCurrentUserPermissions(): Promise<Record<string, Permission>> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return {};

  // 1. Get the profile for this user
  const { data: profileLink } = await supabase
    .from("ls_user_profiles")
    .select("profile_id")
    .eq("user_id", user.id)
    .single();

  if (!profileLink) return {};

  // 2. Get the permissions for this profile
  const { data: perms } = await supabase
    .from("ls_permissions")
    .select("resource_key, can_view, can_edit")
    .eq("profile_id", profileLink.profile_id);

  if (!perms) return {};

  // Convert to a flat map for easy lookup
  const permMap: Record<string, Permission> = {};
  perms.forEach(p => {
    permMap[p.resource_key] = {
      can_view: p.can_view,
      can_edit: p.can_edit
    };
  });

  return permMap;
}

/**
 * Helper to check a specific permission from the loaded map.
 */
export function hasPermission(
  perms: Record<string, Permission> | null | undefined, 
  resource: string, 
  action: 'view' | 'edit' = 'view'
): boolean {
  if (!perms) return false;
  const p = perms[resource];
  if (!p) return false;
  return action === 'edit' ? p.can_edit : p.can_view;
}
