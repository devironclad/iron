"use client";

import { useEffect, useState } from "react";
import { getCurrentUserPermissions, hasPermission, Permission } from "@/lib/permissions";
import { ShieldCheck, Loader2 } from "lucide-react";
import Link from "next/link";

interface PermissionGuardProps {
  resource?: string;
  anyOf?: string[];
  children: React.ReactNode;
}

export function PermissionGuard({ resource, anyOf, children }: PermissionGuardProps) {
  const [permissions, setPermissions] = useState<Record<string, Permission> | null>(null);

  useEffect(() => {
    async function load() {
      const perms = await getCurrentUserPermissions();
      setPermissions(perms);
    }
    load();
  }, []);

  if (permissions === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  const allowed = anyOf
    ? anyOf.some(r => hasPermission(permissions, r))
    : resource
    ? hasPermission(permissions, resource)
    : false;

  if (!allowed) {
    return (
      <div className="empty-state" style={{ 
        height: '80vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <ShieldCheck className="w-16 h-16 mb-4 opacity-20" style={{ color: 'var(--primary)' }} />
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 700 }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: '2rem' }}>
          You do not have permission to view this resource. Please contact your administrator to assign the correct profile to your account.
        </p>
        <Link href="/" style={{ 
          color: 'var(--primary)', 
          textDecoration: 'none', 
          fontWeight: 600,
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--primary)',
          transition: 'all 0.2s'
        }}>
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
