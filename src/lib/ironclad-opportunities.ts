import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const IRONCLAD_OPPORTUNITIES_RESOURCE_KEY = "page:properties:ironclad-opportunities";

// Same tier percentages and formula as the partner-view "Profit Projection"
// chart in src/app/properties/page.tsx and src/app/properties/[id]/page.tsx
// (isPartnerView branch) — reused here so a partner sees the exact same
// projection for an Ironclad-owned property as for their own. `base` must be
// investment_total_inv, the same real, already-persisted, investor-facing
// figure the Partner menu uses — never rounded or simulated.
export function buildTiers(base: number, isAR: boolean) {
  if (!(base > 0)) return [];
  const tierDefs = isAR
    ? [
        { label: "+100%", roi: 1.0 },
        { label: "+200%", roi: 2.0 },
        { label: "+300%", roi: 3.0 },
        { label: "+400%", roi: 4.0 },
      ]
    : [
        { label: "+40%", roi: 0.4 },
        { label: "+60%", roi: 0.6 },
        { label: "+80%", roi: 0.8 },
        { label: "+100%", roi: 1.0 },
      ];
  return tierDefs.map((t) => ({
    label: t.label,
    projectedAmount: base + base * t.roi,
  }));
}

/**
 * Resolves which partner's data an ironclad-opportunities request should
 * return.
 * - Real callers who are partners see their own data.
 * - Real callers who are employees may pass `previewPartnerId` to mirror the
 *   existing "Preview as Partner" feature (src/lib/impersonation.ts), which
 *   already works this way in properties/page.tsx and permissions.ts.
 * Returns null if the request isn't authorized for either case.
 */
export async function resolveEffectivePartnerId(request: NextRequest, realUserId: string): Promise<string | null> {
  const { data: realMeta } = await supabaseAdmin
    .from("ls_users_metadata")
    .select("user_type")
    .eq("id", realUserId)
    .single();

  const previewPartnerId = request.nextUrl.searchParams.get("previewPartnerId");
  if (previewPartnerId) {
    return realMeta?.user_type === "employee" ? previewPartnerId : null;
  }
  return realMeta?.user_type === "partner" ? realUserId : null;
}

/**
 * Confirms the effective partner id really is a partner and has view
 * permission on the Ironclad Opportunities resource. Returns null if OK,
 * or an error message if the request should be rejected.
 */
export async function assertPartnerCanView(effectivePartnerId: string): Promise<string | null> {
  const { data: partnerMeta } = await supabaseAdmin
    .from("ls_users_metadata")
    .select("user_type")
    .eq("id", effectivePartnerId)
    .single();
  if (partnerMeta?.user_type !== "partner") return "Forbidden";

  const { userHasPermission } = await import("@/lib/server-permissions");
  if (!(await userHasPermission(effectivePartnerId, IRONCLAD_OPPORTUNITIES_RESOURCE_KEY, "view"))) {
    return "Forbidden";
  }
  return null;
}
