import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertPartnerCanView } from "@/lib/ironclad-opportunities";
import { formatPropId } from "@/lib/utils";

const CATEGORY_NAME = "Purchase Interest";
const STATUS_NAME = "Open";
const PRIORITY_NAME = "High";
const DEFAULT_ASSIGNEE_NAME = "Tamara Nobres";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Deliberately NOT accepting a previewPartnerId override here (unlike the
    // GET routes) — registering interest must always be the real, logged-in
    // partner. Staff previewing a partner get a read-only view; the UI
    // disables this action during preview and this check enforces it
    // server-side too.
    const forbiddenReason = await assertPartnerCanView(user.id);
    if (forbiddenReason) return NextResponse.json({ error: forbiddenReason }, { status: 403 });

    const { asset_id, message } = await request.json();
    const assetId = Number(asset_id);
    if (!assetId) return NextResponse.json({ error: "Invalid asset_id" }, { status: 400 });

    const { data: asset } = await supabaseAdmin
      .from("ls_assets")
      .select("id, ref_id, address, record_type, owner_type")
      .eq("id", assetId)
      .single();

    if (!asset || asset.record_type !== "PROPERTY" || asset.owner_type === "partner") {
      return NextResponse.json({ error: "Property not eligible for purchase interest" }, { status: 400 });
    }

    // Only an ACTIVE (unresolved) interest blocks re-registration — once the
    // linked request is closed, the trigger in rls_patch_6 stamps
    // resolved_at and the partner is free to express interest again.
    const { data: existing } = await supabaseAdmin
      .from("ls_asset_partner_interest")
      .select("id, request_id")
      .eq("asset_id", assetId)
      .eq("partner_id", user.id)
      .is("resolved_at", null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ alreadyRegistered: true, requestId: existing.request_id });
    }

    const [{ data: category }, { data: status }, { data: priority }, { data: assignee }] = await Promise.all([
      supabaseAdmin.from("ls_request_category").select("id").eq("name", CATEGORY_NAME).single(),
      supabaseAdmin.from("ls_request_status").select("id").eq("name", STATUS_NAME).single(),
      supabaseAdmin.from("ls_request_priority").select("id").eq("name", PRIORITY_NAME).single(),
      supabaseAdmin.from("ls_users_metadata").select("id").eq("full_name", DEFAULT_ASSIGNEE_NAME).single(),
    ]);

    if (!category?.id || !status?.id || !priority?.id) {
      throw new Error("Request lookup tables not configured (category/status/priority)");
    }
    if (!assignee?.id) {
      throw new Error(`Default assignee "${DEFAULT_ASSIGNEE_NAME}" not found in ls_users_metadata`);
    }

    const propertyLabel = formatPropId(asset.ref_id, asset.id);
    const { data: newRequest, error: requestError } = await supabaseAdmin
      .from("ls_requests")
      .insert({
        title: `Purchase Interest - ${propertyLabel}`,
        description: message
          ? `A partner expressed interest in property ${propertyLabel} (${asset.address || "no address"}).\n\nPartner message: ${message}`
          : `A partner expressed interest in property ${propertyLabel} (${asset.address || "no address"}).`,
        requester_id: user.id,
        assignee_id: assignee.id,
        asset_id: assetId,
        category_id: category.id,
        status_id: status.id,
        priority_id: priority.id,
      })
      .select("id")
      .single();

    if (requestError) throw requestError;

    const { error: interestError } = await supabaseAdmin.from("ls_asset_partner_interest").insert({
      asset_id: assetId,
      partner_id: user.id,
      message: message || null,
      request_id: newRequest.id,
    });

    if (interestError) {
      // Benign race: another request from the same partner/asset landed first.
      if ((interestError as any).code === "23505") {
        return NextResponse.json({ alreadyRegistered: true });
      }
      throw interestError;
    }

    return NextResponse.json({ success: true, requestId: newRequest.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
