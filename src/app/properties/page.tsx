"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Plus, Search, Grid, List, MapPin, Calendar, ExternalLink, 
  ArrowRight, Tag, Loader2, Navigation, ChevronLeft, ChevronRight,
  Filter, Layers, Maximize
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "./properties.css";

export default function PropertiesPage() {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  
  // Filters
  const [selectedState, setSelectedState] = useState("all");
  const [selectedCounty, setSelectedCounty] = useState("all");
  const [selectedPropertyType, setSelectedPropertyType] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [selectedOrigin, setSelectedOrigin] = useState("all");
  const [selectedAuctionType, setSelectedAuctionType] = useState("all");
  const [selectedAcquisitionDate, setSelectedAcquisitionDate] = useState("");
  const [selectedAmenityCategory, setSelectedAmenityCategory] = useState("all");
  const [selectedAmenityType, setSelectedAmenityType] = useState("all");
  const [maxDistance, setMaxDistance] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [counties, setCounties] = useState<any[]>([]);
  const [lookups, setLookups] = useState<{
    propertyTypes: any[],
    priorities: any[],
    origins: any[],
    auctionTypes: any[],
    amenityTypes: any[],
    amenityCategories: any[]
  }>({
    propertyTypes: [],
    priorities: [],
    origins: [],
    auctionTypes: [],
    amenityTypes: [],
    amenityCategories: []
  });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 24;

  const uniqueStates = Array.from(new Set(counties.map(c => c.state).filter(Boolean))).sort();

  useEffect(() => {
    // Load preference from local storage
    const savedMode = localStorage.getItem("propertiesViewMode") as "grid" | "list";
    if (savedMode) setViewMode(savedMode);
    
    fetchCounties();
    fetchLookups();
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [selectedCounty, selectedState, selectedPropertyType, selectedPriority, selectedOrigin, selectedAuctionType, selectedAcquisitionDate, selectedAmenityCategory, selectedAmenityType, maxDistance, maxTime, currentPage, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCounty, selectedState, selectedPropertyType, selectedPriority, selectedOrigin, selectedAuctionType, selectedAcquisitionDate, selectedAmenityCategory, selectedAmenityType, maxDistance, maxTime]);

  async function fetchCounties() {
    const { data } = await supabase.from("ls_county").select("id, name, state").order("name");
    setCounties(data || []);
  }

  async function fetchLookups() {
    const [propertyTypes, priorities, origins, auctionTypes, amenityTypes, amenityCategories] = await Promise.all([
      supabase.from("ls_property_type").select("id, name").order("name"),
      supabase.from("ls_priority").select("id, name").order("name"),
      supabase.from("ls_origem").select("id, name").order("name"),
      supabase.from("ls_auction_type").select("id, name").order("name"),
      supabase.from("ls_amenity_type").select(`
        id, 
        name,
        category_id,
        ls_amenity_category ( name )
      `).order("name"),
      supabase.from("ls_amenity_category").select("id, name").order("name"),
    ]);

    setLookups({
      propertyTypes: propertyTypes.data || [],
      priorities: priorities.data || [],
      origins: origins.data || [],
      auctionTypes: auctionTypes.data || [],
      amenityTypes: amenityTypes.data || [],
      amenityCategories: amenityCategories.data || []
    });
  }

  async function fetchProperties() {
    setLoading(true);
    try {
      let query = supabase
        .from("ls_assets")
        .select(`
          *,
          ls_county(name, state),
          ls_status(name),
          ls_priority(name, color),
          ls_property_type(name)
          ${selectedAmenityType !== 'all' ? ', ls_asset_amenities!inner(*)' : ''}
        `, { count: "exact" })
        .eq("record_type", "PROPERTY");

      if (selectedCounty && selectedCounty !== "all") {
        query = query.eq("county_id", selectedCounty);
      }

      if (selectedPropertyType && selectedPropertyType !== "all") {
        query = query.eq("property_type_id", selectedPropertyType);
      }

      if (selectedPriority && selectedPriority !== "all") {
        query = query.eq("priority_id", selectedPriority);
      }

      if (selectedState && selectedState !== "all") {
        query = query.eq("ls_county.state", selectedState);
      }

      if (selectedAmenityType && selectedAmenityType !== "all") {
        query = query.eq("ls_asset_amenities.amenity_type_id", selectedAmenityType);
        if (maxDistance) query = query.lte("ls_asset_amenities.distance_miles", parseFloat(maxDistance));
        if (maxTime) query = query.lte("ls_asset_amenities.time_minutes", parseInt(maxTime));
      } else if (selectedAmenityCategory && selectedAmenityCategory !== "all") {
        // If category selected but no specific type, filter by all types in that category
        const typesInCategory = lookups.amenityTypes
          .filter(t => t.category_id === selectedAmenityCategory)
          .map(t => t.id);
        
        if (typesInCategory.length > 0) {
          query = query.in("ls_asset_amenities.amenity_type_id", typesInCategory);
          if (maxDistance) query = query.lte("ls_asset_amenities.distance_miles", parseFloat(maxDistance));
          if (maxTime) query = query.lte("ls_asset_amenities.time_minutes", parseInt(maxTime));
        }
      }

      if (selectedOrigin && selectedOrigin !== "all") {
        query = query.eq("origem_id", selectedOrigin);
      }

      if (selectedAuctionType && selectedAuctionType !== "all") {
        query = query.eq("auction_type_id", selectedAuctionType);
      }

      if (selectedAcquisitionDate) {
        query = query.gte("acquisition_date", selectedAcquisitionDate);
      }

      if (searchTerm) {
        // Handle PRP-XXXX format in search
        const prpMatch = searchTerm.match(/PRP-(\d+)/i);
        if (prpMatch) {
          const numericId = parseInt(prpMatch[1]);
          query = query.eq("ref_id", numericId);
        } else {
          // If it's a number, it could be ref_id or part of address/parcel
          const isOnlyNumber = /^\d+$/.test(searchTerm);
          if (isOnlyNumber) {
            query = query.or(`ref_id.eq.${searchTerm},parcel_number.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`);
          } else {
            const s = `%${searchTerm}%`;
            query = query.or(`parcel_number.ilike."${s}",address.ilike."${s}",case_number.ilike."${s}"`);
          }
        }
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await query
        .order("id", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setProperties(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error("Error fetching properties:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("propertiesViewMode", mode);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return '$ --';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const truncateText = (text: string | null, limit: number) => {
    if (!text) return '';
    return text.length > limit ? text.substring(0, limit) + '...' : text;
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const formatPropId = (ref_id: any, id: any) => {
    if (ref_id && !isNaN(Number(ref_id))) {
      return `PRP-${Number(ref_id).toString().padStart(4, '0')}`;
    }
    return `ID: ${id}`;
  };

  return (
    <PermissionGuard resource="page:properties">
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
            placeholder="Search by ID (PRP-0001), Parcel No, Address..." 
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
        </div>

        {/* Advanced Filters Panel */}
        <div className={`prop-advanced-filters-panel ${showAdvanced ? 'show' : ''}`}>
          <div className="prop-filters-container">
            
            {/* ZONE 1: STANDARD FILTERS */}
            <div style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Standard Filters</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
            </div>

            <div className="prop-filter-item">
              <label>State</label>
              <select
                className="prop-filter-select"
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

            <div className="prop-filter-item">
              <label>County</label>
              <select
                className="prop-filter-select"
                value={selectedCounty}
                onChange={(e) => setSelectedCounty(e.target.value)}
              >
                <option value="all">All Counties</option>
                {counties
                  .filter(c => selectedState === "all" || c.state === selectedState)
                  .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="prop-filter-item">
              <label>Property Type</label>
              <select
                className="prop-filter-select"
                value={selectedPropertyType}
                onChange={(e) => setSelectedPropertyType(e.target.value)}
              >
                <option value="all">All Prop. Types</option>
                {lookups.propertyTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="prop-filter-item">
              <label>Priority</label>
              <select
                className="prop-filter-select"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
              >
                <option value="all">All Priorities</option>
                {lookups.priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="prop-filter-item">
              <label>Origin</label>
              <select
                className="prop-filter-select"
                value={selectedOrigin}
                onChange={(e) => setSelectedOrigin(e.target.value)}
              >
                <option value="all">All Origins</option>
                {lookups.origins.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div className="prop-filter-item">
              <label>Auction Type</label>
              <select
                className="prop-filter-select"
                value={selectedAuctionType}
                onChange={(e) => setSelectedAuctionType(e.target.value)}
              >
                <option value="all">All Types</option>
                {lookups.auctionTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="prop-filter-item">
              <label>Acquisition Date (From)</label>
              <input 
                type="date"
                className="prop-filter-select"
                value={selectedAcquisitionDate}
                onChange={(e) => setSelectedAcquisitionDate(e.target.value)}
              />
            </div>

            <div className="prop-filter-item prop-actions-item"></div>

            {/* ZONE 2: AMENITY FILTERS */}
            <div style={{ width: '100%', margin: '0.75rem 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Proximity Analysis</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(16, 185, 129, 0.2)' }}></div>
            </div>

            <div className="prop-filter-item">
              <label>Amenity Category</label>
              <select
                className="prop-filter-select"
                value={selectedAmenityCategory}
                onChange={(e) => {
                  setSelectedAmenityCategory(e.target.value);
                  setSelectedAmenityType("all");
                }}
                style={{ borderColor: selectedAmenityCategory !== "all" ? "#10b981" : "#e2e8f0" }}
              >
                <option value="all">Select Category...</option>
                {lookups.amenityCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="prop-filter-item">
              <label>Specific Amenity</label>
              <select
                className="prop-filter-select"
                value={selectedAmenityType}
                onChange={(e) => setSelectedAmenityType(e.target.value)}
                disabled={selectedAmenityCategory === "all"}
                style={{ 
                  borderColor: selectedAmenityType !== "all" ? "#10b981" : "#e2e8f0",
                  opacity: selectedAmenityCategory === "all" ? 0.6 : 1 
                }}
              >
                <option value="all">Any In Category</option>
                {lookups.amenityTypes
                  .filter(t => t.category_id === selectedAmenityCategory)
                  .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="prop-filter-item">
              <label>Max Distance (mi)</label>
              <input 
                type="number"
                step="0.1"
                placeholder="Ex: 5.0"
                className="prop-filter-select"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
                style={{ borderColor: maxDistance ? "#10b981" : "#e2e8f0" }}
              />
            </div>

            <div className="prop-filter-item">
              <label>Max Time (min)</label>
              <input 
                type="number"
                placeholder="Ex: 10"
                className="prop-filter-select"
                value={maxTime}
                onChange={(e) => setMaxTime(e.target.value)}
                style={{ borderColor: maxTime ? "#10b981" : "#e2e8f0" }}
              />
            </div>
            
            <div className="prop-filter-item prop-actions-item">
              <button className="prop-clear-filters-link" onClick={() => {
                setSelectedState("all");
                setSelectedCounty("all");
                setSelectedPropertyType("all");
                setSelectedPriority("all");
                setSelectedOrigin("all");
                setSelectedAuctionType("all");
                setSelectedAcquisitionDate("");
                setSelectedAmenityCategory("all");
                setSelectedAmenityType("all");
                setMaxDistance("");
                setMaxTime("");
                setSearchTerm("");
              }}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="empty-state">
          <Loader2 className="w-8 h-8 animate-spin" style={{ margin: '0 auto 1rem', color: '#10b981' }} />
          <span>Loading portfolio data...</span>
        </div>
      ) : totalCount === 0 ? (
        <div className="empty-state">
          <span>No properties found matching your criteria.</span>
          <span style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Convert auctions to properties using the Buy option.</span>
        </div>
      ) : viewMode === "grid" ? (
        <div className="properties-grid">
          {properties.map((prop) => (
            <div key={prop.id} className="property-card">
              <div className="card-top">
                <div className="card-top-left">
                  <span className="card-label">{formatPropId(prop.ref_id, prop.id)}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {prop.ls_priority?.name && (
                    <span 
                      className="card-priority-badge"
                      style={{ backgroundColor: prop.ls_priority.color || '#10b981' }}
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
                  <span>{formatDate(prop.acquisition_date || prop.auction_date)}</span>
                </div>
                <div className="detail-item">
                  <Tag className="w-4 h-4 detail-icon" />
                  <span title={`Status: ${prop.ls_status?.name || 'N/A'}`}>{prop.ls_status?.name || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <Layers className="w-4 h-4 detail-icon" />
                  <span title={`Property: ${prop.ls_property_type?.name || 'N/A'}`}>{prop.ls_property_type?.name || 'N/A'}</span>
                </div>
                <div className="detail-item">
                   <Maximize className="w-4 h-4 detail-icon" />
                   <span>{prop.size ? `${prop.size} AC/SF` : 'No Size'}</span>
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
                  <span className="fin-label">CASE NUMBER</span>
                  <span className="fin-value-large" style={{ fontSize: '1.05rem' }}>{prop.case_number || 'N/A'}</span>
                </div>
                <div className="fin-block align-right">
                  <span className="fin-label">PARCEL NUMBER</span>
                  <span className="fin-value-green" style={{ color: '#10b981', fontSize: '1rem' }}>{prop.parcel_number || 'N/A'}</span>
                </div>
              </div>

              <Link href={`/properties/${prop.id}`} className="card-details-btn" style={{ textDecoration: 'none' }}>
                Open Property
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
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
              <th>Mkt Value</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((prop) => (
              <tr key={prop.id}>
                <td>{formatPropId(prop.ref_id, prop.id)}</td>
                <td style={{ fontWeight: 600 }}>{prop.parcel_number}</td>
                <td>{prop.ls_county?.name}</td>
                <td>{formatDate(prop.acquisition_date || prop.auction_date)}</td>
                <td>{prop.ls_property_type?.name || '--'}</td>
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
      </div>
    </PermissionGuard>
  );
}
