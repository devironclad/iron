/**
 * Activity heartbeat sink. The client (ActivityHeartbeat) posts here ~once a
 * minute while the tab is visible and the user has interacted recently, and
 * immediately on every navigation. Fire-and-forget: never do anything that
 * could surface an error to the app.
 *
 * Auth: Bearer token in the Authorization header (normal ping) or in the JSON
 * body as `token` (pagehide sendBeacon, which cannot set headers).
 * Body also carries `path` — the current screen (pathname only, no query
 * string) — used to key the work-block merge alongside the user.
 *
 * See: scripts/rls/rls_patch_19_user_activity.sql
 *      scripts/rls/rls_patch_20_user_activity_path.sql
 *      scripts/queries/user_activity.sql
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let bodyToken: string | undefined;
    let path: string | null = null;
    try {
      const body = await req.json();
      bodyToken = typeof body?.token === "string" ? body.token : undefined;
      path = typeof body?.path === "string" ? body.path.slice(0, 200) || null : null;
    } catch {
      /* empty / non-JSON body — token comes from the header, path stays null */
    }

    const token =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? bodyToken;
    if (!token) return new NextResponse(null, { status: 401 });

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return new NextResponse(null, { status: 401 });

    const { error: rpcError } = await supabaseAdmin.rpc("record_activity_ping", {
      p_user_id: user.id,
      p_path: path,
    });
    if (rpcError) console.error("activity ping: rpc failed:", rpcError.message);

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
