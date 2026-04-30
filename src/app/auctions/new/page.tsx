"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, X, Info, Gavel, MapPin, FileText, Key, DollarSign, Link as LinkIcon, Loader2, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./form.css";

const SECTIONS = [
  { id: "general", label: "General & Identity", icon: Info },
  { id: "auction", label: "Auction Data", icon: Gavel },
  { id: "location", label: "Location & Addressing", icon: MapPin },
  { id: "legal", label: "Legal & Environmental", icon: FileText },
  { id: "access", label: "Access & Construction", icon: Key },
  { id: "financials", label: "Appraisals & Financials", icon: DollarSign },
  { id: "links", label: "Observations & Links", icon: LinkIcon },
];

export default function NewAuctionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditing = !!editId;

  const [activeSection, setActiveSection] = useState("general");
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [showBuyConfirm, setShowBuyConfirm] = useState(false);
  const [lookups, setLookups] = useState<Record<string, any[]>>({});
  
  // Form State
  const [formData, setFormData] = useState<any>({
    id: "",
    ref_id: "",
    origem_id: "",
    status_id: "",
    priority_id: "",
    property_type_id: "",
    auction_type_id: "",
    auction_model_id: "",
    auction_date: "",
    open_bid: "",
    max_bid: "",
    max_bid_internal: "",
    county_id: "",
    parcel_number: "",
    address: "",
    coordinates: "",
    corner_lot: false,
    case_number: "",
    zoning: "",
    size: "",
    legal_description: "",
    fema_id: "",
    wetlands_id: "",
    gismap_id: "",
    prop_access_id: "",
    road_access_id: "",
    ref_construction_id: "",
    inperson_visit: false,
    market_value: "",
    annual_tax: "",
    sqft_price_reference: "",
    appraisal_min: "",
    appraisal_avg: "",
    appraisal_max: "",
    county_appraisal: "",
    online_appraisal: "",
    debit_id: "",
    observation: "",
    surrounds: "",
    link_regrid: "",
    link_sources: "",
    link_house_sources: "",
    link_video: ""
  });

  // Fetch All Data (Lookups + Edit Data)
  useEffect(() => {
    async function loadAllData() {
      setFetchingData(true);
      
      // 1. Fetch Lookups
      const tables = [
        "ls_origem", "ls_status", "ls_priority", "ls_county", 
        "ls_auction_type", "ls_auction_model", "ls_property_type", 
        "ls_fema", "ls_wetlands", "ls_debit", "ls_gismap", 
        "ls_prop_access", "ls_road_access", "ls_ref_construction"
      ];
      
      const results: Record<string, any[]> = {};
      const lookupPromises = tables.map(table => {
        const columns = table === "ls_county" ? "id, name, state" : "id, name";
        return supabase.from(table).select(columns).order("name").then(({ data }) => {
          results[table] = data || [];
        });
      });

      // 2. Fetch Auction Data if Editing
      const fetchAuctionData = async () => {
        if (!editId) return;
        const { data, error } = await supabase.from("ls_assets").select("*").eq("id", editId).single();
        if (data && !error) {
          const formattedData = { ...data };
          if (formattedData.auction_date) {
            formattedData.auction_date = new Date(formattedData.auction_date).toISOString().slice(0, 16);
          }
          Object.keys(formattedData).forEach(key => {
            if (formattedData[key] === null) formattedData[key] = "";
          });
          setFormData((prev: any) => ({ ...prev, ...formattedData }));
        }
      };

      // Run all requests concurrently
      await Promise.all([...lookupPromises, fetchAuctionData()]);
      
      setLookups(results);
      setFetchingData(false);
    }
    
    loadAllData();
  }, [editId]);

  // Simple Scroll Spy logic
  useEffect(() => {
    const handleScroll = () => {
      const sections = SECTIONS.map(s => document.getElementById(s.id));
      const container = document.querySelector(".form-content-area");
      const scrollPosition = container?.scrollTop || 0;
      
      let currentSection = SECTIONS[0].id;
      sections.forEach(section => {
        if (section) {
          if (section.offsetTop - 100 <= scrollPosition) {
            currentSection = section.id;
          }
        }
      });
      setActiveSection(currentSection);
    };

    const container = document.querySelector(".form-content-area");
    container?.addEventListener("scroll", handleScroll);
    return () => container?.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    const container = document.querySelector(".form-content-area");
    if (element && container) {
      container.scrollTo({
        top: element.offsetTop - 20,
        behavior: "smooth"
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Clean numbers and dates
      const payload: any = { ...formData };
      
      // Remove DB-managed fields that shouldn't be manually updated
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.updated_by;
      
      // Convert numeric fields
      const numericFields = [
        'ref_id', 'open_bid', 'max_bid', 'max_bid_internal', 'size', 
        'market_value', 'annual_tax', 'sqft_price_reference', 
        'appraisal_min', 'appraisal_avg', 'appraisal_max', 
        'county_appraisal', 'online_appraisal'
      ];
      
      numericFields.forEach(field => {
        if (payload[field]) payload[field] = parseFloat(payload[field]);
        else payload[field] = null;
      });

      // Handle Empty UUIDs (FKs)
      const uuidFields = [
        'origem_id', 'status_id', 'priority_id', 'county_id', 
        'auction_type_id', 'auction_model_id', 'property_type_id', 
        'fema_id', 'wetlands_id', 'debit_id', 'gismap_id', 
        'prop_access_id', 'road_access_id', 'ref_construction_id'
      ];
      
      uuidFields.forEach(field => {
        if (!payload[field]) payload[field] = null;
      });

      // Handle Dates
      if (!payload.auction_date) payload.auction_date = null;
      if (payload.acquisition_date === "") payload.acquisition_date = null;

      if (isEditing) {
        const { error } = await supabase.from("ls_assets").update(payload).eq("id", editId);
        if (error) throw error;
        router.push(`/auctions?highlight=${editId}&action=updated`);
      } else {
        const { data, error } = await supabase.from("ls_assets").insert([payload]).select("id").single();
        if (error) throw error;
        router.push(data?.id ? `/auctions?highlight=${data.id}&action=created` : "/auctions");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error saving auction: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyProperty = async () => {
    setShowBuyConfirm(false);
    setLoading(true);
    try {
      const payload: any = { ...formData, record_type: 'PROPERTY' };
      
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.updated_by;
      
      // Handle Dates
      if (!payload.auction_date) payload.auction_date = null;
      // Set current date/time for acquisition
      payload.acquisition_date = new Date().toISOString();

      // Handle Empty UUIDs (FKs)
      const uuidFields = [
        'origem_id', 'status_id', 'priority_id', 'county_id', 
        'auction_type_id', 'auction_model_id', 'property_type_id', 
        'fema_id', 'wetlands_id', 'debit_id', 'gismap_id', 
        'prop_access_id', 'road_access_id', 'ref_construction_id'
      ];
      uuidFields.forEach(field => {
        if (!payload[field]) payload[field] = null;
      });

      
      const numericFields = [
        'ref_id', 'open_bid', 'max_bid', 'max_bid_internal', 'size', 
        'market_value', 'annual_tax', 'sqft_price_reference', 
        'appraisal_min', 'appraisal_avg', 'appraisal_max', 
        'county_appraisal', 'online_appraisal'
      ];
      for (const field of numericFields) {
        if (payload[field] === "" || payload[field] === undefined) {
          payload[field] = null;
        } else if (payload[field] !== null) {
          payload[field] = Number(payload[field]);
        }
      }
      
      const { error } = await supabase.from("ls_assets").update(payload).eq("id", editId);
      if (error) throw error;
      
      router.push(`/auctions?highlight=${editId}&action=purchased`);
    } catch (err: any) {
      console.error(err);
      alert("Error converting auction: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isBuyPriority = lookups.ls_priority?.find(p => p.id?.toString() === formData.priority_id?.toString())?.name.trim().toLowerCase() === 'acquired property';

  if (fetchingData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh', color: '#64748b' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
        <span style={{ fontWeight: 600, fontSize: '1.1rem', color: '#0f172a' }}>Loading details...</span>
        <span style={{ fontSize: '0.85rem' }}>Please wait while we fetch the records</span>
      </div>
    );
  }

  return (
    <>
      {showBuyConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '1rem', width: '100%', maxWidth: '400px',
            padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex', flexDirection: 'column', gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981' }}>
              <ShoppingCart className="w-6 h-6" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Confirm Purchase</h2>
            </div>
            <p style={{ color: '#475569', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to purchase this asset? It will be converted into a Property in the system and removed from the Auctions list.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button 
                onClick={() => setShowBuyConfirm(false)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleBuyProperty}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#10b981', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <ShoppingCart className="w-4 h-4" />
                Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="smart-form-container">
      
      {/* Scroll Spy Sidebar - Compact Icon Version */}
      <div className="form-sidebar">
        <nav className="spy-nav">
          {SECTIONS.map(sec => {
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                className={`spy-link ${activeSection === sec.id ? "active" : ""}`}
                title={sec.label}
              >
                <Icon className="spy-icon" />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Form Content Area */}
      <div className="form-content-area">
        <div className="page-header" style={{ marginBottom: "1rem" }}>
          <div className="page-header-text">
            <h1 className="page-title">{isEditing ? "Edit Auction" : "Register Auction"}<span className="dot">.</span></h1>
            <p className="page-subtitle">{isEditing ? "Update the information for this asset." : "Fill out the detailed information for the new property asset."}</p>
          </div>
        </div>

      <div className="form-content">
        
        {/* SECTION 1: IDENTITY */}
        <section id="identity" className="form-section">
          <div className="section-header-row">
            <Info className="section-icon" />
            <h2 className="section-title">Identity & Status</h2>
          </div>
          <p className="section-desc">Core identifiers and operational status.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">System ID (Locked)</label>
              <input type="text" className="input-field locked" value={formData.id || formData.ref_id || ''} readOnly placeholder="Auto-generated" />
            </div>
            <div className="input-group">
              <label className="input-label">Parcel Number</label>
              <input type="text" name="parcel_number" value={formData.parcel_number} onChange={handleChange} className="input-field" placeholder="12-34-56-..." />
            </div>
            <div className="input-group">
              <label className="input-label">Case Number</label>
              <input type="text" name="case_number" value={formData.case_number} onChange={handleChange} className="input-field" placeholder="CASE-2026-..." />
            </div>
            
            <div className="input-group">
              <label className="input-label">Origem</label>
              <select name="origem_id" value={formData.origem_id} onChange={handleChange} className="input-field">
                <option value="">Select Origem...</option>
                {lookups.ls_origem?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Status</label>
              <select name="status_id" value={formData.status_id} onChange={handleChange} className="input-field">
                <option value="">Select Status...</option>
                {lookups.ls_status?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Priority</label>
              <select name="priority_id" value={formData.priority_id} onChange={handleChange} className="input-field">
                <option value="">Select Priority...</option>
                {lookups.ls_priority?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 2: AUCTION DYNAMICS */}
        <section id="dynamics" className="form-section">
          <div className="section-header-row">
            <Gavel className="section-icon" />
            <h2 className="section-title">Auction Dynamics</h2>
          </div>
          <p className="section-desc">Dates, types and bidding thresholds.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">Auction Date</label>
              <input type="datetime-local" name="auction_date" value={formData.auction_date ? new Date(formData.auction_date).toISOString().slice(0,16) : ''} onChange={handleChange} className="input-field" />
            </div>
            <div className="input-group">
              <label className="input-label">Acquisition Date</label>
              <input type="datetime-local" name="acquisition_date" value={formData.acquisition_date ? new Date(formData.acquisition_date).toISOString().slice(0,16) : ''} onChange={handleChange} className="input-field" />
            </div>
            <div className="input-group">
              <label className="input-label">Auction Type</label>
              <select name="auction_type_id" value={formData.auction_type_id} onChange={handleChange} className="input-field">
                <option value="">Select Type...</option>
                {lookups.ls_auction_type?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            
            <div className="input-group">
              <label className="input-label">Auction Model</label>
              <select name="auction_model_id" value={formData.auction_model_id} onChange={handleChange} className="input-field">
                <option value="">Select Model...</option>
                {lookups.ls_auction_model?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Open Bid ($)</label>
              <input type="number" name="open_bid" value={formData.open_bid} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">Max Bid ($)</label>
              <input type="number" name="max_bid" value={formData.max_bid} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">Internal Max Bid ($)</label>
              <input type="number" name="max_bid_internal" value={formData.max_bid_internal} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
          </div>
        </section>

        {/* SECTION 3: LOCATION */}
        <section id="location" className="form-section">
          <div className="section-header-row">
            <MapPin className="section-icon" />
            <h2 className="section-title">Location & Specs</h2>
          </div>
          <p className="section-desc">Physical address and legal descriptions.</p>
          
          <div className="form-grid col-2">
            <div className="input-group">
              <label className="input-label">Address</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange} className="input-field" placeholder="Full street address" />
            </div>
            <div className="input-group">
              <label className="input-label">County</label>
              <select name="county_id" value={formData.county_id} onChange={handleChange} className="input-field">
                <option value="">Select County...</option>
                {lookups.ls_county?.map(item => <option key={item.id} value={item.id}>{item.name} ({item.state})</option>)}
              </select>
            </div>
          </div>
          
          <div className="form-grid col-3" style={{ marginTop: "1.5rem" }}>
            <div className="input-group">
              <label className="input-label">Coordinates</label>
              <input type="text" name="coordinates" value={formData.coordinates} onChange={handleChange} className="input-field" placeholder="Lat, Lng" />
            </div>
            <div className="input-group">
              <label className="input-label">Zoning</label>
              <input type="text" name="zoning" value={formData.zoning} onChange={handleChange} className="input-field" placeholder="R-1, C-2..." />
            </div>
            <div className="input-group">
              <label className="input-label">Size (Acres/SqFt)</label>
              <input type="number" name="size" value={formData.size} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
          </div>
          
          <div className="input-group" style={{ marginTop: "1.5rem" }}>
            <label className="input-label">Legal Description</label>
            <textarea name="legal_description" value={formData.legal_description} onChange={handleChange} className="input-field" rows={2} placeholder="Legal description of the parcel..."></textarea>
          </div>
        </section>

        {/* SECTION 4: ATTRIBUTES */}
        <section id="attributes" className="form-section">
          <div className="section-header-row">
            <FileText className="section-icon" />
            <h2 className="section-title">Property Attributes</h2>
          </div>
          <p className="section-desc">Land types, FEMA and mapping references.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">Property Type</label>
              <select name="property_type_id" value={formData.property_type_id} onChange={handleChange} className="input-field">
                <option value="">Select Type...</option>
                {lookups.ls_property_type?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">FEMA Zone</label>
              <select name="fema_id" value={formData.fema_id} onChange={handleChange} className="input-field">
                <option value="">Select FEMA...</option>
                {lookups.ls_fema?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Wetlands</label>
              <select name="wetlands_id" value={formData.wetlands_id} onChange={handleChange} className="input-field">
                <option value="">Select Wetlands...</option>
                {lookups.ls_wetlands?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">GIS Map Reference</label>
              <select name="gismap_id" value={formData.gismap_id} onChange={handleChange} className="input-field">
                <option value="">Select GIS Map...</option>
                {lookups.ls_gismap?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 5: ACCESS */}
        <section id="access" className="form-section">
          <div className="section-header-row">
            <Key className="section-icon" />
            <h2 className="section-title">Access & Construction</h2>
          </div>
          <p className="section-desc">Road access and on-site visits.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">Property Access</label>
              <select name="prop_access_id" value={formData.prop_access_id} onChange={handleChange} className="input-field">
                <option value="">Select Access...</option>
                {lookups.ls_property_access?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Road Access</label>
              <select name="road_access_id" value={formData.road_access_id} onChange={handleChange} className="input-field">
                <option value="">Select Road...</option>
                {lookups.ls_road_access?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Ref Construction</label>
              <select name="ref_construction_id" value={formData.ref_construction_id} onChange={handleChange} className="input-field">
                <option value="">Select Ref...</option>
                {lookups.ls_ref_construction?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
          
          <div className="checkbox-group" style={{ marginTop: "1rem" }}>
            <input type="checkbox" id="inperson" name="inperson_visit" checked={formData.inperson_visit} onChange={handleChange as any} className="checkbox-input" />
            <label htmlFor="inperson" className="checkbox-label">In-person Visit Performed?</label>
          </div>
        </section>

        {/* SECTION 6: FINANCIALS */}
        <section id="financials" className="form-section">
          <div className="section-header-row">
            <DollarSign className="section-icon" />
            <h2 className="section-title">Appraisals & Financials</h2>
          </div>
          <p className="section-desc">Valuation numbers, tax data, and references.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">Market Value ($)</label>
              <input type="number" name="market_value" value={formData.market_value} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">Annual Tax ($)</label>
              <input type="number" name="annual_tax" value={formData.annual_tax} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">SqFt Price Reference ($)</label>
              <input type="number" name="sqft_price_reference" value={formData.sqft_price_reference} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            
            <div className="input-group">
              <label className="input-label">Appraisal Min ($)</label>
              <input type="number" name="appraisal_min" value={formData.appraisal_min} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">Appraisal Avg ($)</label>
              <input type="number" name="appraisal_avg" value={formData.appraisal_avg} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">Appraisal Max ($)</label>
              <input type="number" name="appraisal_max" value={formData.appraisal_max} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            
            <div className="input-group">
              <label className="input-label">County Appraisal ($)</label>
              <input type="number" name="county_appraisal" value={formData.county_appraisal} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">Online Appraisal ($)</label>
              <input type="number" name="online_appraisal" value={formData.online_appraisal} onChange={handleChange} className="input-field" placeholder="0.00" />
            </div>
            <div className="input-group">
              <label className="input-label">Debit Status</label>
              <select name="debit_id" value={formData.debit_id} onChange={handleChange} className="input-field">
                <option value="">Select Debit...</option>
                {lookups.ls_debit?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 7: LINKS */}
        <section id="links" className="form-section">
          <div className="section-header-row">
            <LinkIcon className="section-icon" />
            <h2 className="section-title">Observations & Links</h2>
          </div>
          <p className="section-desc">Notes, context and external URLs.</p>
          
          <div className="form-grid col-1">
            <div className="input-group">
              <label className="input-label">Observations</label>
              <textarea name="observation" value={formData.observation} onChange={handleChange} className="input-field" rows={3} placeholder="General notes about the property..."></textarea>
            </div>
            <div className="input-group">
              <label className="input-label">Surrounds</label>
              <textarea name="surrounds" value={formData.surrounds} onChange={handleChange} className="input-field" rows={2} placeholder="Notes on neighborhood..."></textarea>
            </div>
          </div>

          <div className="form-grid col-2" style={{ marginTop: "1.5rem" }}>
            <div className="input-group">
              <label className="input-label">Regrid Link</label>
              <input type="url" name="link_regrid" value={formData.link_regrid} onChange={handleChange} className="input-field" placeholder="https://regrid.com/..." />
            </div>
            <div className="input-group">
              <label className="input-label">Other Sources Link</label>
              <input type="url" name="link_sources" value={formData.link_sources} onChange={handleChange} className="input-field" placeholder="https://..." />
            </div>
            <div className="input-group">
              <label className="input-label">House Sources Link</label>
              <input type="url" name="link_house_sources" value={formData.link_house_sources} onChange={handleChange} className="input-field" placeholder="https://zillow.com/..." />
            </div>
            <div className="input-group">
              <label className="input-label">Video Link</label>
              <input type="url" name="link_video" value={formData.link_video} onChange={handleChange} className="input-field" placeholder="https://youtube.com/..." />
            </div>
          </div>
        </section>

      </div>
      </div>

      {/* Floating Action Bar */}
      <div className="form-actions-bar">
        <button className="btn-secondary" onClick={() => router.push('/auctions')}>
          <X className="w-4 h-4" />
          Cancel
        </button>
        {isEditing && isBuyPriority && (
          <button className="primary-btn" onClick={() => setShowBuyConfirm(true)} disabled={loading || fetchingData} style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}>
            <ShoppingCart className="w-4 h-4" />
            Buy
          </button>
        )}
        <button className="primary-btn" onClick={handleSave} disabled={loading || fetchingData}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {loading ? "Saving..." : (isEditing ? "Save Changes" : "Save Auction")}
        </button>
      </div>
    </div>
    </>
  );
}
