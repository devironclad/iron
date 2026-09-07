"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Sends a heartbeat to /api/activity/ping while the tab is VISIBLE and the
 * user has produced input in the last IDLE_MS. The server merges these pings
 * into continuous "work blocks" (see rls_patch_19). Renders nothing.
 *
 * Params (keep in sync with the SQL): ping 60s · idle 5 min · merge gap 10 min.
 */
const PING_INTERVAL_MS = 60_000;
const IDLE_MS = 5 * 60_000;
const INPUT_THROTTLE_MS = 10_000;
const INPUT_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];

export function ActivityHeartbeat() {
  const lastInputRef = useRef<number>(0);

  useEffect(() => {
    lastInputRef.current = Date.now();
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

    async function ping(viaBeacon = false) {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInputRef.current > IDLE_MS) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      if (viaBeacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          "/api/activity/ping",
          new Blob([JSON.stringify({ token: session.access_token })], { type: "application/json" }),
        );
        return;
      }

      try {
        await fetch("/api/activity/ping", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          keepalive: true,
        });
      } catch {
        /* heartbeat must never break the app */
      }
    }

    void ping();
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
