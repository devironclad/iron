import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";
import { userHasPermission } from "@/lib/server-permissions";
import { logSystemAction } from "@/lib/activity";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const { data: { user: caller }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userHasPermission(caller.id, "page:access:users", "edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { user_id, email: requestedEmail } = await request.json();

    // Resolve the address from Auth itself: resetPasswordForEmail silently succeeds for
    // unknown addresses, so a mismatch with ls_users_metadata would look like "sent" but never arrive.
    let email: string | undefined = requestedEmail;
    if (user_id) {
      const { data: authUser, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(user_id);
      if (lookupError || !authUser?.user?.email) {
        return NextResponse.json({ error: "User not found in Auth" }, { status: 404 });
      }
      email = authUser.user.email;
    }

    if (!email) {
      return NextResponse.json({ error: "user_id or email is required" }, { status: 400 });
    }

    const supabasePublic = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
    );

    const { error: resetError } = await supabasePublic.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/set-password` }
    );

    if (resetError) throw resetError;

    await logSystemAction(caller.id, "auth.users", "RESET_PASSWORD");
    return NextResponse.json({ success: true, email });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
