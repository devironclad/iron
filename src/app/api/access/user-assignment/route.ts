import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { action, user_id, user_type, profile_id } = await request.json();
    if (!user_id || !action) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    if (action === "user_type") {
      const { error } = await supabaseAdmin
        .from("ls_users_metadata")
        .update({ user_type })
        .eq("id", user_id);
      if (error) throw error;
    } else if (action === "user_profile") {
      const { error } = await supabaseAdmin
        .from("ls_user_profiles")
        .upsert({ user_id, profile_id: profile_id || null }, { onConflict: "user_id" });
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
