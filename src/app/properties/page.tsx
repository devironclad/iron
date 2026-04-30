"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Grid, List, MapPin, Calendar, ExternalLink, ArrowRight, Tag, Loader2, Navigation, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./properties.css";

export default function PropertiesPage() {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Filters
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedCounty, setSelectedCounty] = useState<string>("all");

  useEffect(() => {
    // Load preference from local storage
    const savedMode = localStorage.getItem("propertiesViewMode") as "grid" | "list";
    if (savedMode) setViewMode(savedMode);
  }, []);

  useEffect(() => {
    async function fetchProperties() {
      setLoading(true);
      const { data, error } = await supabase
        .from('ls_assets')
        .select(`
          *,
          ls_county ( id, name, state ),
          ls_status ( name ),
          ls_priority ( name, color ),
          ls_property_type ( name )
        `)
        .eq('record_type', 'PROPERTY')
        .order('id', { ascending: false });

      if (error) {
        console.error("Error fetching properties:", error);
      } else {
        setProperties(data || []);
      }
      setLoading(false);
    }
    
    fetchProperties();
  }, []);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("propertiesViewMode", mode);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const formatCurrency = (val: number) => {
    if (!val) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const truncateText = (text: string | null, limit: number) => {
    if (!text) return '';
    return text.length > limit ? text.substring(0, limit) + '...' : text;
  };

  // Derive unique states and counties for filters based on properties
  const allCountiesWithState = properties
    .filter(p => p.ls_county)
    .map(p => ({
      id: p.ls_county.id,
      name: p.ls_county.name,
      state: p.ls_county.state
    }));

  const uniqueStates = Array.from(new Set(allCountiesWithState.map(c => c.state).filter(Boolean))).sort();
  const countiesMap = new Map();
  allCountiesWithState.forEach(c => {
    if (!countiesMap.has(c.id)) countiesMap.set(c.id, c);
  });
  const counties = Array.from(countiesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Filtering
  const filteredProperties = properties.filter((prop) => {
    const matchesSearch = 
      (prop.parcel_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (prop.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (prop.case_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (prop.ls_county?.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesState = selectedState === "all" || prop.ls_county?.state === selectedState;
    const matchesCounty = selectedCounty === "all" || prop.ls_county?.id === parseInt(selectedCounty);

    return matchesSearch && matchesState && matchesCounty;
  });

  // Pagination
  const totalPages = Math.ceil(filteredProperties.length / itemsPerPage);
  const paginatedProperties = filteredProperties.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="properties-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">My Properties<span className="dot">.</span></h1>
          <p className="page-subtitle">Manage acquired assets, financials, and detailed characteristics.</p>
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
          <div className="totalizer" style={{ 
            fontSize: '0.875rem', 
            color: '#64748b', 
            fontWeight: 500,
            paddingRight: '1rem',
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center'
          }}>
            <strong style={{ color: '#0f172a', marginRight: '0.35rem', fontSize: '1.25rem', lineHeight: 1 }}>{filteredProperties.length}</strong> items
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
          <Loader2 className="w-8 h-8 animate-spin" style={{ margin: '0 auto 1rem', color: '#10b981' }} />
          <span>Loading portfolio data...</span>
        </div>
      ) : filteredProperties.length === 0 ? (
        <div className="empty-state">
          <span>No properties found in your portfolio.</span>
          <span style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Convert auctions to properties using the Buy option.</span>
        </div>
      ) : viewMode === "grid" ? (
        <div className="properties-grid">
          {paginatedProperties.map((prop) => {
            return (
              <div key={prop.id} className="property-card">
                
                <div className="card-top">
                  <div className="card-top-left" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="card-label">ID: {prop.id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <span className="card-status">{(prop.ls_status?.name || 'PORTFOLIO').toUpperCase()}</span>
                    {prop.ls_priority?.name && (
                      <span 
                        style={{ 
                          backgroundColor: prop.ls_priority.color || '#10b981',
                          color: '#fff',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
                      >
                        {prop.ls_priority.name}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="card-parcel">{prop.ls_county?.name || 'Unknown County'} {prop.ls_county?.state && `(${prop.ls_county.state})`}</h3>

                <div className="card-details-grid">
                  <div className="detail-item">
                    <MapPin className="w-4 h-4 detail-icon flex-shrink-0" />
                    <span title={prop.address || 'Address not provided'}>
                      {truncateText(prop.address || 'Address not provided', 30)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <Navigation className="w-4 h-4 detail-icon flex-shrink-0" />
                    <span title={prop.coordinates || 'No coordinates'}>
                      {truncateText(prop.coordinates || 'No coordinates', 30)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <Calendar className="w-4 h-4 detail-icon" />
                    <span>Acquired: {formatDate(prop.acquisition_date || prop.auction_date)}</span>
                  </div>
                  <div className="detail-item">
                    <Tag className="w-4 h-4 detail-icon" />
                    <span>{prop.ls_property_type?.name || 'Unspecified Type'}</span>
                  </div>
                  <div className="detail-item link-item">
                    <ExternalLink className="w-4 h-4 detail-icon link-icon" />
                    {prop.link_regrid ? (
                      <a href={prop.link_regrid} target="_blank" rel="noopener noreferrer" className="regrid-link">Regrid</a>
                    ) : (
                      <span className="text-muted">No Link</span>
                    )}
                  </div>
                </div>

                <div className="card-financials">
                  <div className="fin-block">
                    <span className="fin-label">PARCEL NO</span>
                    <span className="fin-value-large" style={{ fontSize: '1.125rem' }}>{prop.parcel_number || 'N/A'}</span>
                  </div>
                  <div className="fin-block align-right">
                    <span className="fin-label">MKT VALUE</span>
                    <span className="fin-value-green">{formatCurrency(prop.market_value)}</span>
                  </div>
                </div>

                {/* Will point to the new multi-tab property page */}
                <Link href={`/properties/${prop.id}`} className="card-details-btn" style={{ textDecoration: 'none' }}>
                  Open Property
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="properties-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Parcel #</th>
              <th>County</th>
              <th>Acquisition</th>
              <th>Type</th>
              <th>Status</th>
              <th>Mkt Value</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProperties.map((prop) => (
              <tr key={prop.id} style={{ transition: 'all 0.2s' }}>
                <td>{prop.id}</td>
                <td style={{ fontWeight: 600 }}>{prop.parcel_number}</td>
                <td>{prop.ls_county?.name}</td>
                <td>{formatDate(prop.acquisition_date || prop.auction_date)}</td>
                <td>{prop.ls_property_type?.name || '--'}</td>
                <td>
                  <span style={{ 
                    padding: "0.25rem 0.5rem", 
                    borderRadius: "999px", 
                    fontSize: "0.75rem",
                    backgroundColor: "#ecfdf5",
                    color: "#059669",
                    fontWeight: 600
                  }}>
                    {(prop.ls_status?.name || 'PORTFOLIO').toUpperCase()}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{formatCurrency(prop.market_value)}</td>
                <td>
                  <Link href={`/properties/${prop.id}`} className="primary-btn" style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem", textDecoration: 'none' }}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination Controls */}
      {!loading && filteredProperties.length > 0 && totalPages > 1 && (
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
    </div>
  );
}
