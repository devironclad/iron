"use client";

import { useEffect, useState, useRef } from "react";
import {
  Search, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Filter, CheckCircle2
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getPreviewPartner } from "@/lib/impersonation";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { OpportunityCard, OpportunityProperty } from "./OpportunityCard";
import { ConfirmInterestModal } from "./ConfirmInterestModal";
import "../properties.css";

const PAGE_SIZE = 24;
const RESOURCE_KEY = "page:properties:ironclad-opportunities";

export default function IroncladOpportunitiesPage() {
  const [properties, setProperties] = useState<OpportunityProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [counties, setCounties] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState("all");
  const [selectedCounty, setSelectedCounty] = useState("all");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string } | null>(null);
  const [modalProperty, setModalProperty] = useState<OpportunityProperty | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const preview = useRef(getPreviewPartner());
  const isPreviewMode = !!preview.current;

  const uniqueStates = Array.from(new Set(counties.map((c) => c.state).filter(Boolean))).sort();

  useEffect(() => {
    supabase.from("ls_county").select("id, name, state").order("name").then(({ data }) => setCounties(data || []));
  }, []);

  useEffect(() => {
    fetchOpportunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState, selectedCounty, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedState, selectedCounty]);

  async function fetchOpportunities() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setProperties([]);
        setTotalCount(0);
        return;
      }

      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      if (selectedState !== "all") params.set("state", selectedState);
      if (selectedCounty !== "all") params.set("county", selectedCounty);
      if (preview.current) params.set("previewPartnerId", preview.current.id);

      const res = await fetch(`/api/properties/ironclad-opportunities?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load opportunities");

      setProperties(json.properties || []);
      setTotalCount(json.totalCount || 0);
    } catch (err) {
      console.error("Error fetching ironclad opportunities:", err);
      setProperties([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function confirmInterest(message: string) {
    if (!modalProperty) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/properties/ironclad-opportunities/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ asset_id: modalProperty.id, message: message || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to register interest");

      setProperties((prev) => prev.map((p) => (p.id === modalProperty.id ? { ...p, alreadyInterested: true } : p)));
      setToastMsg({
        title: "Interest Registered",
        desc: "Our team has been notified and will reach out soon.",
      });
      setModalProperty(null);
    } catch (err: any) {
      console.error("Error registering interest:", err);
      setToastMsg({ title: "Error", desc: err.message || "Could not register interest." });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <PermissionGuard resource={RESOURCE_KEY}>
      <div className="properties-container">
        <div className="page-header">
          <div className="page-header-text">
            <h1 className="page-title">Ironclad Opportunities<span className="dot">.</span></h1>
            <p className="page-subtitle">
              Ironclad-owned properties available. The values shown are a simulated projection.
            </p>
          </div>
        </div>

        {isPreviewMode && (
          <div style={{
            backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e",
            borderRadius: "0.75rem", padding: "0.75rem 1rem", fontSize: "0.85rem", fontWeight: 600,
          }}>
            Preview mode (Preview as Partner) — registering interest is disabled.
          </div>
        )}

        <div className="search-filter-bar">
          <div className="bar-actions" style={{ flex: 1 }}>
            <div className="totalizer">
              <strong>{totalCount}</strong> properties
            </div>
          </div>
          <button
            className={`filter-toggle-btn ${showAdvanced ? "active" : ""}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>

          <div className={`prop-advanced-filters-panel ${showAdvanced ? "show" : ""}`}>
            <div className="prop-filters-container">
              <div className="prop-filter-item">
                <label>State</label>
                <select
                  className="prop-filter-select"
                  value={selectedState}
                  onChange={(e) => { setSelectedState(e.target.value); setSelectedCounty("all"); }}
                >
                  <option value="all">All States</option>
                  {uniqueStates.map((s) => <option key={s as string} value={s as string}>{s as string}</option>)}
                </select>
              </div>
              <div className="prop-filter-item">
                <label>County</label>
                <select
                  className="prop-filter-select"
                  value={selectedCounty}
                  onChange={(e) => setSelectedCounty(e.target.value)}
                >
                  <option value="all">All Counties</option>
                  {counties
                    .filter((c) => selectedState === "all" || c.state === selectedState)
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <Loader2 className="w-8 h-8 animate-spin" style={{ margin: "0 auto 1rem", color: "#10b981" }} />
            <span>Loading opportunities...</span>
          </div>
        ) : totalCount === 0 ? (
          <div className="empty-state">
            <span>No properties found.</span>
          </div>
        ) : (
          <div className="properties-grid">
            {properties.map((prop) => (
              <OpportunityCard
                key={prop.id}
                property={prop}
                disabled={isPreviewMode}
                returnTo={`/properties/ironclad-opportunities?page=${currentPage}`}
                onRegisterInterest={() => setModalProperty(prop)}
              />
            ))}
          </div>
        )}

        {!loading && totalCount > 0 && totalPages > 1 && (
          <div className="pagination-container" style={{
            display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem",
            marginTop: "2rem", paddingBottom: "2rem",
          }}>
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="filter-toggle-btn">
              <ChevronsLeft className="w-5 h-5" />
            </button>
            <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="filter-toggle-btn">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: 500 }}>
              Page <strong style={{ color: "#0f172a" }}>{currentPage}</strong> of <strong style={{ color: "#0f172a" }}>{totalPages}</strong>
            </span>
            <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="filter-toggle-btn">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="filter-toggle-btn">
              <ChevronsRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {modalProperty && (
          <ConfirmInterestModal
            property={modalProperty}
            submitting={submitting}
            onCancel={() => setModalProperty(null)}
            onConfirm={confirmInterest}
          />
        )}

        {toastMsg && (
          <div style={{
            position: "fixed", bottom: "2rem", right: "2rem",
            backgroundColor: "#10b981", color: "white",
            padding: "1rem 1.5rem", borderRadius: "0.75rem",
            boxShadow: "0 10px 25px -5px rgba(16, 185, 129, 0.5), 0 8px 10px -6px rgba(16, 185, 129, 0.1)",
            zIndex: 10000, display: "flex", alignItems: "flex-start", gap: "0.75rem",
            animation: "slideUpFade 0.3s ease-out forwards",
          }}>
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" style={{ marginTop: "0.125rem" }} />
            <div>
              <h4 style={{ fontWeight: 700, margin: 0, fontSize: "1rem" }}>{toastMsg.title}</h4>
              <p style={{ margin: 0, fontSize: "0.875rem", opacity: 0.9, marginTop: "0.25rem" }}>{toastMsg.desc}</p>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
