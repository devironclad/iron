import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const { data: { user: caller }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user_id, full_name, email } = await request.json();

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    // Update in Supabase Auth
    const authUpdates: { email?: string; user_metadata?: Record<string, string> } = {};
    if (email) authUpdates.email = email;
    if (full_name) authUpdates.user_metadata = { full_name };

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      authUpdates
    );

    if (authUpdateError) throw authUpdateError;

    // Update in ls_users_metadata
    const metaUpdates: { full_name?: string; email?: string } = {};
    if (full_name) metaUpdates.full_name = full_name;
    if (email) metaUpdates.email = email;

    const { error: metaError } = await supabaseAdmin
      .from("ls_users_metadata")
      .update(metaUpdates)
      .eq("id", user_id);

    if (metaError) throw metaError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
