"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lock, Mail, Loader2, ArrowRight, ShieldCheck, BarChart3, Building2, Users } from "lucide-react";
import "./login.css";

const FEATURES = [
  { icon: Building2, label: "Property & Auction Management" },
  { icon: BarChart3,  label: "Financial Analytics & ROI Tracking" },
  { icon: Users,      label: "Role-based Access Control" },
  { icon: ShieldCheck, label: "Secure & Audit-ready Platform" },
];

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="login-root">

      {/* ── LEFT PANEL ── */}
      <div className="login-left">
        <div className="login-left-inner">

          {/* Logo + brand */}
          <div className="login-brand">
            <img src="/logo.png" alt="Ironcladgroup" className="login-logo" />
            <div className="login-brand-text">
              <h1 className="login-brand-name">Ironclad <span>System</span></h1>
              <p className="login-brand-tagline">
                The all-in-one platform for managing real estate acquisitions,
                auctions, and portfolio analytics.
              </p>
            </div>
          </div>

          {/* Feature list */}
          <ul className="login-features">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="login-feature-item">
                <span className="login-feature-icon">
                  <Icon className="w-4 h-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>

          {/* Bottom decoration */}
          <div className="login-left-footer">
            <span>© {new Date().getFullYear()} Ironcladgroup. All rights reserved.</span>
          </div>
        </div>

        {/* Decorative blobs */}
        <div className="login-blob login-blob-1" />
        <div className="login-blob login-blob-2" />
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="login-right">
        <div className="login-form-box">

          <div className="login-form-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue.</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="lf-group">
              <label>Email Address</label>
              <div className="lf-input-wrap">
                <Mail className="lf-icon w-4 h-4" />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="lf-group">
              <label>Password</label>
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

            {message && (
              <div className={`lf-message ${message.type}`}>
                {message.text}
              </div>
            )}

            <button type="submit" className="lf-submit" disabled={loading}>
              {loading
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <> Sign In <ArrowRight className="w-4 h-4" /> </>
              }
            </button>
          </form>

          <p className="lf-footer">
            Don&apos;t have an account?&nbsp;
            <span>Contact your administrator.</span>
          </p>
        </div>
      </div>

    </div>
  );
}
