import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_TABLES = new Set([
  "ls_origem", "ls_status", "ls_priority", "ls_county", "ls_auction_type",
  "ls_auction_model", "ls_property_type", "ls_fema", "ls_wetlands", "ls_debit",
  "ls_gismap", "ls_property_access", "ls_road_access", "ls_ref_construction",
  "ls_amenity_category", "ls_amenity_type", "ls_request_category",
]);

async function authenticate(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticate(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { table, payload } = await request.json();
    if (!ALLOWED_TABLES.has(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });

    const { error } = await supabaseAdmin.from(table).insert([payload]);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticate(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { table, id, payload } = await request.json();
    if (!ALLOWED_TABLES.has(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });

    const { error } = await supabaseAdmin.from(table).update(payload).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticate(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { table, id } = await request.json();
    if (!ALLOWED_TABLES.has(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });

    const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
