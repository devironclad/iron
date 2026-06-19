"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lock, Loader2, ArrowRight, ShieldCheck, KeyRound, CheckCircle2 } from "lucide-react";
import "../../login/login.css";

const TIPS = [
  { icon: KeyRound,     label: "Use at least 8 characters" },
  { icon: ShieldCheck,  label: "Mix letters, numbers & symbols" },
  { icon: CheckCircle2, label: "Avoid reusing old passwords" },
];

export default function SetPasswordPage() {
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading]                 = useState(false);
  const [sessionReady, setSessionReady]       = useState(false);
  const [message, setMessage]                 = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function initSession() {
      // Extract tokens from URL hash (#access_token=...&refresh_token=...&type=recovery)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const access_token  = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (data.session && !error) {
          setSessionReady(true);
          // Clean up hash from URL without triggering navigation
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }

      // Fallback: session may already exist (e.g. user refreshed the page)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setSessionReady(true);
    }

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }

    if (!sessionReady) {
      setMessage({ type: "error", text: "Session not ready. Please wait a moment and try again." });
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
    } else {
      setMessage({ type: "success", text: "Password set successfully! Redirecting..." });
      setTimeout(() => router.push("/"), 2000);
    }
  }

  return (
    <div className="login-root">

      {/* ── LEFT PANEL ── */}
      <div className="login-left">
        <div className="login-left-inner">

          <div className="login-brand">
            <img src="/logo.png" alt="Ironcladgroup" className="login-logo" />
            <div className="login-brand-text">
              <h1 className="login-brand-name">Account <span>Setup</span></h1>
              <p className="login-brand-tagline">
                Welcome to the Ironclad System. Create a secure password
                to activate your account and get started.
              </p>
            </div>
          </div>

          <ul className="login-features">
            {TIPS.map(({ icon: Icon, label }) => (
              <li key={label} className="login-feature-item">
                <span className="login-feature-icon">
                  <Icon className="w-4 h-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>

          <div className="login-left-footer">
            <span>© {new Date().getFullYear()} Ironcladgroup. All rights reserved.</span>
          </div>
        </div>

        <div className="login-blob login-blob-1" />
        <div className="login-blob login-blob-2" />
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="login-right">
        <div className="login-form-box">

          <div className="login-form-header">
            <h2>Create your password</h2>
            <p>Choose a strong password to protect your account.</p>
          </div>

          <form onSubmit={handleSetPassword} className="login-form">
            <div className="lf-group">
              <label>New Password</label>
              <div className="lf-input-wrap">
                <Lock className="lf-icon w-4 h-4" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="lf-group">
              <label>Confirm Password</label>
              <div className="lf-input-wrap">
                <Lock className="lf-icon w-4 h-4" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {message && (
              <div className={`lf-message ${message.type}`}>
                {message.text}
              </div>
            )}

            <button type="submit" className="lf-submit" disabled={loading || !sessionReady}>
              {loading || !sessionReady
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <> Save & Continue <ArrowRight className="w-4 h-4" /> </>
              }
            </button>
          </form>

        </div>
      </div>

    </div>
  );
}
