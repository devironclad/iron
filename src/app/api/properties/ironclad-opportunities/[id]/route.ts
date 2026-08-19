import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveEffectivePartnerId, assertPartnerCanView } from "@/lib/ironclad-opportunities";

// Fields to show a partner browsing an Ironclad-owned property they don't
// own — the exact same fields a real partner sees on their own property
// (src/app/properties/[id]/page.tsx, isPartnerView branch). Deliberately
// excludes only what isPartnerView also hides from a real partner: internal
// bid/appraisal figures (open_bid, min_bid/max_bid, county_appraisal),
// Ironclad-only acquisition cost fields (paid_bid, doc_fees, investment_total
// — the non-investor variants, only ever shown on the Development/Acquisition
// tab, which is hidden entirely for isPartnerView), tax_deed, the Ownership
// section, and the Sale Status section. This is an allowlist (not a blocklist
// of the full row) so a field we haven't audited can never leak by omission.
const RESEARCH_FIELDS = [
  "id", "ref_id", "record_type", "owner_type", "origem_id", "acquisition_date",
  "county_id", "address", "coordinates", "zoning", "size", "parcel_number",
  "case_number", "legal_description", "gismap_id", "wetlands_id", "fema_id",
  "debit_id", "property_type_id", "prop_access_id", "road_access_id",
  "inperson_visit", "corner_lot", "link_regrid", "link_earth", "observation",
  "photo_url", "auction_type_id", "priority_id",
] as const;

const VALUES_FIELDS = [
  "appraisal_min", "appraisal_avg", "appraisal_max", "house_price",
  "market_value", "sqft_price_reference", "link_sources", "link_house_sources",
] as const;

// Investor-facing sale/investment figures — same fields shown on the Sales
// tab and the "Total Investment Investor" banners for a real partner.
const SALES_FIELDS = [
  "sale_price", "paid_bid_inv", "doc_fees_inv", "closing_fess_inv",
  "investment_total_inv", "financed_owner", "monthly_installment",
] as const;

// Strategy tab cost estimates and their approval toggles.
const STRATEGY_FIELDS = [
  "warrantydeedtransfer_stg", "tg_warrantydeedtransfer_stg",
  "titleclaim_action_stg", "tg_titleclaim_action_stg",
  "surveyor_stg", "tg_surveyor_stg",
  "land_clearing_stg", "tg_land_clearing_stg",
  "fencing_gate_stg", "tg_fencing_gate_stg",
  "preapproval_review_stg", "tg_preapproval_review_stg",
] as const;

// Documentation tab links — excludes tax_deed, which isPartnerView also
// hides from a real partner.
const DOCUMENTATION_FIELDS = ["warranty_deed", "survey", "site_plan"] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const assetId = Number(id);
    if (!assetId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const effectivePartnerId = await resolveEffectivePartnerId(request, user.id);
    if (!effectivePartnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const forbiddenReason = await assertPartnerCanView(effectivePartnerId);
    if (forbiddenReason) return NextResponse.json({ error: forbiddenReason }, { status: 403 });

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("ls_assets")
      .select(
        `${RESEARCH_FIELDS.join(", ")}, ${VALUES_FIELDS.join(", ")}, ${SALES_FIELDS.join(", ")}, ${STRATEGY_FIELDS.join(", ")}, ${DOCUMENTATION_FIELDS.join(", ")},
         ls_county(name, state), ls_property_type(name), ls_priority(name, color)`
      )
      .eq("id", assetId)
      .single();

    if (assetError || !asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((asset as any).record_type !== "PROPERTY" || (asset as any).owner_type === "partner") {
      return NextResponse.json({ error: "Property not eligible" }, { status: 400 });
    }

    const sanitizedProperty: Record<string, any> = { ls_county: (asset as any).ls_county, ls_property_type: (asset as any).ls_property_type, ls_priority: (asset as any).ls_priority };
    for (const f of RESEARCH_FIELDS) sanitizedProperty[f] = (asset as any)[f];
    for (const f of VALUES_FIELDS) sanitizedProperty[f] = (asset as any)[f];
    for (const f of SALES_FIELDS) sanitizedProperty[f] = (asset as any)[f];
    for (const f of STRATEGY_FIELDS) sanitizedProperty[f] = (asset as any)[f];
    for (const f of DOCUMENTATION_FIELDS) sanitizedProperty[f] = (asset as any)[f];

    const { data: amenityRows } = await supabaseAdmin
      .from("ls_asset_amenities")
      .select(`*, ls_amenity_type(name, ls_amenity_category(name))`)
      .eq("asset_id", assetId);

    const { data: marketingRow } = await supabaseAdmin
      .from("ls_asset_marketing")
      .select("*")
      .eq("asset_id", assetId)
      .maybeSingle();

    return NextResponse.json({
      property: sanitizedProperty,
      amenities: amenityRows || [],
      marketing: marketingRow || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
