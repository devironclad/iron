"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Gavel, 
  Building2, 
  Users, 
  Settings,
  LayoutDashboard,
  Database,
  LogOut,
  UserCircle
} from "lucide-react";
import { hasPermission, getCurrentUserPermissions } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import "./layout.css";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, resource: "page:dashboard" },
  { name: "Auctions", href: "/auctions", icon: Gavel, resource: "page:auctions" },
  { name: "Properties", href: "/properties", icon: Building2, resource: "page:properties" },
  { name: "Manager", href: "/manager", icon: Database, resource: "page:manager" },
  { name: "Access", href: "/access", icon: Users, resource: "page:access" },
  { name: "Settings", href: "/settings", icon: Settings, resource: "page:settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [permissions, setPermissions] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function initUser() {
      // 1. Get current session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUser(null);
        return;
      }
      setUser(user);

      // 2. Sync user metadata (to ensure they appear in the Access screen)
      const { error: syncError } = await supabase.from("ls_users_metadata").upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
        avatar_url: user.user_metadata?.avatar_url
      });

      if (syncError) {
        console.error("Error syncing user metadata:", syncError);
      }

      // 3. Load permissions
      const perms = await getCurrentUserPermissions();
      setPermissions(perms);
    }
    initUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // Fallback logic: if permissions are loaded but empty, we show all (to prevent lockouts during setup)
  const visibleItems = permissions && Object.keys(permissions).length > 0
    ? NAV_ITEMS.filter(item => hasPermission(permissions, item.resource, 'view'))
    : NAV_ITEMS; 

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link href="/" className="logo-link">
          <img src="/logo.png" alt="Ironcladgroup" className="logo-img" />
        </Link>
      </div>
      <nav className="sidebar-nav">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`nav-item ${isActive ? "active" : ""}`}
            >
              <Icon className="nav-icon" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {user ? (
          <div className="footer-flex" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
            <div className="user-profile compact" style={{ flex: 1, overflow: 'hidden' }}>
              <div className="avatar" style={{ minWidth: '32px' }}>{user.email?.substring(0, 2).toUpperCase()}</div>
              <div className="user-info" style={{ overflow: 'hidden' }}>
                <span className="user-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email?.split('@')[0]}</span>
                <span className="user-role" style={{ fontSize: '10px', opacity: 0.7, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="logout-btn-minimal" title="Logout" style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '5px' }}>
              <LogOut className="w-5 h-5 hover:text-white transition-colors" />
            </button>
          </div>
        ) : (
          <Link href="/login" style={{ color: 'white', opacity: 0.7, fontSize: '0.8rem', textDecoration: 'none' }}>Sign In</Link>
        )}
      </div>
    </aside>
  );
}
