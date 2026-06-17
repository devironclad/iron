"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";
import { getPreviewPartner, stopPreview } from "@/lib/impersonation";

export function PreviewBanner() {
  const router = useRouter();
  const [partner, setPartner] = useState<{ id: string; full_name: string } | null>(null);

  useEffect(() => {
    setPartner(getPreviewPartner());
  }, []);

  if (!partner) return null;

  function handleExit() {
    stopPreview();
    router.push("/access");
    router.refresh();
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      backgroundColor: '#b45309',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      padding: '0.5rem 1rem',
      fontSize: '0.8rem',
      fontWeight: 600,
    }}>
      <Eye className="w-4 h-4" style={{ flexShrink: 0 }} />
      <span>Preview mode — viewing as <strong>{partner.full_name}</strong></span>
      <button
        onClick={handleExit}
        style={{
          marginLeft: '1rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff',
          borderRadius: '6px',
          padding: '0.2rem 0.6rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <X className="w-3 h-3" />
        Exit Preview
      </button>
    </div>
  );
}
