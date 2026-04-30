"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lock, Mail, Loader2, ShieldCheck, ArrowRight, Wand2 } from "lucide-react";
import "./login.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'magic'>('password');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (loginMethod === 'password') {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
        setLoading(false);
      } else {
        router.push("/");
        router.refresh();
      }
    } else {
      // Magic Link Login
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        }
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: "Magic link sent! Check your inbox." });
      }
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-icon">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1>Ironclad<span>group</span></h1>
          <p>Choose your preferred method to access the panel.</p>
        </div>

        <div className="login-method-tabs">
          <button 
            className={`method-tab ${loginMethod === 'password' ? 'active' : ''}`}
            onClick={() => setLoginMethod('password')}
          >
            <Lock className="w-4 h-4" /> Password
          </button>
          <button 
            className={`method-tab ${loginMethod === 'magic' ? 'active' : ''}`}
            onClick={() => setLoginMethod('magic')}
          >
            <Wand2 className="w-4 h-4" /> Magic Link
          </button>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>Email Address</label>
            <div className="input-with-icon">
              <Mail className="w-5 h-5 icon" />
              <input 
                type="email" 
                placeholder="name@company.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {loginMethod === 'password' && (
            <div className="form-group animate-slide-down">
              <label>Password</label>
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
          )}

          {message && (
            <div className={`login-message ${message.type}`}>
              {message.text}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                {loginMethod === 'password' ? 'Sign In' : 'Send Magic Link'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>Don't have an account? Contact your administrator.</p>
        </div>
      </div>
      
      <div className="login-bg-decoration">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>
    </div>
  );
}
