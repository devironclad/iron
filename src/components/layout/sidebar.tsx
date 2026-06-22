"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Gavel,
  Building2,
  Users,
  Settings,
  LayoutDashboard,
  Database,
  LogOut,
  UserCircle,
  ClipboardList,
  Sparkles,
  ChevronDown
} from "lucide-react";
import { CURRENT_VERSION, CHANGELOG } from "@/config/changelog";
import { hasPermission, getCurrentUserPermissions } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { NotificationBell } from "./NotificationBell";
import "./layout.css";

type NavChild = { name: string; href: string; resource: string };
type NavItem =
  | { name: string; href: string; icon: React.ComponentType<any>; resource: string; children?: never }
  | { name: string; icon: React.ComponentType<any>; resource?: never; href?: never; children: NavChild[] };

const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, resource: "page:dashboard" },
  {
    name: "Research",
    icon: Gavel,
    children: [
      { name: "Auctions", href: "/auctions", resource: "page:auctions" },
      { name: "Rejecteds", href: "/auctions?filter=rejected", resource: "page:auctions:rejected" },
    ],
  },
  {
    name: "Properties",
    icon: Building2,
    children: [
      { name: "Ironclad", href: "/properties?source=ironclad", resource: "page:properties:ironclad" },
      { name: "Investors", href: "/properties?source=broker", resource: "page:properties:broker" },
      { name: "Partners", href: "/properties?source=partners", resource: "page:properties:partners" },
    ],
  },
  { name: "Requests", href: "/requests", icon: ClipboardList, resource: "page:requests" },
  { name: "Manager", href: "/manager", icon: Database, resource: "page:manager" },
  { name: "Access", href: "/access", icon: Users, resource: "page:access" },
  { name: "Settings", href: "/settings", icon: Settings, resource: "page:settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [permissions, setPermissions] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function initUser() {
      // 1. Get current session (using getSession to reduce lock contention with getUser calls in pages)
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
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

  const isChildActive = (href: string) => {
    const [path, query] = href.split('?');
    if (pathname !== path) return false;
    const childParams = new URLSearchParams(query || '');
    return ['source', 'filter'].every(
      key => searchParams.get(key) === (childParams.get(key) ?? null)
    );
  };

  const toggleExpand = (name: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // Auto-expand parent when a child route is active
  useEffect(() => {
    NAV_ITEMS.forEach(item => {
      if (item.children) {
        const anyChildActive = item.children.some(c => isChildActive(c.href));
        if (anyChildActive) {
          setExpandedItems(prev => new Set(prev).add(item.name));
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  const visibleItems = permissions
    ? NAV_ITEMS.filter(item => {
        if (item.children) {
          return item.children.some(c => hasPermission(permissions, c.resource, 'view'));
        }
        return hasPermission(permissions, item.resource!, 'view');
      })
    : [];

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

          if (item.children) {
            const visibleChildren = item.children.filter(c =>
              hasPermission(permissions, c.resource, 'view')
            );
            const isOpen = expandedItems.has(item.name);
            const anyActive = visibleChildren.some(c => isChildActive(c.href));

            return (
              <div key={item.name}>
                <button
                  className={`nav-parent ${anyActive ? "parent-active" : ""}`}
                  onClick={() => toggleExpand(item.name)}
                >
                  <Icon className="nav-icon" />
                  <span>{item.name}</span>
                  <ChevronDown className={`nav-chevron ${isOpen ? "open" : ""}`} />
                </button>
                {isOpen && (
                  <div className="nav-subitems">
                    {visibleChildren.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`nav-subitem ${isChildActive(child.href) ? "active" : ""}`}
                      >
                        <span className="nav-subitem-dot" />
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href!}
              className={`nav-item ${isActive ? "active" : ""}`}
            >
              <Icon className="nav-icon" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
 
      {/* Version Badge */}
      <div className="sidebar-version-container" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => setShowChangelog(true)}
          className="version-badge"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '0.7rem',
            fontWeight: 400,
            cursor: 'pointer',
            padding: '0.2rem 0.4rem',
            borderRadius: '0.375rem',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span style={{ 
            width: '4px', 
            height: '4px', 
            backgroundColor: '#cbd5e1', 
            borderRadius: '50%', 
            display: 'inline-block'
          }}></span>
          <span>v{CURRENT_VERSION}</span>
        </button>
      </div>

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
            <NotificationBell />
            <button onClick={handleLogout} className="logout-btn-minimal" title="Logout" style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '5px' }}>
              <LogOut className="w-5 h-5 hover:text-white transition-colors" />
            </button>
          </div>
        ) : (
          <Link href="/login" style={{ color: 'white', opacity: 0.7, fontSize: '0.8rem', textDecoration: 'none' }}>Sign In</Link>
        )}
      </div>

      {/* Changelog Modal */}
      {showChangelog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }} onClick={() => setShowChangelog(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '1.25rem',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            animation: 'modalSlideIn 0.3s ease-out',
            overflow: 'hidden'
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  backgroundColor: 'rgba(202, 24, 26, 0.1)',
                  color: '#ca181a',
                  padding: '0.5rem',
                  borderRadius: '0.75rem',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>System Releases</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Changelog & System updates</span>
                </div>
              </div>
              <button 
                onClick={() => setShowChangelog(false)} 
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {/* List */}
            <div style={{
              padding: '1.5rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              flex: 1,
              textAlign: 'left'
            }}>
              {CHANGELOG.map((item) => (
                <div key={item.version} style={{ display: 'flex', gap: '1rem', position: 'relative' }}>
                  
                  {/* Timeline bullet */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: item.version === CURRENT_VERSION ? '#ca181a' : '#cbd5e1',
                      border: item.version === CURRENT_VERSION ? '3px solid rgba(202, 24, 26, 0.2)' : 'none',
                      zIndex: 2,
                      marginTop: '4px',
                      flexShrink: 0
                    }} />
                    <div style={{
                      width: '2px',
                      flex: 1,
                      backgroundColor: '#e2e8f0',
                      marginTop: '4px',
                      marginBottom: '-16px'
                    }} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a' }}>{item.title}</span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: item.version === CURRENT_VERSION ? 'rgba(202, 24, 26, 0.1)' : '#f1f5f9',
                        color: item.version === CURRENT_VERSION ? '#ca181a' : '#64748b',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '0.375rem',
                        whiteSpace: 'nowrap'
                      }}>
                        v{item.version}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.725rem', color: '#94a3b8', display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Released on {new Date(item.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                    <ul style={{ margin: 0, paddingLeft: '1.15rem', color: '#475569', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: 1.4 }}>
                      {item.changes.map((change, idx) => (
                        <li key={idx} style={{ color: '#475569' }}>{change}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: '#f8fafc'
            }}>
              <button 
                onClick={() => setShowChangelog(false)} 
                className="primary-btn"
                style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </aside>
  );
}
