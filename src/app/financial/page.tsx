"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3 } from "lucide-react";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "../dashboard.css";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

// Shared column grid so every row (header, total, per-owner) lines up under the same Min / Avg / Max positions
const metricsGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(100px, 140px) repeat(3, 1fr)', columnGap: '1rem', width: '100%', alignItems: 'baseline' };

const columnHeadStyle: CSSProperties = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' };
const totalValueStyle: CSSProperties = { fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, textAlign: 'right' };

const rowLabelStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' };
const ownerValueStyle: CSSProperties = { fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' };

type OwnerTotals = { min: number; avg: number; max: number };

const sumByOwner = (properties: { owner_type: string | null; appraisal_min: number | null; appraisal_avg: number | null; appraisal_max: number | null }[], isIronclad: boolean): OwnerTotals => {
  const subset = properties.filter(p => (!p.owner_type || p.owner_type !== 'partner') === isIronclad);
  return {
    min: subset.filter(p => p.appraisal_min != null).reduce((acc, p) => acc + (p.appraisal_min || 0), 0),
    avg: subset.filter(p => p.appraisal_avg != null).reduce((acc, p) => acc + (p.appraisal_avg || 0), 0),
    max: subset.filter(p => p.appraisal_max != null).reduce((acc, p) => acc + (p.appraisal_max || 0), 0),
  };
};

export default function FinancialDashboard() {
  const [stats, setStats] = useState({
    totalProjectedValue: 0,
    totalProjectedValueMin: 0,
    totalProjectedValueMax: 0,
    unappraisedCount: 0,
    ironclad: { min: 0, avg: 0, max: 0 } as OwnerTotals,
    investors: { min: 0, avg: 0, max: 0 } as OwnerTotals
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFinancialData() {
      setLoading(true);
      try {
        const { data: propertiesRaw } = await supabase
          .from('ls_assets')
          .select('id, owner_type, appraisal_min, appraisal_avg, appraisal_max')
          .eq('record_type', 'PROPERTY')
          .or('sale_type.is.null,sale_type.neq.sold_out')
          .limit(1000);

        const properties = propertiesRaw || [];

        // Total Projected Value (sum of Appraisal Min / Avg / Max across active portfolio)
        const appraisedProps = properties.filter(p => p.appraisal_avg != null);
        const totalProjectedValue = appraisedProps.reduce((acc, p) => acc + (p.appraisal_avg || 0), 0);
        const totalProjectedValueMin = properties
          .filter(p => p.appraisal_min != null)
          .reduce((acc, p) => acc + (p.appraisal_min || 0), 0);
        const totalProjectedValueMax = properties
          .filter(p => p.appraisal_max != null)
          .reduce((acc, p) => acc + (p.appraisal_max || 0), 0);

        setStats({
          totalProjectedValue,
          totalProjectedValueMin,
          totalProjectedValueMax,
          unappraisedCount: properties.length - appraisedProps.length,
          ironclad: sumByOwner(properties, true),
          investors: sumByOwner(properties, false)
        });
      } catch (err) {
        console.error("Financial data fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchFinancialData();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <PermissionGuard resource="page:dashboard:financial">
      <div className="dashboard-container">
        <div className="page-header">
          <div className="page-header-text">
            <h1 className="page-title">Financial<span className="dot">.</span></h1>
            <p className="page-subtitle">Projected sale value across the active portfolio</p>
          </div>
        </div>

        {/* Projected Sale Value — if every active asset sold at its Appraisal Min / Avg / Max */}
        <div className="kpi-card" style={{ cursor: 'default', alignItems: 'flex-start' }}>
          <div className="kpi-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="kpi-info" style={{ flex: 1 }}>
            <h3>Total Projected Value</h3>

            {/* Column headers */}
            <div style={{ ...metricsGridStyle, marginTop: '0.5rem' }}>
              <div />
              <div style={columnHeadStyle}>Min</div>
              <div style={columnHeadStyle}>Avg</div>
              <div style={columnHeadStyle}>Max</div>
            </div>

            {/* Total row */}
            <div style={{ ...metricsGridStyle, marginTop: '0.3rem' }}>
              <div style={rowLabelStyle}>Total</div>
              <div style={totalValueStyle}>{formatCurrency(stats.totalProjectedValueMin)}</div>
              <div style={totalValueStyle}>{formatCurrency(stats.totalProjectedValue)}</div>
              <div style={totalValueStyle}>{formatCurrency(stats.totalProjectedValueMax)}</div>
            </div>

            {stats.unappraisedCount > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span className="stat-pill stat-pill--neutral">
                  <span className="stat-pill-dot" />
                  No appraisal · {stats.unappraisedCount}
                </span>
              </div>
            )}

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={metricsGridStyle}>
                <div style={rowLabelStyle}>
                  <span className="stat-pill-dot" style={{ background: 'var(--primary)' }} />
                  Ironclad
                </div>
                <div style={ownerValueStyle}>{formatCurrency(stats.ironclad.min)}</div>
                <div style={ownerValueStyle}>{formatCurrency(stats.ironclad.avg)}</div>
                <div style={ownerValueStyle}>{formatCurrency(stats.ironclad.max)}</div>
              </div>
              <div style={metricsGridStyle}>
                <div style={rowLabelStyle}>
                  <span className="stat-pill-dot" style={{ background: 'var(--text-muted)' }} />
                  Investors
                </div>
                <div style={ownerValueStyle}>{formatCurrency(stats.investors.min)}</div>
                <div style={ownerValueStyle}>{formatCurrency(stats.investors.avg)}</div>
                <div style={ownerValueStyle}>{formatCurrency(stats.investors.max)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}
