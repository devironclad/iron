import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildTiers, resolveEffectivePartnerId, assertPartnerCanView } from "@/lib/ironclad-opportunities";

const PAGE_SIZE = 24;

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const effectivePartnerId = await resolveEffectivePartnerId(request, user.id);
    if (!effectivePartnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const forbiddenReason = await assertPartnerCanView(effectivePartnerId);
    if (forbiddenReason) return NextResponse.json({ error: forbiddenReason }, { status: 403 });

    const { searchParams } = request.nextUrl;
    const state = searchParams.get("state");
    const county = searchParams.get("county");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabaseAdmin
      .from("ls_assets")
      .select(
        `id, ref_id, address, parcel_number, case_number, size, photo_url, acquisition_date, sale_price, investment_total_inv,
         ls_county(id, name, state), ls_origem(name), ls_property_type(name), ls_auction_type(name)`,
        { count: "exact" }
      )
      .eq("record_type", "PROPERTY")
      .or("owner_type.is.null,owner_type.neq.partner")
      .or("sale_type.is.null,sale_type.neq.sold_out");

    // Mirrors the state->county_id resolution already used in
    // src/app/properties/page.tsx (state isn't a column on ls_assets itself).
    if (state) {
      const { data: countyRows } = await supabaseAdmin.from("ls_county").select("id").eq("state", state);
      const countyIds = (countyRows || []).map((c: any) => c.id);
      if (countyIds.length === 0) {
        return NextResponse.json({ properties: [], totalCount: 0 });
      }
      query = query.in("county_id", countyIds);
    }
    if (county) query = query.eq("county_id", county);

    const { data, error, count } = await query.order("ref_id", { ascending: false }).range(from, to);
    if (error) throw error;

    const rows = data || [];
    const ids = rows.map((r: any) => r.id);

    let alreadyInterestedSet = new Set<number>();
    if (ids.length > 0) {
      const { data: interestRows } = await supabaseAdmin
        .from("ls_asset_partner_interest")
        .select("asset_id")
        .eq("partner_id", effectivePartnerId)
        .is("resolved_at", null)
        .in("asset_id", ids);
      alreadyInterestedSet = new Set((interestRows || []).map((r: any) => r.asset_id));
    }

    const properties = rows.map((r: any) => {
      const base = r.investment_total_inv || 0;
      const isAR = r.ls_county?.state === "AR";
      return {
        id: r.id,
        refId: r.ref_id,
        address: r.address,
        parcelNumber: r.parcel_number,
        caseNumber: r.case_number,
        size: r.size,
        photoUrl: r.photo_url,
        acquisitionDate: r.acquisition_date,
        salePrice: r.sale_price,
        // Same investment_total_inv the Partner-menu card's "Investment" KPI
        // uses — real, persisted, unrounded.
        investmentTotalInv: r.investment_total_inv ?? null,
        county: r.ls_county?.name || null,
        countyId: r.ls_county?.id || null,
        state: r.ls_county?.state || null,
        origin: r.ls_origem?.name || null,
        propertyType: r.ls_property_type?.name || null,
        auctionType: r.ls_auction_type?.name || null,
        tiers: buildTiers(base, isAR),
        alreadyInterested: alreadyInterestedSet.has(r.id),
      };
    });

    return NextResponse.json({ properties, totalCount: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
