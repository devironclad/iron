import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const { data: { user: caller }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user_id, email } = await request.json();

    if (!user_id || !email) {
      return NextResponse.json(
        { error: "user_id and email are required" },
        { status: 400 }
      );
    }

    // Confirm email so the user can receive password reset emails
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { email_confirm: true }
    );

    if (updateError) throw updateError;

    // Send password reset email as the "invite" (user sets password for the first time)
    const supabasePublic = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
    );

    const { error: resetError } = await supabasePublic.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/set-password` }
    );

    if (resetError) throw resetError;

    // Track when invite was sent
    const { error: trackError } = await supabaseAdmin
      .from("ls_users_metadata")
      .update({ invited_at: new Date().toISOString() })
      .eq("id", user_id);

    if (trackError) throw trackError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
