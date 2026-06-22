"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import NextImage from "next/image";
import { formatPropId } from "@/lib/utils";
import {
  Plus, Search, Grid, List, MapPin, Calendar, ExternalLink,
  ArrowRight, Tag, Loader2, Navigation, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Filter, Layers, Maximize, Hash, CheckCircle2, Building2, UserCheck,
  Coins, DollarSign, TrendingUp, ImageOff, Gavel, Briefcase, ClipboardList
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getPreviewPartner } from "@/lib/impersonation";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "./properties.css";

export default function PropertiesPage() {
  const searchParams = useSearchParams();
  const source = searchParams.get('source') as 'ironclad' | 'broker' | 'partners' | null;
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || "");
  const [totalCount, setTotalCount] = useState(0);
  const [recentCardId, setRecentCardId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<{ title: string, desc: string } | null>(null);

  // Filters — initialized from URL so they survive navigation
  const [selectedState, setSelectedState] = useState(searchParams.get('state') || "all");
  const [selectedCounty, setSelectedCounty] = useState(searchParams.get('county') || "all");
  const [selectedPropertyType, setSelectedPropertyType] = useState(searchParams.get('propertyType') || "all");
  const [selectedPriority, setSelectedPriority] = useState(searchParams.get('priority') || "all");
  const [selectedOrigin, setSelectedOrigin] = useState(searchParams.get('origin') || "all");
  const [selectedAuctionType, setSelectedAuctionType] = useState(searchParams.get('auctionType') || "all");
  const [selectedAcquisitionDate, setSelectedAcquisitionDate] = useState(searchParams.get('acquisitionDate') || "");
  const [selectedAmenityCategory, setSelectedAmenityCategory] = useState(searchParams.get('amenityCategory') || "all");
  const [selectedAmenityType, setSelectedAmenityType] = useState(searchParams.get('amenityType') || "all");
  const [maxDistance, setMaxDistance] = useState(searchParams.get('maxDistance') || "");
  const [maxTime, setMaxTime] = useState(searchParams.get('maxTime') || "");
  const [selectedInvestor, setSelectedInvestor] = useState(searchParams.get('investor') || "all");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [counties, setCounties] = useState<any[]>([]);
  const [lookups, setLookups] = useState<{
    propertyTypes: any[],
    priorities: any[],
    origins: any[],
    auctionTypes: any[],
    amenityTypes: any[],
    amenityCategories: any[],
    investors: any[]
  }>({
    propertyTypes: [],
    priorities: [],
    origins: [],
    auctionTypes: [],
    amenityTypes: [],
    amenityCategories: [],
    investors: []
  });

  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);
  const [openRequestsMap, setOpenRequestsMap] = useState<Record<number, number>>({});

  // Refs to prevent effects from firing on first mount
  const filterSyncMounted  = useRef(false);
  const filterChangeMounted = useRef(false);
  const ITEMS_PER_PAGE = 24;

  const uniqueStates = Array.from(new Set(counties.map(c => c.state).filter(Boolean))).sort();

  useEffect(() => {
    const savedMode = localStorage.getItem("propertiesViewMode") as "grid" | "list";
    if (savedMode) setViewMode(savedMode);

    const preview = getPreviewPartner();
    if (preview) {
      setCurrentUserId(preview.id);
    } else {
      supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    }
    fetchCounties();
    fetchLookups();
  }, []);

  // Sync filters → URL (skip on first mount to preserve URL params from returnTo)
  useEffect(() => {
    if (!filterSyncMounted.current) { filterSyncMounted.current = true; return; }
    const p = new URLSearchParams();
    if (source)                                    p.set('source', source);
    if (searchTerm)                                p.set('q', searchTerm);
    if (selectedState !== 'all')                   p.set('state', selectedState);
    if (selectedCounty !== 'all')                  p.set('county', selectedCounty);
    if (selectedPropertyType !== 'all')            p.set('propertyType', selectedPropertyType);
    if (selectedPriority !== 'all')                p.set('priority', selectedPriority);
    if (selectedOrigin !== 'all')                  p.set('origin', selectedOrigin);
    if (selectedAuctionType !== 'all')             p.set('auctionType', selectedAuctionType);
    if (selectedAcquisitionDate)                   p.set('acquisitionDate', selectedAcquisitionDate);
    if (selectedAmenityCategory !== 'all')         p.set('amenityCategory', selectedAmenityCategory);
    if (selectedAmenityType !== 'all')             p.set('amenityType', selectedAmenityType);
    if (maxDistance)                               p.set('maxDistance', maxDistance);
    if (maxTime)                                   p.set('maxTime', maxTime);
    if (selectedInvestor !== 'all')                p.set('investor', selectedInvestor);
    p.set('page', String(currentPage));
    router.replace(`?${p.toString()}`, { scroll: false });
  }, [source, searchTerm, selectedState, selectedCounty, selectedPropertyType, selectedPriority,
      selectedOrigin, selectedAuctionType, selectedAcquisitionDate, selectedAmenityCategory,
      selectedAmenityType, maxDistance, maxTime, selectedInvestor, currentPage]);

  // Toast — reads window.location.search on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;
    if (action === 'updated') {
      setToastMsg({ title: "Successfully Updated", desc: "The property record was successfully updated." });
    } else if (action === 'created') {
      setToastMsg({ title: "Successfully Created", desc: "A new property record was successfully registered." });
    }
    const timer = setTimeout(() => {
      setToastMsg(null);
      const clean = new URLSearchParams(window.location.search);
      clean.delete('action');
      clean.delete('highlight');
      const qs = clean.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Highlight: if page is already in URL trust it; otherwise locate via DB count
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const h = params.get('highlight');
    if (!h) return;
    if (params.get('page')) {
      setHighlightId(Number(h));
    } else {
      locateHighlight(Number(h));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the target record is present in the loaded page, trigger scroll
  useEffect(() => {
    if (!highlightId) return;
    if (properties.some((p: any) => p.id === highlightId)) {
      setRecentCardId(highlightId);
      setHighlightId(null);
    }
  }, [highlightId, properties]);

  // Auto-clear the highlight after 3s
  useEffect(() => {
    if (!recentCardId) return;
    const t = setTimeout(() => setRecentCardId(null), 3000);
    return () => clearTimeout(t);
  }, [recentCardId]);

  // Scroll to card when recentCardId is set. The heavy Property cards (charts,
  // KPIs) shift layout after first paint, so we retry to find the element and
  // then do a corrective second pass once the layout has settled.
  useEffect(() => {
    if (!recentCardId || loading) return;
    let attempts = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const doScroll = () => {
      const el = document.getElementById(`property-${recentCardId}`);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    };
    const tryScroll = () => {
      if (doScroll()) {
        // Corrective pass after layout (images/charts) settles
        timers.push(setTimeout(doScroll, 500));
        return;
      }
      if (attempts++ < 20) timers.push(setTimeout(tryScroll, 100));
    };
    timers.push(setTimeout(tryScroll, 150));
    return () => timers.forEach(clearTimeout);
  }, [recentCardId, loading]);

  useEffect(() => {
    if (source === 'partners' && currentUserId === null) return;
    fetchProperties();
  }, [source, currentUserId, selectedCounty, selectedState, selectedPropertyType, selectedPriority, selectedOrigin, selectedAuctionType, selectedAcquisitionDate, selectedAmenityCategory, selectedAmenityType, maxDistance, maxTime, selectedInvestor, currentPage, searchTerm, counties]);

  useEffect(() => {
    if (!filterChangeMounted.current) { filterChangeMounted.current = true; return; }
    setCurrentPage(1);
  }, [source, searchTerm, selectedCounty, selectedState, selectedPropertyType, selectedPriority, selectedOrigin, selectedAuctionType, selectedAcquisitionDate, selectedAmenityCategory, selectedAmenityType, maxDistance, maxTime]);

  async function fetchCounties() {
    const { data } = await supabase.from("ls_county").select("id, name, state").order("name");
    setCounties(data || []);
  }

  async function fetchLookups() {
    const [propertyTypes, priorities, origins, auctionTypes, amenityTypes, amenityCategories, investors] = await Promise.all([
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
      supabase.from("ls_users_metadata").select("id, full_name").eq("user_type", "partner").order("full_name"),
    ]);

    setLookups({
      propertyTypes: propertyTypes.data || [],
      priorities: priorities.data || [],
      origins: origins.data || [],
      auctionTypes: auctionTypes.data || [],
      amenityTypes: amenityTypes.data || [],
      amenityCategories: amenityCategories.data || [],
      investors: investors.data || []
    });
  }

  // Find which paginated page contains the target property (sort: id desc)
  // and navigate there so the card is rendered.
  async function locateHighlight(targetId: number) {
    if (!targetId || isNaN(targetId)) return;
    const { count } = await supabase
      .from("ls_assets")
      .select("id", { count: "exact", head: true })
      .eq("record_type", "PROPERTY")
      .gt("id", targetId);
    setCurrentPage(Math.floor((count || 0) / ITEMS_PER_PAGE) + 1);
    setHighlightId(targetId);
  }

  async function fetchProperties() {
    // Wait for counties to load before filtering by state
    if (selectedState !== 'all' && counties.length === 0) return;
    setLoading(true);
    try {
      let query = supabase
        .from("ls_assets")
        .select(`
          *,
          ls_county(name, state),
          ls_status(name),
          ls_priority(name, color),
          ls_property_type(name),
          ls_origem(name),
          ls_auction_type(name),
          owner_partner:ls_users_metadata!owner_partner_id(full_name)
          ${selectedAmenityType !== 'all' ? ', ls_asset_amenities!inner(*)' : ''}
        `, { count: "exact" })
        .eq("record_type", "PROPERTY");

      if (source === 'ironclad') {
        query = query.or('owner_type.is.null,owner_type.neq.partner');
      } else if (source === 'broker') {
        query = query.eq('owner_type', 'partner');
      } else if (source === 'partners') {
        query = query.eq('owner_type', 'partner').eq('owner_partner_id', currentUserId!);
      }

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
        const countyIdsForState = counties
          .filter(c => c.state === selectedState)
          .map(c => c.id);
        if (countyIdsForState.length === 0) {
          // No counties found for this state — return nothing
          setProperties([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        query = query.in("county_id", countyIdsForState);
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

      if (selectedInvestor && selectedInvestor !== "all") {
        query = query.eq("owner_partner_id", selectedInvestor);
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
            query = query.or(`ref_id.eq.${searchTerm},parcel_number.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%,case_number.ilike.%${searchTerm}%`);
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

      if (error) {
        if (error.message?.includes("range not satisfiable") || (error as any).code === "PGRST103") {
          setCurrentPage(1);
          return;
        }
        throw error;
      }
      setProperties(data || []);
      setTotalCount(count || 0);
      fetchOpenRequests((data || []).map((p: any) => p.id));
    } catch (err) {
      console.error("Error fetching properties:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOpenRequests(ids: number[]) {
    if (ids.length === 0) return;
    const { data } = await supabase
      .from('ls_requests')
      .select('asset_id, status:ls_request_status!status_id(is_closed)')
      .in('asset_id', ids);
    if (!data) return;
    const map: Record<number, number> = {};
    for (const req of data) {
      if (!(req.status as any)?.is_closed) {
        map[req.asset_id] = (map[req.asset_id] || 0) + 1;
      }
    }
    setOpenRequestsMap(map);
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


  const pageTitle = source === 'ironclad'
    ? 'Ironclad Properties'
    : source === 'broker'
    ? 'Investor Properties'
    : source === 'partners'
    ? 'Partners Properties'
    : 'My Properties';

  const pageSubtitle = source === 'broker'
    ? 'Properties managed by partner Investors.'
    : source === 'partners'
    ? 'Properties managed in partnership.'
    : 'Manage acquired assets, financials, and detailed characteristics.';

  return (
    <PermissionGuard anyOf={["page:properties:ironclad", "page:properties:broker", "page:properties:partners"]}>
      <div className="properties-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">{pageTitle}<span className="dot">.</span></h1>
          <p className="page-subtitle">{pageSubtitle}</p>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-wrapper">
          <Search className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by ID (PRP-0001), Parcel No, Case, Address..."
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

            <div className="prop-filter-item">
              <label>Investor</label>
              <select
                className="prop-filter-select"
                value={selectedInvestor}
                onChange={(e) => setSelectedInvestor(e.target.value)}
              >
                <option value="all">All Investors</option>
                {lookups.investors.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
              </select>
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
                setSelectedInvestor("all");
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
          {properties.map((prop) => {
            const isHighlighted = recentCardId === prop.id;
            return (
              <div
                key={prop.id}
                id={`property-${prop.id}`}
                className="property-card"
                style={isHighlighted ? {
                  boxShadow: '0 0 25px 8px rgba(59, 130, 246, 0.4), 0 0 0 2px #3b82f6',
                  transform: 'translateY(-4px)',
                  transition: 'all 0.4s ease-out',
                  position: 'relative',
                  zIndex: 10
                } : { transition: 'all 0.3s ease-in-out' }}
              >
              {/* ── LAYOUT: foto lateral + conteúdo ── */}
              <div style={{ display: 'flex', gap: '1.25rem', margin: '-1.25rem', padding: '0' }}>

                {/* Foto lateral */}
                <div style={{ width: '160px', flexShrink: 0, overflow: 'hidden', borderRadius: '0.75rem 0 0 0.75rem', backgroundColor: '#f1f5f9', alignSelf: 'stretch', position: 'relative', minHeight: '180px' }}>
                  {prop.photo_url ? (
                    <NextImage
                      src={prop.photo_url}
                      alt="Property photo"
                      fill
                      quality={90}
                      style={{ objectFit: 'cover' }}
                      sizes="320px"
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: '#94a3b8' }}>
                      <ImageOff className="w-8 h-8" />
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, textAlign: 'center', padding: '0 0.5rem' }}>No photo</span>
                    </div>
                  )}
                </div>

                {/* Conteúdo do card */}
                <div style={{ flex: 1, padding: '1.25rem 1.25rem 1.25rem 0' }}>

              {/* ── HEADER ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{
                    fontSize: '0.78rem', fontWeight: 800, color: '#0f172a',
                    backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0',
                    padding: '0.2rem 0.55rem', borderRadius: '6px', letterSpacing: '0.04em'
                  }}>
                    {formatPropId(prop.ref_id, prop.id)}
                  </span>
                  {prop.ls_origem?.name && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>•</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>{prop.ls_origem.name}</span>
                    </>
                  )}
                  {prop.ls_property_type?.name && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>•</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>{prop.ls_property_type.name}</span>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {openRequestsMap[prop.id] > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#ca181a', color: '#ffffff', border: '1px solid #ca181a', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <ClipboardList className="w-3 h-3" />
                      {openRequestsMap[prop.id]} {openRequestsMap[prop.id] === 1 ? 'Request' : 'Requests'}
                    </span>
                  )}
                  {prop.owner_type === 'partner' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <UserCheck className="w-3 h-3" />
                      {prop.owner_partner?.full_name || 'Partner'}
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <Building2 className="w-3 h-3" />
                      IronClad
                    </span>
                  )}
                </div>
              </div>

              {/* ── MAIN BODY: 3 colunas ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: '1.75rem', alignItems: 'stretch' }}>

                {/* COLUNA 1 — Detalhes da propriedade */}
                <div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ca181a', lineHeight: 1.2 }}>
                      {prop.owner_type === 'partner'
                        ? (prop.owner_partner?.full_name || 'Partner')
                        : 'IronClad'}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 400, color: '#475569', marginTop: '0.1rem' }}>
                      {prop.ls_county?.name || 'Unknown County'}{prop.ls_county?.state && `, ${prop.ls_county.state}`}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
                    <div className="detail-item">
                      <MapPin className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                      <span style={{ fontSize: '0.78rem' }} title={prop.address || '--'}>{truncateText(prop.address || '--', 28)}</span>
                    </div>
                    <div className="detail-item">
                      <Hash className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                      <span style={{ fontSize: '0.78rem' }} title={prop.parcel_number || '--'}>{truncateText(prop.parcel_number || '--', 28)}</span>
                    </div>
                    <div className="detail-item">
                      <Calendar className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                      <span style={{ fontSize: '0.78rem' }}>{formatDate(prop.acquisition_date || prop.auction_date)}</span>
                    </div>
                    <div className="detail-item">
                      <Gavel className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                      <span style={{ fontSize: '0.78rem' }}>{prop.ls_auction_type?.name || 'N/A'}</span>
                    </div>
                    <div className="detail-item">
                      <Maximize className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                      <span style={{ fontSize: '0.78rem' }}>{prop.size ? `${prop.size} AC` : 'No Size'}</span>
                    </div>
                    <div className="detail-item">
                      <Briefcase className="w-3.5 h-3.5 detail-icon flex-shrink-0" />
                      <span style={{ fontSize: '0.78rem' }} title={prop.case_number || '--'}>{prop.case_number || '--'}</span>
                    </div>
                  </div>
                </div>

                {/* COLUNA 2 — KPI Metrics */}
                <div style={{ borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', justifyContent: 'flex-start' }}>

                  {/* Investment */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Coins className="w-4 h-4" style={{ color: '#d97706' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Investment</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                        {source === 'partners'
                          ? (prop.investment_total_inv != null ? formatCurrency(prop.investment_total_inv) : '—')
                          : (prop.investment_total != null ? formatCurrency(prop.investment_total) : '—')}
                      </div>
                    </div>
                  </div>

                  {/* Sales Price */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <DollarSign className="w-4 h-4" style={{ color: '#059669' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sales Price</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                        {prop.sale_price != null ? formatCurrency(prop.sale_price) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* ROI */}
                  {(() => {
                    const inv = source === 'partners' ? prop.investment_total_inv : prop.investment_total;
                    const sale = prop.sale_price;
                    const roi = inv != null && sale != null && inv > 0 ? (((sale - inv) / inv) * 100) : null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <TrendingUp className="w-4 h-4" style={{ color: '#7c3aed' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ROI</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: roi != null && roi >= 0 ? '#7c3aed' : '#dc2626', lineHeight: 1.2 }}>
                            {roi != null ? `${roi.toFixed(1)}%` : '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* COLUNA 3 — Bar Chart + Ação */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

                  {/* Chart */}
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                      Profit Projection
                    </div>
                    {(() => {
                      const base = (source === 'partners' ? prop.investment_total_inv : prop.investment_total) || 0;
                      const isAR = prop.ls_county?.state === 'AR';
                      const tiers = source === 'partners'
                        ? (isAR ? [
                          { label: '+100%', roi: 1.0, fill: 25,  color: '#6ee7b7', textColor: '#065f46' },
                          { label: '+200%', roi: 2.0, fill: 50,  color: '#34d399', textColor: '#065f46' },
                          { label: '+300%', roi: 3.0, fill: 75,  color: '#10b981', textColor: '#ffffff' },
                          { label: '+400%', roi: 4.0, fill: 100, color: '#059669', textColor: '#ffffff' },
                        ] : [
                          { label: '+40%',  roi: 0.4, fill: 40,  color: '#6ee7b7', textColor: '#065f46' },
                          { label: '+60%',  roi: 0.6, fill: 60,  color: '#34d399', textColor: '#065f46' },
                          { label: '+80%',  roi: 0.8, fill: 80,  color: '#10b981', textColor: '#ffffff' },
                          { label: '+100%', roi: 1.0, fill: 100, color: '#059669', textColor: '#ffffff' },
                        ])
                        : (isAR ? [
                          { label: '+400%',  roi: 4.0,  fill: 25,  color: '#6ee7b7', textColor: '#065f46' },
                          { label: '+600%',  roi: 6.0,  fill: 50,  color: '#34d399', textColor: '#065f46' },
                          { label: '+800%',  roi: 8.0,  fill: 75,  color: '#10b981', textColor: '#ffffff' },
                          { label: '+1000%', roi: 10.0, fill: 100, color: '#059669', textColor: '#ffffff' },
                        ] : [
                          { label: '+40%',  roi: 0.4, fill: 40,  color: '#6ee7b7', textColor: '#065f46' },
                          { label: '+60%',  roi: 0.6, fill: 60,  color: '#34d399', textColor: '#065f46' },
                          { label: '+80%',  roi: 0.8, fill: 80,  color: '#10b981', textColor: '#ffffff' },
                          { label: '+100%', roi: 1.0, fill: 100, color: '#059669', textColor: '#ffffff' },
                        ]);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {tiers.map(t => {
                            const profit = base * t.roi;
                            return (
                              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '32px', fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>{t.label}</div>
                                <div style={{ flex: 1, height: '18px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                  <div style={{
                                    width: `${t.fill}%`,
                                    height: '100%',
                                    backgroundColor: t.color,
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: '6px',
                                    transition: 'width 0.4s ease'
                                  }}>
                                    {base > 0 && (
                                      <span style={{ fontSize: '0.58rem', fontWeight: 700, color: t.textColor, whiteSpace: 'nowrap' }}>
                                        {formatCurrency(base + profit)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {base > 0 && (
                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '2px', paddingLeft: '40px', fontWeight: 500 }}>
                              Base ({source === 'partners' ? 'Partner Investment' : 'Total Investment'}): {formatCurrency(base)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Botão */}
                  <Link href={(() => { const cleanParams = new URLSearchParams(window.location.search); cleanParams.delete('action'); cleanParams.delete('highlight'); cleanParams.set('page', String(currentPage)); const returnTo = encodeURIComponent(`/properties?${cleanParams.toString()}`); return `/properties/${prop.id}?returnTo=${returnTo}${source ? `&source=${source}` : ''}`; })()} className="card-details-btn" style={{ textDecoration: 'none', marginTop: '1rem' }}>
                    Open Property
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

                </div>
              </div>
            </div>
          ); })}
        </div>
      ) : (
        <table className="properties-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Parcel #</th>
              <th>County</th>
              <th>Owner</th>
              <th>Acquisition</th>
              <th>Type</th>
              <th>Mkt Value</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((prop) => {
              const isHighlighted = recentCardId === prop.id;
              return (
                <tr 
                  key={prop.id}
                  style={isHighlighted ? {
                    backgroundColor: '#eff6ff',
                    boxShadow: 'inset 0 0 15px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.4s ease-out'
                  } : { transition: 'all 0.3s ease-in-out' }}
                >
                <td>{formatPropId(prop.ref_id, prop.id)}</td>
                <td style={{ fontWeight: 600 }}>{prop.parcel_number}</td>
                <td>{prop.ls_county?.name}</td>
                <td>
                  {prop.owner_type === 'partner' ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      backgroundColor: '#fffbeb', color: '#b45309',
                      border: '1px solid #fde68a',
                      padding: '0.2rem 0.55rem', borderRadius: '999px',
                      fontSize: '0.7rem', fontWeight: 700
                    }}>
                      <UserCheck className="w-3 h-3" />
                      {prop.owner_partner?.full_name || 'Partner'}
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      backgroundColor: '#eff6ff', color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      padding: '0.2rem 0.55rem', borderRadius: '999px',
                      fontSize: '0.7rem', fontWeight: 700
                    }}>
                      <Building2 className="w-3 h-3" />
                      IronClad
                    </span>
                  )}
                </td>
                <td>{formatDate(prop.acquisition_date || prop.auction_date)}</td>
                <td>{prop.ls_property_type?.name || '--'}</td>
                <td style={{ fontWeight: 600 }}>{formatCurrency(prop.market_value)}</td>
                <td>
                  <Link href={(() => { const cleanParams = new URLSearchParams(window.location.search); cleanParams.delete('action'); cleanParams.delete('highlight'); cleanParams.set('page', String(currentPage)); const returnTo = encodeURIComponent(`/properties?${cleanParams.toString()}`); return `/properties/${prop.id}?returnTo=${returnTo}${source ? `&source=${source}` : ''}`; })()} className="primary-btn" style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem", textDecoration: 'none' }}>Open</Link>
                </td>
                </tr>
              );
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
            onClick={() => setCurrentPage(1)}
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
            <ChevronsLeft className="w-5 h-5" />
          </button>

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

          <button
            onClick={() => setCurrentPage(totalPages)}
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
            <ChevronsRight className="w-5 h-5" />
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
