import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { roundToNearest, resolveEffectivePartnerId, assertPartnerCanView } from "@/lib/ironclad-opportunities";

// Fields safe to show a partner browsing an Ironclad-owned property they
// don't own. Deliberately excludes real cost/bid figures (paid_bid,
// investment_total, doc_fees, open_bid, min_bid/max_bid, county_appraisal,
// dev-cost line items, tax records) — those stay server-side only. This is
// an allowlist (not a blocklist of the full row) so a field we haven't
// audited can never leak by omission.
const RESEARCH_FIELDS = [
  "id", "ref_id", "record_type", "owner_type", "origem_id", "acquisition_date",
  "county_id", "address", "coordinates", "zoning", "size", "parcel_number",
  "case_number", "legal_description", "gismap_id", "wetlands_id", "fema_id",
  "debit_id", "property_type_id", "prop_access_id", "road_access_id",
  "inperson_visit", "corner_lot", "link_regrid", "observation", "photo_url",
  "auction_type_id", "priority_id",
] as const;

const VALUES_FIELDS = [
  "appraisal_min", "appraisal_avg", "appraisal_max", "house_price",
  "market_value", "sqft_price_reference", "link_sources", "link_house_sources",
] as const;

const SALES_FIELDS = ["sale_price"] as const;

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
        `${RESEARCH_FIELDS.join(", ")}, ${VALUES_FIELDS.join(", ")}, ${SALES_FIELDS.join(", ")}, investment_total,
         ls_county(name, state), ls_property_type(name), ls_priority(name, color)`
      )
      .eq("id", assetId)
      .single();

    if (assetError || !asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((asset as any).record_type !== "PROPERTY" || (asset as any).owner_type === "partner") {
      return NextResponse.json({ error: "Property not eligible" }, { status: 400 });
    }

    const rawInvestmentTotal = (asset as any).investment_total;
    const simulatedInvestmentInv = rawInvestmentTotal > 0 ? roundToNearest(rawInvestmentTotal) : null;

    const sanitizedProperty: Record<string, any> = { ls_county: (asset as any).ls_county, ls_property_type: (asset as any).ls_property_type, ls_priority: (asset as any).ls_priority };
    for (const f of RESEARCH_FIELDS) sanitizedProperty[f] = (asset as any)[f];
    for (const f of VALUES_FIELDS) sanitizedProperty[f] = (asset as any)[f];
    for (const f of SALES_FIELDS) sanitizedProperty[f] = (asset as any)[f];
    sanitizedProperty.investment_total_inv = simulatedInvestmentInv;
    // No real deal has been structured for this property yet — these stay
    // blank rather than derived from the real investment_total.
    sanitizedProperty.paid_bid_inv = null;
    sanitizedProperty.doc_fees_inv = null;
    sanitizedProperty.closing_fess_inv = null;
    sanitizedProperty.financed_owner = null;
    sanitizedProperty.monthly_installment = null;

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
