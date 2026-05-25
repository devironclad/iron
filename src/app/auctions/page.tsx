"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  Grid, List, Plus, MapPin, Calendar, Tag, ExternalLink, Search, 
  Filter, ArrowRight, Loader2, ChevronLeft, ChevronRight, 
  CheckCircle2, Navigation, Layers, Maximize, Download, Trash2, Hash
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserPermissions, hasPermission, Permission } from "@/lib/permissions";
import * as XLSX from "xlsx";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "./auctions.css";

export default function AuctionsPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [auctions, setAuctions] = useState<any[]>([]);
  const [counties, setCounties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<{ title: string, desc: string } | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const [recentCardId, setRecentCardId] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [auctionToDelete, setAuctionToDelete] = useState<{id: number, parcel: string} | null>(null);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState("all");
  const [selectedCounty, setSelectedCounty] = useState(searchParams.get('county') || "all");
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || "");
  const [selectedOrigem, setSelectedOrigem] = useState("all");
  const [selectedAuctionType, setSelectedAuctionType] = useState("all");
  const [selectedPropertyType, setSelectedPropertyType] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPast, setShowPast] = useState(false);
  
  const [lookups, setLookups] = useState<{
    origens: any[],
    auctionTypes: any[],
    propertyTypes: any[],
    priorities: any[]
  }>({
    origens: [],
    auctionTypes: [],
    propertyTypes: [],
    priorities: []
  });
  const [userPermissions, setUserPermissions] = useState<Record<string, Permission> | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 24;

  const uniqueStates = Array.from(new Set(counties.map(c => c.state).filter(Boolean))).sort();

  useEffect(() => {
    fetchCounties();
    fetchLookups();
    loadPermissions();
  }, []);

  async function loadPermissions() {
    const perms = await getCurrentUserPermissions();
    setUserPermissions(perms);
  }

  useEffect(() => {
    fetchAuctions();
  }, [selectedState, selectedCounty, selectedDate, selectedOrigem, selectedAuctionType, selectedPropertyType, selectedPriority, showPast, currentPage, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCounty, selectedState, selectedOrigem, selectedAuctionType, selectedPropertyType, selectedPriority, selectedDate]);

  useEffect(() => {
    const savedView = localStorage.getItem("auctionsViewMode");
    if (savedView === "list" || savedView === "grid") setViewMode(savedView);
  }, []);

  // Toast — reads window.location.search on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;
    if (action === 'updated') {
      setToastMsg({ title: "Successfully Updated", desc: "The auction record was successfully updated." });
    } else if (action === 'created') {
      setToastMsg({ title: "Successfully Created", desc: "A new auction record was successfully registered." });
    } else if (action === 'purchased') {
      setToastMsg({ title: "Property Purchased", desc: "The auction was successfully converted into a Property!" });
    }
    const timer = setTimeout(() => {
      setToastMsg(null);
      window.history.replaceState(null, '', window.location.pathname);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Highlight + scroll: find the card updated in the last 30s — no URL params needed
  useEffect(() => {
    if (loading || auctions.length === 0) return;
    const RECENT_MS = 30_000;
    const recent = auctions.find(
      a => a.updated_at && Date.now() - new Date(a.updated_at).getTime() < RECENT_MS
    );
    if (!recent) return;
    setRecentCardId(recent.id);
    // Scroll to it
    const timer = setTimeout(() => {
      const el = document.getElementById(`auction-${recent.id}`);
      if (!el) return;
      const container = document.querySelector('.page-content') as HTMLElement | null;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        container.scrollTo({
          top: container.scrollTop + elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2,
          behavior: 'smooth',
        });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 250);
    // Clear highlight after 30s
    const clearTimer = setTimeout(() => setRecentCardId(null), RECENT_MS);
    return () => { clearTimeout(timer); clearTimeout(clearTimer); };
  }, [auctions, loading]);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("auctionsViewMode", mode);
  };

  async function fetchCounties() {
    const { data } = await supabase.from("ls_county").select("id, name, state").order("name");
    setCounties(data || []);
  }

  async function fetchLookups() {
    const [origens, auctionTypes, propertyTypes, priorities] = await Promise.all([
      supabase.from("ls_origem").select("id, name").order("name"),
      supabase.from("ls_auction_type").select("id, name").order("name"),
      supabase.from("ls_property_type").select("id, name").order("name"),
      supabase.from("ls_priority").select("id, name").order("name"),
    ]);

    setLookups({
      origens: origens.data || [],
      auctionTypes: auctionTypes.data || [],
      propertyTypes: propertyTypes.data || [],
      priorities: priorities.data || []
    });
  }

  async function fetchAuctions() {
    setLoading(true);
    try {
      const isFilteringByState = selectedState && selectedState !== "all";
      const selectStr = `
        *,
        ls_county${isFilteringByState ? '!inner' : ''}(name, state),
        ls_status(name),
        ls_priority(name, color),
        ls_auction_type(name),
        ls_property_type(name)
      `;

      let query = supabase
        .from("ls_assets")
        .select(selectStr, { count: "exact" })
        .eq("record_type", "AUCTION");

      if (!showPast) {
        query = query.gte("auction_date", new Date().toISOString().split('T')[0]);
      }

      if (selectedCounty && selectedCounty !== "all") {
        query = query.eq("county_id", selectedCounty);
      }

      if (selectedOrigem && selectedOrigem !== "all") {
        query = query.eq("origem_id", selectedOrigem);
      }

      if (selectedAuctionType && selectedAuctionType !== "all") {
        query = query.eq("auction_type_id", selectedAuctionType);
      }

      if (selectedPropertyType && selectedPropertyType !== "all") {
        query = query.eq("property_type_id", selectedPropertyType);
      }

      if (selectedPriority && selectedPriority !== "all") {
        query = query.eq("priority_id", selectedPriority);
      }

      if (selectedDate) {
        query = query.gte("auction_date", `${selectedDate}T00:00:00`)
                     .lte("auction_date", `${selectedDate}T23:59:59`);
      }

      if (isFilteringByState) {
        query = query.eq("ls_county.state", selectedState);
      }

      // Server-side search for main text fields
      if (searchTerm) {
        const s = `%${searchTerm}%`;
        // Note: Using double quotes around values in .or() helps with special characters
        query = query.or(`parcel_number.ilike."${s}",address.ilike."${s}",case_number.ilike."${s}",coordinates.ilike."${s}"`);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await query
        .order("auction_date", { ascending: true })
        .range(from, to);

      if (error) {
        console.error("Supabase Error Details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      setAuctions(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error("Error fetching auctions:", err.message || err);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = (id: number, parcel: string) => {
    setAuctionToDelete({ id, parcel });
  };

  const confirmDelete = async () => {
    if (!auctionToDelete) return;

    try {
      const { error } = await supabase
        .from("ls_assets")
        .delete()
        .eq("id", auctionToDelete.id);

      if (error) throw error;
      
      setToastMsg({ title: "Deleted", desc: "Auction record successfully removed." });
      setTimeout(() => setToastMsg(null), 3000);
      setAuctionToDelete(null);
      fetchAuctions();
    } catch (err: any) {
      console.error("Delete Error:", err);
      alert("Error deleting: " + err.message);
    }
  };

  const handleExportExcel = async () => {
    try {
      setLoading(true);
      const isFilteringByState = selectedState && selectedState !== "all";
      const selectStr = `
        *,
        ls_county${isFilteringByState ? '!inner' : ''}(name, state),
        ls_status(name),
        ls_priority(name),
        ls_auction_type(name),
        ls_property_type(name),
        ls_origem(name)
      `;

      let query = supabase
        .from("ls_assets")
        .select(selectStr)
        .eq("record_type", "AUCTION");

      if (!showPast) {
        query = query.gte("auction_date", new Date().toISOString().split('T')[0]);
      }
      if (selectedCounty && selectedCounty !== "all") query = query.eq("county_id", selectedCounty);
      if (selectedOrigem && selectedOrigem !== "all") query = query.eq("origem_id", selectedOrigem);
      if (selectedAuctionType && selectedAuctionType !== "all") query = query.eq("auction_type_id", selectedAuctionType);
      if (selectedPropertyType && selectedPropertyType !== "all") query = query.eq("property_type_id", selectedPropertyType);
      if (selectedPriority && selectedPriority !== "all") query = query.eq("priority_id", selectedPriority);
      if (selectedDate) {
        query = query.gte("auction_date", `${selectedDate}T00:00:00`)
                     .lte("auction_date", `${selectedDate}T23:59:59`);
      }
      if (isFilteringByState) {
        query = query.eq("ls_county.state", selectedState);
      }
      if (searchTerm) {
        const s = `%${searchTerm}%`;
        query = query.or(`parcel_number.ilike."${s}",address.ilike."${s}",case_number.ilike."${s}"`);
      }

      const { data, error } = await query.order("auction_date", { ascending: true });

      if (error) throw error;

      // Prepare data for Excel
      const excelData = (data || []).map((item: any) => ({
        "ID": item.id,
        "Parcel Number": item.parcel_number || "",
        "Case Number": item.case_number || "",
        "County": item.ls_county?.name || "",
        "State": item.ls_county?.state || "",
        "Origin": item.ls_origem?.name || "",
        "Auction Date": item.auction_date ? new Date(item.auction_date).toLocaleDateString() : "",
        "Auction Type": item.ls_auction_type?.name || "",
        "Property Type": item.ls_property_type?.name || "",
        "Priority": item.ls_priority?.name || "",
        "Market Value": item.market_value || 0,
        "Open Bid": item.open_bid || 0,
        "Max Bid": item.max_bid || 0,
        "House Price": item.house_price || 0,
        "Address": item.address || "",
        "Zoning": item.zoning || "",
        "Size": item.size || 0,
        "Observations": item.observation || ""
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Auctions");

      // Set column widths
      const wscols = [
        {wch: 10}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 8}, {wch: 15}, 
        {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15},
        {wch: 15}, {wch: 15}, {wch: 30}, {wch: 15}, {wch: 10}, {wch: 40}
      ];
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `auctions_export_${new Date().toISOString().split('T')[0]}.xlsx`);

      setToastMsg({ title: "Export Complete", desc: "Your auction data has been exported to Excel." });
    } catch (err: any) {
      console.error("Export Error:", err);
      alert("Error exporting to Excel: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Date formatting helper
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return "$ --";
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const truncateText = (text: string | null, limit: number) => {
    if (!text) return '';
    return text.length > limit ? text.substring(0, limit) + '...' : text;
  };

  const paginatedAuctions = auctions;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <PermissionGuard resource="page:auctions">
      <div className="auctions-container">

      {auctionToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '400px',
            padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
            animation: 'modalSlideIn 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#ef4444' }}>
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.75rem' }}>
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Delete Auction</h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Parcel: {auctionToDelete.parcel}</p>
              </div>
            </div>
            
            <p style={{ color: '#475569', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
              Are you absolutely sure you want to permanently delete this auction record from the system?
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setAuctionToDelete(null)}
                className="btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="primary-btn"
                style={{ flex: 1, justifyContent: 'center', backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Auctions<span className="dot">.</span></h1>
          <p className="page-subtitle">Manage upcoming auctions and research prospective acquisitions.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {hasPermission(userPermissions, 'action:export_auctions') && (
            <button onClick={handleExportExcel} className="btn-secondary" disabled={loading}>
              <Download className="w-5 h-5" />
              Export
            </button>
          )}
          <Link href="/auctions/new" className="primary-btn" style={{ textDecoration: 'none' }}>
            <Plus className="w-5 h-5" />
            New Auction
          </Link>
        </div>
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
          <div className="totalizer">
            <strong>{totalCount}</strong> items
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

          <button 
            className={`filter-toggle-btn ${showAdvanced ? 'active' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>

          <label className="show-past-toggle" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            backgroundColor: showPast ? 'var(--primary-light)' : 'transparent',
            border: `1px solid ${showPast ? 'var(--primary)' : 'var(--border-subtle)'}`,
            transition: 'all 0.2s'
          }}>
            <input 
              type="checkbox" 
              checked={showPast} 
              onChange={(e) => setShowPast(e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            <span>Show Past</span>
          </label>
        </div>

        {/* Integrated Advanced Filters Panel */}
        <div className={`auc-advanced-filters-panel ${showAdvanced ? 'show' : ''}`}>
          <div className="auc-filters-container">
            <div className="auc-filter-item">
              <label>State</label>
              <select
                className="auc-filter-select"
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedCounty("all");
                }}
              >
                <option value="all">All States</option>
                {uniqueStates.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
              </select>
            </div>

            <div className="auc-filter-item">
              <label>County</label>
              <select
                className="auc-filter-select"
                value={selectedCounty}
                onChange={(e) => setSelectedCounty(e.target.value)}
              >
                <option value="all">All Counties</option>
                {counties
                  .filter(c => selectedState === "all" || c.state === selectedState)
                  .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="auc-filter-item">
              <label>Auction Date</label>
              <input 
                type="date" 
                className="auc-filter-select"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="auc-filter-item">
              <label>Origem</label>
              <select
                className="auc-filter-select"
                value={selectedOrigem}
                onChange={(e) => setSelectedOrigem(e.target.value)}
              >
                <option value="all">All Origens</option>
                {lookups.origens.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div className="auc-filter-item">
              <label>Auction Type</label>
              <select
                className="auc-filter-select"
                value={selectedAuctionType}
                onChange={(e) => setSelectedAuctionType(e.target.value)}
              >
                <option value="all">All Types</option>
                {lookups.auctionTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="auc-filter-item">
              <label>Property Type</label>
              <select
                className="auc-filter-select"
                value={selectedPropertyType}
                onChange={(e) => setSelectedPropertyType(e.target.value)}
              >
                <option value="all">All Prop. Types</option>
                {lookups.propertyTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="auc-filter-item">
              <label>Priority</label>
              <select
                className="auc-filter-select"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
              >
                <option value="all">All Priorities</option>
                {lookups.priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            
            <div className="auc-filter-item auc-actions-item">
              <button className="auc-clear-filters-link" onClick={() => {
                setSelectedState("all");
                setSelectedCounty("all");
                setSelectedDate("");
                setSelectedOrigem("all");
                setSelectedAuctionType("all");
                setSelectedPropertyType("all");
                setSelectedPriority("all");
                setSearchTerm("");
              }}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <Loader2 className="w-8 h-8 animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
          <span>Fetching real-time data from Supabase...</span>
        </div>
      ) : totalCount === 0 ? (
        <div className="empty-state">
          <span>No auctions found matching your criteria.</span>
          <Link href="/auctions/new" style={{ color: 'var(--primary)', fontWeight: 600, display: 'block', marginTop: '1rem' }}>
            Register your first auction now
          </Link>
        </div>
      ) : viewMode === "grid" ? (
        <div className="auctions-grid">
          {paginatedAuctions.map((auction) => {
            const isHighlighted = recentCardId === auction.id;
            return (
              <div
                key={auction.id}
                id={`auction-${auction.id}`}
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
                    {auction.ls_priority?.name && (
                      <span
                        className="card-priority-badge"
                        style={{ backgroundColor: auction.ls_priority.color || '#94a3b8' }}
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
                    <span title={auction.case_number || 'No Case Number'}>
                      {auction.case_number || 'No Case Number'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <Tag className="w-4 h-4 detail-icon" />
                    <span title={`Auction: ${auction.ls_auction_type?.name || 'N/A'}`}>{auction.ls_auction_type?.name || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <Layers className="w-4 h-4 detail-icon" />
                    <span title={`Property: ${auction.ls_property_type?.name || 'N/A'}`}>{auction.ls_property_type?.name || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <Hash className="w-4 h-4 detail-icon" />
                    <span title={auction.parcel_number || 'No Parcel Number'}>
                      {auction.parcel_number || 'No Parcel Number'}
                    </span>
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
                    <span className="fin-label">AUCTION DATE</span>
                    <span className="fin-value-large" style={{ fontSize: '1.05rem' }}>{formatDate(auction.auction_date)}</span>
                  </div>
                  <div className="fin-block align-right">
                    <span className="fin-label">SIZE</span>
                    <span className="fin-value-green" style={{ color: 'var(--primary)', fontSize: '1rem' }}>{auction.size ? `${auction.size} AC/SF` : 'No Size'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <Link href={`/auctions/new?id=${auction.id}`} className="card-details-btn" style={{ textDecoration: 'none', flex: 1 }}>
                    Edit Details
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <button 
                    onClick={() => handleDelete(auction.id, auction.parcel_number)}
                    className="card-details-btn" 
                    style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', width: '40px', padding: 0, justifyContent: 'center' }}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
              <th>Status</th>
              <th>Open Bid</th>
              <th>Mkt Value</th>
              <th>Priority</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedAuctions.map((auction) => {
              const isHighlighted = recentCardId === auction.id;
              return (
                <tr
                  key={auction.id}
                  id={`auction-${auction.id}`}
                  style={isHighlighted ? {
                    backgroundColor: '#eff6ff',
                    boxShadow: 'inset 0 0 15px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.4s ease-out'
                  } : { transition: 'all 0.3s ease-in-out' }}
                >
                  <td>{auction.id}</td>
                  <td style={{ fontWeight: 600 }}>{auction.parcel_number}</td>
                  <td>{auction.ls_county?.name}</td>
                  <td>
                    {formatDate(auction.auction_date)}
                  </td>
                  <td>{auction.ls_auction_type?.name}</td>
                  <td>
                    {auction.ls_status?.name ? (
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 700, 
                        color: 'var(--text-secondary)',
                        backgroundColor: '#f1f5f9',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.4rem',
                        whiteSpace: 'nowrap'
                      }}>
                        {auction.ls_status.name}
                      </span>
                    ) : '--'}
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(auction.open_bid)}</td>
                  <td style={{ fontWeight: 600, color: "#10b981" }}>{formatCurrency(auction.market_value)}</td>
                  <td>
                    {auction.ls_priority?.name ? (
                      <span style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "999px",
                        fontSize: "0.7rem",
                        backgroundColor: auction.ls_priority.color || "#94a3b8",
                        color: "#fff",
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap'
                      }}>
                        {auction.ls_priority.name}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>--</span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: '0.4rem' }}>
                    <Link 
                      href={`/auctions/new?id=${auction.id}`} 
                      className="btn-list-edit"
                    >
                      Edit
                    </Link>
                    <button 
                      onClick={() => handleDelete(auction.id, auction.parcel_number)}
                      className="btn-secondary" 
                      style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem", background: "white", color: "#475569", border: "1px solid #cbd5e1" }}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && totalPages > 1 && (
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
          zIndex: 10000, display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
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
    </PermissionGuard>
  );
}
