import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { action_type, asset_id, field_name, old_value, new_value, meta, user_name } =
      await request.json();

    await supabaseAdmin.from("ls_audit_logs").insert({
      action_type,
      asset_id,
      user_id:    user.id,
      field_name: field_name ?? null,
      old_value:  old_value  ?? null,
      new_value:  new_value  ?? null,
      meta:       { user_name, ...meta },
    });

    return NextResponse.json({ success: true });
  } catch {
    // Audit must never surface errors to caller
    return NextResponse.json({ success: false });
  }
}
