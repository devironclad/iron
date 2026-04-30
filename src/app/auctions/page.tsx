"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Grid, List, Plus, MapPin, Calendar, Tag, ExternalLink, Search, Filter, ArrowRight, Loader2, ChevronLeft, ChevronRight, CheckCircle2, Navigation } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./auctions.css";

export default function AuctionsPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [auctions, setAuctions] = useState<any[]>([]);
  const [counties, setCounties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<{ title: string, desc: string } | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightId = searchParams.get('highlight');
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState("all");
  const [selectedCounty, setSelectedCounty] = useState(searchParams.get('county') || "all");
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || "");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 24;

  const uniqueStates = Array.from(new Set(counties.map(c => c.state).filter(Boolean))).sort();

  useEffect(() => {
    fetchAuctions();
    fetchCounties();
  }, [selectedCounty, selectedDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCounty, selectedState]);

  useEffect(() => {
    const savedView = localStorage.getItem("auctionsViewMode");
    if (savedView === "list" || savedView === "grid") setViewMode(savedView);

    const action = searchParams.get('action');
    if (action === 'updated') {
      setToastMsg({ title: "Successfully Updated", desc: "The auction record was successfully updated." });
    } else if (action === 'created') {
      setToastMsg({ title: "Successfully Created", desc: "A new auction record was successfully registered." });
    } else if (action === 'purchased') {
      setToastMsg({ title: "Property Purchased", desc: "The auction was successfully converted into a Property!" });
    }

    if (action) {
      const toastTimer = setTimeout(() => {
        setToastMsg(null);
        // Clean up the URL using Next.js router
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('action');
        router.replace(newUrl.pathname + newUrl.search, { scroll: false });
      }, 2000);

      return () => clearTimeout(toastTimer);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (highlightId) {
      setHighlightedRow(highlightId);
      const timer = setTimeout(() => {
        setHighlightedRow(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("auctionsViewMode", mode);
  };

  async function fetchCounties() {
    const { data } = await supabase.from("ls_county").select("id, name, state").order("name");
    setCounties(data || []);
  }

  async function fetchAuctions() {
    setLoading(true);
    try {
      let query = supabase
        .from("ls_assets")
        .select(`
          *,
          ls_county(name, state),
          ls_status(name),
          ls_priority(name, color),
          ls_auction_type(name)
        `)
        .eq("record_type", "AUCTION")
        .order("auction_date", { ascending: true });

      if (selectedCounty && selectedCounty !== "all") {
        query = query.eq("county_id", selectedCounty);
      }

      if (selectedDate) {
        // Filter by the specific day
        query = query.gte("auction_date", `${selectedDate}T00:00:00`)
                     .lte("auction_date", `${selectedDate}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAuctions(data || []);
    } catch (err) {
      console.error("Error fetching auctions:", err);
    } finally {
      setLoading(false);
    }
  }

  const isExpired = (dateString: string | null) => {
    if (!dateString) return false;
    return new Date(dateString) <= new Date();
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return "$ --";
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const truncateText = (text: string | null, limit: number) => {
    if (!text) return '';
    return text.length > limit ? text.substring(0, limit) + '...' : text;
  };

  const filteredAuctions = auctions.filter(a => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      (a.parcel_number?.toLowerCase().includes(searchLower)) ||
      (a.ls_county?.name?.toLowerCase().includes(searchLower)) ||
      (a.address?.toLowerCase().includes(searchLower))
    );
    const matchesState = selectedState === "all" || a.ls_county?.state === selectedState;
    return matchesSearch && matchesState;
  });

  const totalPages = Math.ceil(filteredAuctions.length / ITEMS_PER_PAGE);
  const paginatedAuctions = filteredAuctions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="auctions-container">

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Auctions<span className="dot">.</span></h1>
          <p className="page-subtitle">Manage upcoming auctions and research prospective acquisitions.</p>
        </div>
        <Link href="/auctions/new" className="primary-btn" style={{ textDecoration: 'none' }}>
          <Plus className="w-5 h-5" />
          New Auction
        </Link>
      </div>

      {/* Search and Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-wrapper">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Search by Parcel No, Address..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bar-actions">
          <div className="totalizer" style={{
            fontSize: '0.875rem',
            color: '#64748b',
            fontWeight: 500,
            paddingRight: '1rem',
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center'
          }}>
            <strong style={{ color: '#0f172a', marginRight: '0.35rem', fontSize: '1.25rem', lineHeight: 1 }}>{filteredAuctions.length}</strong> items
          </div>

          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => handleViewModeChange("grid")}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              className={`view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => handleViewModeChange("list")}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <select
            className="filter-dropdown"
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedCounty("all");
            }}
            style={{ backgroundColor: 'transparent', outline: 'none' }}
          >
            <option value="all">All States</option>
            {uniqueStates.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
          </select>

          <select
            className="filter-dropdown"
            value={selectedCounty}
            onChange={(e) => setSelectedCounty(e.target.value)}
            style={{ backgroundColor: 'transparent', outline: 'none' }}
          >
            <option value="all">All Counties</option>
            {counties
              .filter(c => selectedState === "all" || c.state === selectedState)
              .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="empty-state">
          <Loader2 className="w-8 h-8 animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
          <span>Fetching real-time data from Supabase...</span>
        </div>
      ) : filteredAuctions.length === 0 ? (
        <div className="empty-state">
          <span>No auctions found matching your criteria.</span>
          <Link href="/auctions/new" style={{ color: 'var(--primary)', fontWeight: 600, display: 'block', marginTop: '1rem' }}>
            Register your first auction now
          </Link>
        </div>
      ) : viewMode === "grid" ? (
        <div className="auctions-grid">
          {paginatedAuctions.map((auction) => {
            const expired = isExpired(auction.auction_date);
            const isHighlighted = highlightedRow === auction.id.toString();
            return (
              <div
                key={auction.id}
                className="auction-card"
                style={isHighlighted ? {
                  boxShadow: '0 0 25px 8px rgba(59, 130, 246, 0.4), 0 0 0 2px #3b82f6',
                  transform: 'translateY(-4px)',
                  transition: 'all 0.4s ease-out',
                  position: 'relative',
                  zIndex: 10
                } : { transition: 'all 0.3s ease-in-out' }}
              >

                <div className="card-top">
                  <div className="card-top-left" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="card-label">ID: {auction.id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <span className="card-status">{expired ? 'EXPIRED' : (auction.ls_status?.name || 'NEW').toUpperCase()}</span>
                    {auction.ls_priority?.name && (
                      <span
                        style={{
                          backgroundColor: auction.ls_priority.color || '#94a3b8',
                          color: '#fff',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
                      >
                        {auction.ls_priority.name}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="card-parcel">{auction.ls_county?.name || 'Unknown County'} {auction.ls_county?.state && `(${auction.ls_county.state})`}</h3>

                <div className="card-details-grid">
                  <div className="detail-item">
                    <MapPin className="w-4 h-4 detail-icon flex-shrink-0" />
                    <span title={auction.address || 'Address not provided'}>
                      {truncateText(auction.address || 'Address not provided', 30)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <Navigation className="w-4 h-4 detail-icon flex-shrink-0" />
                    <span title={auction.coordinates || 'No coordinates'}>
                      {truncateText(auction.coordinates || 'No coordinates', 30)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <Calendar className="w-4 h-4 detail-icon" />
                    <span style={{ color: expired ? "var(--status-expired)" : "inherit" }}>{formatDate(auction.auction_date)}</span>
                  </div>
                  <div className="detail-item">
                    <Tag className="w-4 h-4 detail-icon" />
                    <span>{auction.ls_auction_type?.name || 'Unspecified'}</span>
                  </div>
                  <div className="detail-item link-item">
                    <ExternalLink className="w-4 h-4 detail-icon link-icon" />
                    {auction.link_regrid ? (
                      <a href={auction.link_regrid} target="_blank" rel="noopener noreferrer" className="regrid-link">Regrid</a>
                    ) : (
                      <span className="text-muted">No Link</span>
                    )}
                  </div>
                </div>

                <div className="card-financials">
                  <div className="fin-block">
                    <span className="fin-label">CASE NUMBER</span>
                    <span className="fin-value-large" style={{ fontSize: '1.125rem' }}>{auction.case_number || 'N/A'}</span>
                  </div>
                  <div className="fin-block align-right">
                    <span className="fin-label">MKT VALUE</span>
                    <span className="fin-value-green">{formatCurrency(auction.market_value)}</span>
                  </div>
                </div>

                <Link href={`/auctions/new?id=${auction.id}`} className="card-details-btn" style={{ textDecoration: 'none' }}>
                  Edit Details
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}

          <Link href="/auctions/new" className="add-new-card" style={{ textDecoration: 'none' }}>
            <Plus className="w-6 h-6 add-icon" />
            <span className="add-title">Register Another</span>
            <span className="add-subtitle">NEW ENTRY</span>
          </Link>
        </div>
      ) : (
        <table className="auctions-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Parcel #</th>
              <th>County</th>
              <th>Date</th>
              <th>Type</th>
              <th>Open Bid</th>
              <th>Mkt Value</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedAuctions.map((auction) => {
              const expired = isExpired(auction.auction_date);
              const isHighlighted = highlightedRow === auction.id.toString();
              return (
                <tr
                  key={auction.id}
                  style={isHighlighted ? {
                    backgroundColor: '#eff6ff',
                    boxShadow: 'inset 0 0 15px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.4s ease-out'
                  } : { transition: 'all 0.3s ease-in-out' }}
                >
                  <td>{auction.id}</td>
                  <td style={{ fontWeight: 600 }}>{auction.parcel_number}</td>
                  <td>{auction.ls_county?.name}</td>
                  <td style={{ color: expired ? "var(--status-expired)" : "inherit" }}>
                    {formatDate(auction.auction_date)}
                  </td>
                  <td>{auction.ls_auction_type?.name}</td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(auction.open_bid)}</td>
                  <td style={{ fontWeight: 600, color: "#10b981" }}>{formatCurrency(auction.market_value)}</td>
                  <td>
                    <span style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      backgroundColor: expired ? "#fee2e2" : "#f1f5f9",
                      color: expired ? "#ef4444" : "#475569",
                      fontWeight: 600
                    }}>
                      {expired ? 'EXPIRED' : (auction.ls_status?.name || 'NEW').toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {auction.ls_priority?.name ? (
                      <span style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        backgroundColor: auction.ls_priority.color || "#94a3b8",
                        color: "#fff",
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}>
                        {auction.ls_priority.name}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>--</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/auctions/new?id=${auction.id}`} className="primary-btn" style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem", textDecoration: 'none' }}>Edit</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Pagination Controls */}
      {!loading && filteredAuctions.length > 0 && totalPages > 1 && (
        <div className="pagination-container" style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
          marginTop: '2rem',
          paddingBottom: '2rem'
        }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              backgroundColor: currentPage === 1 ? '#f8fafc' : 'white',
              color: currentPage === 1 ? '#cbd5e1' : '#475569',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>
            Page <strong style={{ color: '#0f172a' }}>{currentPage}</strong> of <strong style={{ color: '#0f172a' }}>{totalPages}</strong>
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              backgroundColor: currentPage === totalPages ? '#f8fafc' : 'white',
              color: currentPage === totalPages ? '#cbd5e1' : '#475569',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem',
          backgroundColor: '#10b981', color: 'white',
          padding: '1rem 1.5rem', borderRadius: '0.75rem',
          boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.5), 0 8px 10px -6px rgba(16, 185, 129, 0.1)',
          zIndex: 50, display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          animation: 'slideUpFade 0.3s ease-out forwards'
        }}>
          <CheckCircle2 className="w-6 h-6 flex-shrink-0" style={{ marginTop: '0.125rem' }} />
          <div>
            <h4 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>{toastMsg.title}</h4>
            <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>{toastMsg.desc}</p>
          </div>
        </div>
      )}
    </div>
  );
}
