"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lock, CheckCircle2, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import "../../login/login.css"; // Reuse login styles

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const router = useRouter();

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: "Passwords do not match." });
      return;
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: "Password must be at least 6 characters." });
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
    } else {
      setMessage({ type: 'success', text: "Password set successfully! Redirecting..." });
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-icon">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1>Set your <span>password</span></h1>
          <p>Welcome to Ironcladgroup! Please create a secure password to activate your account.</p>
        </div>

        <form onSubmit={handleSetPassword} className="login-form">
          <div className="form-group">
            <label>New Password</label>
            <div className="input-with-icon">
              <Lock className="w-5 h-5 icon" />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <div className="input-with-icon">
              <Lock className="w-5 h-5 icon" />
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
            <div className={`login-message ${message.type}`}>
              {message.text}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                Save & Continue
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
      
      <div className="login-bg-decoration">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>
    </div>
  );
}
