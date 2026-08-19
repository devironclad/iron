"use client";

import NextImage from "next/image";
import Link from "next/link";
import { MapPin, Hash, Maximize, ImageOff, CheckCircle2, HandCoins, Calendar, Gavel, Briefcase, ArrowRight, Coins, DollarSign, TrendingUp } from "lucide-react";
import { formatPropId } from "@/lib/utils";

export type OpportunityTier = { label: string; projectedAmount: number };

export type OpportunityProperty = {
  id: number;
  refId: number | null;
  address: string | null;
  parcelNumber: string | null;
  caseNumber: string | null;
  size: number | null;
  photoUrl: string | null;
  acquisitionDate: string | null;
  salePrice: number | null;
  investmentTotalInv: number | null;
  county: string | null;
  state: string | null;
  origin: string | null;
  propertyType: string | null;
  auctionType: string | null;
  tiers: OpportunityTier[];
  alreadyInterested: boolean;
};

const formatCurrency = (val: number | null) => {
  if (val === null) return "$ --";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const TIER_COLORS = [
  { fill: 25, color: "#6ee7b7", textColor: "#065f46" },
  { fill: 50, color: "#34d399", textColor: "#065f46" },
  { fill: 75, color: "#10b981", textColor: "#ffffff" },
  { fill: 100, color: "#059669", textColor: "#ffffff" },
];

export function OpportunityCard({
  property,
  disabled,
  returnTo,
  onRegisterInterest,
}: {
  property: OpportunityProperty;
  disabled: boolean;
  returnTo: string;
  onRegisterInterest: () => void;
}) {
  const truncate = (text: string | null, limit: number) =>
    !text ? "" : text.length > limit ? text.substring(0, limit) + "..." : text;

  const inv = property.investmentTotalInv;
  const roi = inv != null && property.salePrice != null && inv > 0
    ? ((property.salePrice - inv) / inv) * 100
    : null;

  return (
    <div className="property-card">
      <div style={{ display: "flex", gap: "1.25rem", margin: "-1.25rem", padding: 0 }}>
        <div style={{
          width: "160px", flexShrink: 0, overflow: "hidden", borderRadius: "0.75rem 0 0 0.75rem",
          backgroundColor: "#f1f5f9", alignSelf: "stretch", position: "relative", minHeight: "180px",
        }}>
          {property.photoUrl ? (
            <NextImage src={property.photoUrl} alt="Property photo" fill quality={90} style={{ objectFit: "cover" }} sizes="320px" />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.4rem", color: "#94a3b8" }}>
              <ImageOff className="w-8 h-8" />
              <span style={{ fontSize: "0.65rem", fontWeight: 600, textAlign: "center", padding: "0 0.5rem" }}>No photo</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: "1.25rem 1.25rem 1.25rem 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{
                fontSize: "0.78rem", fontWeight: 800, color: "#0f172a",
                backgroundColor: "#f1f5f9", border: "1px solid #e2e8f0",
                padding: "0.2rem 0.55rem", borderRadius: "6px", letterSpacing: "0.04em",
              }}>
                {formatPropId(property.refId, property.id)}
              </span>
              {property.origin && (
                <>
                  <span style={{ color: "#cbd5e1" }}>•</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>{property.origin}</span>
                </>
              )}
              {property.propertyType && (
                <>
                  <span style={{ color: "#cbd5e1" }}>•</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#94a3b8" }}>{property.propertyType}</span>
                </>
              )}
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              backgroundColor: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
              padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700,
            }}>
              IronClad
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr", gap: "1.75rem", alignItems: "stretch" }}>
            {/* COLUNA 1 — Detalhes da propriedade */}
            <div>
              <div style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "0.6rem" }}>
                {property.county || "Unknown County"}{property.state && `, ${property.state}`}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem 1rem" }}>
                <div className="detail-item">
                  <MapPin className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                  <span style={{ fontSize: "0.78rem" }} title={property.address || "--"}>{truncate(property.address, 28)}</span>
                </div>
                <div className="detail-item">
                  <Hash className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                  <span style={{ fontSize: "0.78rem" }} title={property.parcelNumber || "--"}>{truncate(property.parcelNumber, 28)}</span>
                </div>
                <div className="detail-item">
                  <Calendar className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                  <span style={{ fontSize: "0.78rem" }}>{formatDate(property.acquisitionDate)}</span>
                </div>
                <div className="detail-item">
                  <Gavel className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                  <span style={{ fontSize: "0.78rem" }}>{property.auctionType || "N/A"}</span>
                </div>
                <div className="detail-item">
                  <Maximize className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                  <span style={{ fontSize: "0.78rem" }}>{property.size ? `${property.size} AC` : "No Size"}</span>
                </div>
                <div className="detail-item">
                  <Briefcase className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                  <span style={{ fontSize: "0.78rem" }} title={property.caseNumber || "--"}>{property.caseNumber || "--"}</span>
                </div>
              </div>
            </div>

            {/* COLUNA 2 — KPI Metrics */}
            <div style={{ borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", padding: "0 1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem", justifyContent: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "9px", backgroundColor: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Coins className="w-4 h-4" style={{ color: "#d97706" }} />
                </div>
                <div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Investment</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{formatCurrency(inv)}</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "9px", backgroundColor: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <DollarSign className="w-4 h-4" style={{ color: "#059669" }} />
                </div>
                <div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sales Price</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{formatCurrency(property.salePrice)}</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "9px", backgroundColor: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <TrendingUp className="w-4 h-4" style={{ color: "#7c3aed" }} />
                </div>
                <div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>ROI</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: roi != null && roi >= 0 ? "#7c3aed" : "#dc2626", lineHeight: 1.2 }}>
                    {roi != null ? `${roi.toFixed(1)}%` : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* COLUNA 3 — Chart + Ações */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.6rem" }}>
                  Profit Projection
                </div>
                {property.tiers.length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Projection unavailable</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {property.tiers.map((t, i) => {
                      const style = TIER_COLORS[i] || TIER_COLORS[TIER_COLORS.length - 1];
                      return (
                        <div key={t.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{ width: "32px", fontSize: "0.58rem", fontWeight: 700, color: "#94a3b8", textAlign: "right", flexShrink: 0 }}>{t.label}</div>
                          <div style={{ flex: 1, height: "18px", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{
                              width: `${style.fill}%`, height: "100%", backgroundColor: style.color, borderRadius: "4px",
                              display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "6px",
                            }}>
                              <span style={{ fontSize: "0.58rem", fontWeight: 700, color: style.textColor, whiteSpace: "nowrap" }}>
                                {formatCurrency(t.projectedAmount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {inv != null && inv > 0 && (
                      <div style={{ fontSize: "0.6rem", color: "#94a3b8", marginTop: "2px", paddingLeft: "40px", fontWeight: 500 }}>
                        Base (Partner Investment): {formatCurrency(inv)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                {property.alreadyInterested ? (
                  <button disabled className="card-details-btn" style={{ cursor: "default", backgroundColor: "#ecfdf5", color: "#047857" }}>
                    <CheckCircle2 className="w-4 h-4" />
                    Interest Registered
                  </button>
                ) : (
                  <button
                    onClick={onRegisterInterest}
                    disabled={disabled}
                    title={disabled ? "Action disabled during preview" : undefined}
                    className="card-details-btn"
                    style={{
                      backgroundColor: disabled ? "#f1f5f9" : "#0f172a",
                      color: disabled ? "#94a3b8" : "white", cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    <HandCoins className="w-4 h-4" />
                    Register Purchase Interest
                  </button>
                )}
                <Link
                  href={`/properties/${property.id}?source=ironclad-opportunity&returnTo=${encodeURIComponent(returnTo)}`}
                  className="card-details-btn"
                  style={{ textDecoration: "none" }}
                >
                  Open Property
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
