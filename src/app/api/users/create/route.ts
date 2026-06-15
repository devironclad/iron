import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const { data: { user: caller }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, full_name, user_type, profile_id } = await request.json();

    if (!email || !full_name) {
      return NextResponse.json(
        { error: "Email and full name are required" },
        { status: 400 }
      );
    }

    const { data: authData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        user_metadata: { full_name, user_type: user_type || "employee" },
        email_confirm: false,
      });

    if (createError) throw createError;

    const userId = authData.user.id;

    // Upsert metadata (trigger may have already inserted it)
    const { error: metaError } = await supabaseAdmin
      .from("ls_users_metadata")
      .upsert(
        { id: userId, email, full_name, user_type: user_type || "employee" },
        { onConflict: "id" }
      );

    if (metaError) throw metaError;

    if (profile_id) {
      const { error: profileError } = await supabaseAdmin
        .from("ls_user_profiles")
        .upsert({ user_id: userId, profile_id }, { onConflict: "user_id" });

      if (profileError) throw profileError;
    }

    return NextResponse.json({
      success: true,
      user: { id: userId, email, full_name, user_type: user_type || "employee" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
