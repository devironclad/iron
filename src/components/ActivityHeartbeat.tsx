"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Sends a heartbeat to /api/activity/ping while the tab is VISIBLE and the
 * user has produced input in the last IDLE_MS, tagging each ping with the
 * current screen (pathname). The server merges these into continuous
 * "work blocks" per (user, path) — a block ends on a time gap OR a screen
 * change, whichever comes first (see rls_patch_19 / rls_patch_20). Renders
 * nothing.
 *
 * Params (keep in sync with the SQL): ping 60s · idle 5 min · merge gap 10 min.
 *
 * Effect order matters here: lastInputRef must be seeded with Date.now()
 * before the first ping() runs, so it's done in its own mount-only effect
 * declared before the pathname effect (React runs effects in declaration
 * order on mount).
 */
const PING_INTERVAL_MS = 60_000;
const IDLE_MS = 5 * 60_000;
const INPUT_THROTTLE_MS = 10_000;
const INPUT_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];

export function ActivityHeartbeat() {
  const lastInputRef = useRef<number>(0);
  const pathRef = useRef<string>("");
  const pathname = usePathname();

  async function ping(viaBeacon = false) {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastInputRef.current > IDLE_MS) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const path = pathRef.current.slice(0, 200);

    if (viaBeacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        "/api/activity/ping",
        new Blob([JSON.stringify({ token: session.access_token, path })], { type: "application/json" }),
      );
      return;
    }

    try {
      await fetch("/api/activity/ping", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path }),
        keepalive: true,
      });
    } catch {
      /* heartbeat must never break the app */
    }
  }

  // 1. Seed "last input" on mount — must run before the pathname effect below.
  useEffect(() => {
    lastInputRef.current = Date.now();
  }, []);

  // 2. Screen changed (including the initial mount) — record the new path and
  //    ping right away, so the new screen's block starts immediately instead
  //    of waiting for the next 60s tick.
  useEffect(() => {
    pathRef.current = pathname || "";
    void ping();
  }, [pathname]);

  // 3. Interval + input/visibility/unload listeners (mount-only).
  useEffect(() => {
    let inputThrottled = false;
    const onInput = () => {
      if (inputThrottled) return;
      inputThrottled = true;
      lastInputRef.current = Date.now();
      setTimeout(() => {
        inputThrottled = false;
      }, INPUT_THROTTLE_MS);
    };
    INPUT_EVENTS.forEach((e) => window.addEventListener(e, onInput, { passive: true }));

    const interval = setInterval(() => void ping(), PING_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPageHide = () => void ping(true);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(interval);
      INPUT_EVENTS.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
