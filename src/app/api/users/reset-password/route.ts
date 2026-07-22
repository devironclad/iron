import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";
import { userHasPermission } from "@/lib/server-permissions";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const { data: { user: caller }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userHasPermission(caller.id, "page:access", "edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
