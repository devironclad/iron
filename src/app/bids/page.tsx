"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Search, HandCoins, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserPermissions, hasPermission } from "@/lib/permissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

type BidRow = {
  auction_listing_id: number;
  cosl_property_id: number | null;
  owner: string | null;
  county: string | null;
  parcel_number: string | null;
  acreage: number | null;
  listing_start: string | null;
  listing_end: string | null;
  start_cst: string | null;
  end_cst: string | null;
  max_bid: number | null;
  display_max_bid: string | null;
  winning_bid_amount: number | null;
  my_bid_count: number | null;
  total_bids: number | null;
  status: string | null;
  display_status: number | null;
  standing_label: string | null;
  synced_at: string | null;
};

type SyncMeta = {
  last_run_at: string | null;
  last_success_at: string | null;
  status: string | null;
  message: string | null;
  row_count: number | null;
  duration_ms: number | null;
};

const currency = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

/** COSL sends "8/13/2026 11:00:12 PM CDT" — drop the trailing timezone abbreviation. */
const cstDisplay = (s: string | null) => (s ? s.replace(/\s+[A-Z]{2,4}$/, "") : "—");

function relativeFromNow(iso: string | null, now: number): string {
  if (!iso) return "never";
  const diff = now - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function timeRemaining(iso: string | null, now: number): { label: string; ended: boolean } {
  if (!iso) return { label: "—", ended: false };
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return { label: "Ended", ended: true };
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return { label: `${d}d ${h}h`, ended: false };
  if (h > 0) return { label: `${h}h ${m}m`, ended: false };
  return { label: `${m}m`, ended: false };
}

async function fetchBidsData(): Promise<{ rows: BidRow[]; meta: SyncMeta | null }> {
  const [bidsRes, metaRes] = await Promise.all([
    supabase.from("cosl_my_bids").select("*").order("listing_end", { ascending: true }),
    supabase.from("cosl_sync_meta").select("*").eq("id", 1).maybeSingle(),
  ]);
  return { rows: (bidsRes.data ?? []) as BidRow[], meta: (metaRes.data ?? null) as SyncMeta | null };
}

export default function BidsPage() {
  const [rows, setRows] = useState<BidRow[]>([]);
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [county, setCounty] = useState("all");
  const [standing, setStanding] = useState("all");
  const [now, setNow] = useState(() => Date.now());
  const [canEdit, setCanEdit] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getCurrentUserPermissions().then((p) => setCanEdit(hasPermission(p, "page:bids", "edit")));
  }, []);

  useEffect(() => {
    let active = true;
    fetchBidsData().then((d) => {
      if (!active) return;
      setRows(d.rows);
      setMeta(d.meta);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/bids/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (res.status === 429) {
        setRefreshMsg(`Just refreshed — try again in ${json.retryInSec}s`);
      } else if (!res.ok || json.ok === false) {
        setRefreshMsg(`Refresh failed: ${json.error ?? res.statusText}`);
      }
      const d = await fetchBidsData();
      setRows(d.rows);
      setMeta(d.meta);
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
      setNow(Date.now());
      setTimeout(() => setRefreshMsg(null), 6000);
    }
  }, [refreshing]);

  const counties = useMemo(
    () => [...new Set(rows.map((r) => r.county).filter(Boolean))].sort() as string[],
    [rows],
  );
  const standings = useMemo(
    () => [...new Set(rows.map((r) => r.standing_label).filter(Boolean))].sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (county !== "all" && r.county !== county) return false;
      if (standing !== "all" && r.standing_label !== standing) return false;
      if (!q) return true;
      return [r.owner, r.parcel_number, r.county].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, county, standing]);

  const freshness = (() => {
    if (!meta) return { cls: "stale", text: "No sync recorded yet" };
    if (meta.status === "error")
      return {
        cls: "error",
        text: `Last update failed ${relativeFromNow(meta.last_run_at, now)}${meta.message ? ` — ${meta.message}` : ""}`,
      };
    const ageMin = meta.last_success_at
      ? (now - new Date(meta.last_success_at).getTime()) / 60000
      : Infinity;
    const cls = ageMin > 150 ? "stale" : "ok";
    return { cls, text: `Updated ${relativeFromNow(meta.last_success_at, now)}` };
  })();

  return (
    <PermissionGuard resource="page:bids">
      <div className="bids-container">
        <div className="page-header">
          <div className="page-header-text">
            <h1 className="page-title">
              Bids<span className="dot">.</span>
            </h1>
            <p className="page-subtitle">
              Live positions from the COSL auction site (My Auctions → My Bids), refreshed hourly.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
            <a
              href="https://auction.cosl.org/auctions"
              target="_blank"
              rel="noopener noreferrer"
              className="bids-cosl-link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open COSL auctions
            </a>
            {canEdit ? (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className={`bids-freshness as-button ${freshness.cls}`}
                title="Refresh now"
              >
                {refreshing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : freshness.cls === "error" ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {refreshing ? "Refreshing…" : freshness.text}
              </button>
            ) : (
              <div className={`bids-freshness ${freshness.cls}`}>
                {freshness.cls === "error" ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {freshness.text}
              </div>
            )}
            {refreshMsg && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "right", maxWidth: 320 }}>
                {refreshMsg}
              </span>
            )}
          </div>
        </div>

        <div className="search-filter-bar">
          <div className="search-wrapper">
            <Search className="w-5 h-5 search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search owner, parcel or county…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="bar-actions">
            <div className="totalizer">
              <strong>{filtered.length}</strong> of {rows.length}
            </div>
            <select className="auc-filter-select" value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="all">All Counties</option>
              {counties.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select className="auc-filter-select" value={standing} onChange={(e) => setStanding(e.target.value)}>
              <option value="all">All Standings</option>
              {standings.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--primary)" }} />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="bids-table">
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>County</th>
                  <th>Parcel #</th>
                  <th>Start (CT)</th>
                  <th>End (CT)</th>
                  <th>Time left</th>
                  <th className="num">Our Max Bid</th>
                  <th>Standing</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                        <HandCoins className="w-10 h-10 opacity-50" />
                        <span>{rows.length === 0 ? "No bids collected yet." : "No rows match your filters."}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const tr = timeRemaining(r.listing_end, now);
                    const winning = r.standing_label === "Winning";
                    return (
                      <tr key={r.auction_listing_id}>
                        <td style={{ fontWeight: 600, maxWidth: 220 }}>
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.owner ?? "—"}
                          </div>
                        </td>
                        <td>{r.county ?? "—"}</td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.parcel_number ?? "—"}</td>
                        <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{cstDisplay(r.start_cst)}</td>
                        <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{cstDisplay(r.end_cst)}</td>
                        <td style={{ color: tr.ended ? "var(--text-muted)" : "inherit", fontWeight: tr.ended ? 400 : 600 }}>
                          {tr.label}
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {r.display_max_bid ?? currency(r.max_bid)}
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: winning ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                              color: winning ? "#047857" : "#b91c1c",
                            }}
                          >
                            {r.standing_label ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
