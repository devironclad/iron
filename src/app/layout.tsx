"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Geist } from "next/font/google";
import { supabase } from "@/lib/supabase";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-primary",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const isSetPasswordPage = pathname === "/auth/set-password";
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function checkUser() {
      // 1. Detect if we are coming from an Auth Link (Invite/Recovery)
      const urlContent = window.location.hash + window.location.search;
      const hasAuthParams = urlContent && (
        urlContent.includes('access_token') || 
        urlContent.includes('type=recovery') || 
        urlContent.includes('type=invite') ||
        urlContent.includes('token=')
      );

      const { data: { session } } = await supabase.auth.getSession();
      
      // 2. If it's an auth link, force redirection to set-password
      if (!isSetPasswordPage && (hasAuthParams || (session && (urlContent.includes('type=recovery') || urlContent.includes('type=invite'))))) {
        router.push("/auth/set-password");
        setCheckingAuth(false);
        return;
      }

      // 3. Normal Auth Guard
      if (!session && !isLoginPage && !isSetPasswordPage) {
        router.push("/login");
      } else if (session && isLoginPage) {
        router.push("/");
      }
      
      setCheckingAuth(false);
      // Give a tiny delay for the router to settle before showing content
      setTimeout(() => setIsReady(true), 50);
    }
    checkUser();

    // Listen for auth events (like clicking a recovery/invite link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const isRecovery = event === 'PASSWORD_RECOVERY';
      const isAuthLink = event === 'SIGNED_IN' && (window.location.hash.includes('type=recovery') || window.location.hash.includes('type=invite'));
      
      if (isRecovery || isAuthLink) {
        router.push("/auth/set-password");
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, isLoginPage, isSetPasswordPage, router]);

  // Optionally show a loader while checking auth to prevent layout shift
  if (checkingAuth && !isLoginPage && !isSetPasswordPage) {
    return (
      <html lang="en" className={geistSans.variable}>
        <body style={{ background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div className="loader"></div>
        </body>
      </html>
    );
  }

  const showSidebar = !isLoginPage && !isSetPasswordPage;
  const isAuthPage = isLoginPage || isSetPasswordPage;

  return (
    <html lang="en" className={geistSans.variable}>
      <body className={isReady ? "auth-ready" : "auth-loading"}>
        <div className={`app-container ${isAuthPage ? "login-mode" : ""}`}>
          {isReady ? (
            <>
              {showSidebar && <Sidebar />}
              <main className={isAuthPage ? "login-content" : "main-content"}>
                <div className={isAuthPage ? "" : "page-content"}>
                  {children}
                </div>
              </main>
            </>
          ) : (
            // Show loader if not ready and not an auth page
            !isAuthPage ? (
              <div className="layout-loader">
                <div className="loader"></div>
              </div>
            ) : (
              // On auth pages, we can show children immediately without the main wrapper if not ready
              <main className="login-content">
                {children}
              </main>
            )
          )}
        </div>
      </body>
    </html>
  );
}
