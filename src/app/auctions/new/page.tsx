"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, X, Info, Gavel, MapPin, FileText, Key, DollarSign, Link as LinkIcon, Loader2, ShoppingCart, AlertCircle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./form.css";

const SECTIONS = [
  { id: "identity", label: "Identity & Status", icon: Gavel },
  { id: "location", label: "Location & Specs", icon: MapPin },
  { id: "attributes", label: "Property Attributes", icon: FileText },
  { id: "financials", label: "Appraisals & Financials", icon: DollarSign },
  { id: "access", label: "Access & Construction", icon: Key },
  { id: "links", label: "Observations & Links", icon: LinkIcon },
];

export default function NewAuctionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditing = !!editId;

  const [activeSection, setActiveSection] = useState("identity");
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [showBuyConfirm, setShowBuyConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [lookups, setLookups] = useState<Record<string, any[]>>({});
  
  // Form State
  const [formData, setFormData] = useState<any>({
    id: "",
    ref_id: "",
    record_type: "AUCTION",
    origem_id: "",
    priority_id: "",
    property_type_id: "",
    auction_type_id: "",
    auction_model_id: "",
    auction_date: "",
    open_bid: "",
    min_bid: "",
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
    link_video: "",
    link_earth: "",
    house_price: "",
    upset_date: ""
  });

  const [formSelectedState, setFormSelectedState] = useState("");

  // Fetch All Data (Lookups + Edit Data)
  useEffect(() => {
    async function loadAllData() {
      setFetchingData(true);
      
      const tables = [
        "ls_origem", "ls_priority", "ls_county", 
        "ls_auction_type", "ls_auction_model", "ls_property_type", 
        "ls_fema", "ls_wetlands", "ls_debit", "ls_gismap", 
        "ls_property_access", "ls_road_access", "ls_ref_construction"
      ];
      
      const results: Record<string, any[]> = {};
      const lookupPromises = tables.map(table => {
        const columns = table === "ls_county" ? "id, name, state" : "id, name";
        return supabase.from(table).select(columns).order("name").then(({ data }) => {
          results[table] = data || [];
        });
      });

      const fetchAuctionData = async () => {
        if (!editId) return;
        const { data, error } = await supabase.from("ls_assets").select("*").eq("id", editId).single();
        if (data && !error) {
          const formattedData = { ...data };
          if (formattedData.auction_date) {
            formattedData.auction_date = new Date(formattedData.auction_date).toISOString().slice(0, 16);
          }
          if (formattedData.upset_date) {
            formattedData.upset_date = new Date(formattedData.upset_date).toISOString().slice(0, 10);
          }
          Object.keys(formattedData).forEach(key => {
            if (formattedData[key] === null) formattedData[key] = "";
          });
          setFormData((prev: any) => ({ ...prev, ...formattedData }));
          
          if (formattedData.county_id && results.ls_county) {
            const county = results.ls_county.find((c: any) => c.id.toString() === formattedData.county_id.toString());
            if (county) setFormSelectedState(county.state);
          }
        }
      };

      await Promise.all([...lookupPromises, fetchAuctionData()]);
      
      setLookups(results);
      setFetchingData(false);
    }
    
    loadAllData();
  }, [editId]);

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

  // Automatic Calculations for Min Bid, Max Bid and Market Value
  useEffect(() => {
    const appraisalMinStr = formData.appraisal_min;
    const appraisalAvgStr = formData.appraisal_avg;
    const housePriceStr = formData.house_price;
    
    let calculatedMinBid = formData.min_bid;
    if (appraisalMinStr !== "" && appraisalMinStr !== null) {
      calculatedMinBid = parseFloat(appraisalMinStr) * 0.5;
    } else {
      calculatedMinBid = "";
    }

    let calculatedMaxBid = formData.max_bid;
    if (appraisalAvgStr !== "" && appraisalAvgStr !== null) {
      calculatedMaxBid = parseFloat(appraisalAvgStr) * 0.5;
    } else {
      calculatedMaxBid = "";
    }
    
    let calculatedMarketValue = formData.market_value;
    if (housePriceStr !== "" && housePriceStr !== null) {
      const housePrice = parseFloat(housePriceStr);
      if (['FL', 'GA'].includes(formSelectedState)) {
        calculatedMarketValue = housePrice * 0.25;
      } else {
        calculatedMarketValue = housePrice * 0.20;
      }
    } else {
      calculatedMarketValue = "";
    }

    if (
      formData.min_bid !== calculatedMinBid ||
      formData.max_bid !== calculatedMaxBid || 
      formData.market_value !== calculatedMarketValue
    ) {
      setFormData((prev: any) => ({
        ...prev,
        min_bid: calculatedMinBid,
        max_bid: calculatedMaxBid,
        market_value: calculatedMarketValue
      }));
    }
  }, [formData.appraisal_min, formData.appraisal_avg, formData.house_price, formSelectedState, formData.min_bid, formData.max_bid, formData.market_value]);

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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateVal = e.target.value;
    const currentTime = formData.auction_date ? new Date(formData.auction_date).toTimeString().slice(0, 5) : "09:00";
    setFormData((prev: any) => ({
      ...prev,
      auction_date: dateVal ? `${dateVal}T${currentTime}` : ""
    }));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const timeVal = e.target.value;
    const currentDate = formData.auction_date ? new Date(formData.auction_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    setFormData((prev: any) => ({
      ...prev,
      auction_date: `${currentDate}T${timeVal}`
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleSave = async () => {
    // 1. Validation for mandatory fields
    const requiredFields = [
      { key: 'auction_date', label: 'Auction Date' },
      { key: 'origem_id', label: 'Origin' },
      { key: 'parcel_number', label: 'Parcel Number' },
      { key: 'case_number', label: 'Case Number' },
      { key: 'auction_type_id', label: 'Auction Type' },
      { key: 'auction_model_id', label: 'Auction Model' },
      { key: 'county_id', label: 'County' },
      { key: 'property_type_id', label: 'Property Type' },
      { key: 'legal_description', label: 'Legal Description' },
      { key: 'zoning', label: 'Zoning' },
      { key: 'size', label: 'Size' },
      { key: 'coordinates', label: 'Coordinates' },
      { key: 'address', label: 'Address' },
      { key: 'annual_tax', label: 'Annual Tax' },
      { key: 'link_regrid', label: 'Regrid Link' },
      { key: 'fema_id', label: 'FEMA Zone' },
      { key: 'wetlands_id', label: 'Wetlands' },
      { key: 'debit_id', label: 'Debit Status' },
      { key: 'gismap_id', label: 'GIS Map Reference' },
      { key: 'open_bid', label: 'Open Bid' }
    ];

    const missing = requiredFields.filter(f => !formData[f.key]);
    
    if (missing.length > 0) {
      setValidationErrors(missing.map(m => m.label));
      
      const firstMissing = missing[0].key;
      if (['auction_date', 'origem_id', 'parcel_number', 'case_number', 'auction_type_id', 'auction_model_id'].includes(firstMissing)) {
        scrollToSection('identity');
      } else if (['county_id', 'legal_description', 'zoning', 'size', 'coordinates', 'address'].includes(firstMissing)) {
        scrollToSection('location');
      } else if (['property_type_id', 'fema_id', 'wetlands_id', 'debit_id', 'gismap_id'].includes(firstMissing)) {
        scrollToSection('attributes');
      } else if (['annual_tax', 'open_bid'].includes(firstMissing)) {
        scrollToSection('financials');
      } else if (['link_regrid'].includes(firstMissing)) {
        scrollToSection('links');
      }
      
      return;
    }

    setValidationErrors([]);

    setLoading(true);
    try {
      const payload: any = { ...formData };
      
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.updated_by;
      
      const numericFields = [
        'ref_id', 'open_bid', 'min_bid', 'max_bid', 'max_bid_internal', 'size', 
        'market_value', 'annual_tax', 'sqft_price_reference', 
        'appraisal_min', 'appraisal_avg', 'appraisal_max', 
        'county_appraisal', 'online_appraisal', 'house_price'
      ];
      
      numericFields.forEach(field => {
        if (payload[field] !== "" && payload[field] !== null && payload[field] !== undefined) {
          payload[field] = parseFloat(payload[field]);
        } else {
          payload[field] = null;
        }
      });

      const uuidFields = [
        'origem_id', 'priority_id', 'county_id', 
        'auction_type_id', 'auction_model_id', 'property_type_id', 
        'fema_id', 'wetlands_id', 'debit_id', 'gismap_id', 
        'prop_access_id', 'road_access_id', 'ref_construction_id'
      ];
      
      uuidFields.forEach(field => {
        if (!payload[field]) payload[field] = null;
      });

      if (!payload.auction_date) payload.auction_date = null;
      if (payload.upset_date === "") payload.upset_date = null;
      if (payload.acquisition_date === "") payload.acquisition_date = null;

      // Final Cleanup: Convert any remaining empty strings to null (essential for UUIDs)
      Object.keys(payload).forEach(key => {
        if (payload[key] === "") {
          payload[key] = null;
        }
      });

      if (isEditing) {
        if (!editId) throw new Error("No asset ID found for updating.");
        const { error } = await supabase.from("ls_assets").update(payload).eq("id", editId);
        if (error) {
          console.error("Supabase Update Error:", error);
          throw error;
        }
        router.push(`/auctions?highlight=${editId}&action=updated`);
      } else {
        const { data, error } = await supabase.from("ls_assets").insert([payload]).select("id").single();
        if (error) {
          console.error("Supabase Insert Error:", error);
          throw error;
        }
        router.push(data?.id ? `/auctions?highlight=${data.id}&action=created` : "/auctions");
      }
    } catch (err: any) {
      console.error("Full Error Object:", err);
      const msg = err.message || err.details || "Unknown error";
      alert("Error saving auction: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!editId) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!editId) return;
    setShowDeleteConfirm(false);
    setLoading(true);
    try {
      const { error } = await supabase
        .from("ls_assets")
        .delete()
        .eq("id", editId);

      if (error) throw error;
      
      router.push("/auctions?action=deleted");
    } catch (err: any) {
      console.error("Delete Error:", err);
      alert("Error deleting auction: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyProperty = async () => {
    setShowBuyConfirm(false);
    setLoading(true);
    try {
      const { data: existingRefs } = await supabase
        .from("ls_assets")
        .select("ref_id")
        .eq("record_type", "PROPERTY");
      
      let nextNumber = 1;
      if (existingRefs && existingRefs.length > 0) {
        const numbers = existingRefs
          .map(r => r.ref_id)
          .filter(n => n !== null && !isNaN(Number(n)))
          .map(n => Number(n));
        
        if (numbers.length > 0) {
          nextNumber = Math.max(...numbers) + 1;
        }
      }

      const payload: any = { ...formData, record_type: 'PROPERTY', ref_id: nextNumber };
      
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.updated_by;
      
      if (!payload.auction_date) payload.auction_date = null;
      payload.acquisition_date = new Date().toISOString();

      const uuidFields = [
        'origem_id', 'priority_id', 'county_id', 
        'auction_type_id', 'auction_model_id', 'property_type_id', 
        'fema_id', 'wetlands_id', 'debit_id', 'gismap_id', 
        'prop_access_id', 'road_access_id', 'ref_construction_id'
      ];
      uuidFields.forEach(field => {
        if (!payload[field]) payload[field] = null;
      });

      const numericFields = [
        'open_bid', 'min_bid', 'max_bid', 'max_bid_internal', 'size', 
        'market_value', 'annual_tax', 'sqft_price_reference', 
        'appraisal_min', 'appraisal_avg', 'appraisal_max', 
        'county_appraisal', 'online_appraisal', 'house_price'
      ];
      for (const field of numericFields) {
        if (payload[field] === "" || payload[field] === undefined) {
          payload[field] = null;
        } else if (payload[field] !== null) {
          payload[field] = Number(payload[field]);
        }
      }
      // 5. Final Cleanup: Convert any remaining empty strings to null 
      // (Essential for UUID and Date columns that were null but became "" in state)
      Object.keys(payload).forEach(key => {
        if (payload[key] === "") {
          payload[key] = null;
        }
      });
      
      if (!editId) throw new Error("No asset ID found in URL.");

      const { error } = await supabase
        .from("ls_assets")
        .update(payload)
        .eq("id", editId);
        
      if (error) {
        console.error("Supabase Update Error:", error);
        throw error;
      }
      
      router.push(`/auctions?highlight=${editId}&action=purchased`);
    } catch (err: any) {
      console.error("Full Error Object:", err);
      const msg = err.message || err.details || "Unknown error";
      alert("Error converting auction: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const isBuyPriority = lookups.ls_priority?.find(p => p.id?.toString() === formData.priority_id?.toString())?.name.trim().toLowerCase() === 'acquired property';

  const formatPropId = (ref_id: any) => {
    if (ref_id && !isNaN(Number(ref_id))) {
      return `PRP-${Number(ref_id).toString().padStart(4, '0')}`;
    }
    return "";
  };

  const isProperty = formData.record_type === 'PROPERTY';
  const businessId = isProperty ? formatPropId(formData.ref_id) : "";

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

      {showDeleteConfirm && (
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
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>This action cannot be undone.</p>
              </div>
            </div>
            
            <p style={{ color: '#475569', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
              Are you absolutely sure you want to permanently delete this auction record from the system?
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setShowDeleteConfirm(false)}
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

      {validationErrors.length > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '450px',
            padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
            animation: 'modalSlideIn 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#ef4444' }}>
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.75rem' }}>
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Attention Needed</h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Some mandatory fields are missing.</p>
              </div>
            </div>
            
            <div style={{ 
              backgroundColor: '#f8fafc', borderRadius: '0.75rem', padding: '1rem',
              maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0'
            }}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {validationErrors.map(err => (
                  <li key={err} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#475569', fontSize: '0.9rem' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                    {err}
                  </li>
                ))}
              </ul>
            </div>

            <button 
              onClick={() => setValidationErrors([])}
              className="primary-btn"
              style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
            >
              Understand and Correct
            </button>
          </div>
        </div>
      )}

      <div className="smart-form-container">
      
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

      <div className="form-content-area">
        <div className="page-header" style={{ marginBottom: "1rem" }}>
          <div className="page-header-text">
            <h1 className="page-title">
              {isEditing ? (isProperty ? `Edit Property ${businessId}` : "Edit Auction") : "Register Auction"}
              <span className="dot">.</span>
            </h1>
            <p className="page-subtitle">{isEditing ? "Update the information for this asset." : "Fill out the detailed information for the new property asset."}</p>
          </div>
        </div>

      <div className="form-content">
        
        <section id="identity" className="form-section">
          <div className="section-header-row">
            <Gavel className="section-icon" />
            <h2 className="section-title">Identity & Status</h2>
          </div>
          <p className="section-desc">Core identifiers and operational status.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">System ID (Locked)</label>
              <input type="text" className="input-field locked" value={formData.id || ''} readOnly disabled placeholder="Auto-generated" />
            </div>
            <div className="input-group">
              <label className="input-label">Auction Date <span className="required-star">*</span></label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="date" 
                  value={formData.auction_date ? new Date(formData.auction_date).toISOString().slice(0, 10) : ''} 
                  onChange={handleDateChange} 
                  className="input-field" 
                  style={{ flex: 2 }}
                />
                <select 
                  value={formData.auction_date ? new Date(formData.auction_date).toTimeString().slice(0, 5) : '09:00'} 
                  onChange={handleTimeChange} 
                  className="input-field"
                  style={{ flex: 1 }}
                >
                  {Array.from({ length: 24 * 4 }).map((_, i) => {
                    const h = Math.floor(i / 4).toString().padStart(2, '0');
                    const m = ((i % 4) * 15).toString().padStart(2, '0');
                    const t = `${h}:${m}`;
                    return <option key={t} value={t}>{t}</option>;
                  })}
                </select>
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Upset Date</label>
              <input type="date" name="upset_date" value={formData.upset_date} onChange={handleChange} className="input-field" />
            </div>
            <div className="input-group">
              <label className="input-label">Origin <span className="required-star">*</span></label>
              <select name="origem_id" value={formData.origem_id} onChange={handleChange} className="input-field">
                <option value="">Select Origin...</option>
                {lookups.ls_origem?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            
            <div className="input-group">
              <label className="input-label">Parcel Number <span className="required-star">*</span></label>
              <input type="text" name="parcel_number" value={formData.parcel_number} onChange={handleChange} className="input-field" placeholder="12-34-56-..." />
            </div>
            <div className="input-group">
              <label className="input-label">Case <span className="required-star">*</span></label>
              <input type="text" name="case_number" value={formData.case_number} onChange={handleChange} className="input-field" placeholder="CASE-2026-..." />
            </div>
            <div className="input-group">
              <label className="input-label">Priority</label>
              <select name="priority_id" value={formData.priority_id} onChange={handleChange} className="input-field">
                <option value="">Select Priority...</option>
                {lookups.ls_priority?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Auction Type <span className="required-star">*</span></label>
              <select name="auction_type_id" value={formData.auction_type_id} onChange={handleChange} className="input-field">
                <option value="">Select Type...</option>
                {lookups.ls_auction_type?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Auction Model <span className="required-star">*</span></label>
              <select name="auction_model_id" value={formData.auction_model_id} onChange={handleChange} className="input-field">
                <option value="">Select Model...</option>
                {lookups.ls_auction_model?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section id="location" className="form-section">
          <div className="section-header-row">
            <MapPin className="section-icon" />
            <h2 className="section-title">Location & Specs</h2>
          </div>
          <p className="section-desc">Physical address and legal descriptions.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">State</label>
              <select 
                value={formSelectedState} 
                onChange={(e) => {
                  setFormSelectedState(e.target.value);
                  setFormData((prev: any) => ({ ...prev, county_id: "" }));
                }} 
                className="input-field"
              >
                <option value="">Select State...</option>
                {Array.from(new Set(lookups.ls_county?.map(c => c.state))).sort().map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">County <span className="required-star">*</span></label>
              <select name="county_id" value={formData.county_id} onChange={handleChange} className="input-field">
                <option value="">Select County...</option>
                {lookups.ls_county?.filter(c => !formSelectedState || c.state === formSelectedState).map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Address <span className="required-star">*</span></label>
              <input type="text" name="address" value={formData.address} onChange={handleChange} className="input-field" placeholder="Full street address" />
            </div>
            
            <div className="input-group">
              <label className="input-label">Coordinates <span className="required-star">*</span></label>
              <input type="text" name="coordinates" value={formData.coordinates} onChange={handleChange} className="input-field" placeholder="Lat, Lng" />
            </div>
            <div className="input-group">
              <label className="input-label">Zoning <span className="required-star">*</span></label>
              <input type="text" name="zoning" value={formData.zoning} onChange={handleChange} className="input-field" placeholder="R-1, C-2..." />
            </div>
            <div className="input-group">
              <label className="input-label">Size (Acres) <span className="required-star">*</span></label>
              <input type="number" step="any" name="size" value={formData.size} onChange={handleChange} className="input-field" placeholder="0.00" onKeyDown={(e) => {
                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
              }} />
            </div>
          </div>
          
          <div className="form-grid col-2" style={{ marginTop: "1.5rem", alignItems: 'flex-start' }}>
            <div className="input-group">
              <label className="input-label">Legal Description <span className="required-star">*</span></label>
              <textarea name="legal_description" value={formData.legal_description} onChange={handleChange} className="input-field" rows={3} placeholder="Legal description of the parcel..."></textarea>
            </div>
            <div className="checkbox-group" style={{ marginTop: "2rem" }}>
              <input type="checkbox" id="corner_lot" name="corner_lot" checked={formData.corner_lot} onChange={handleChange as any} className="checkbox-input" />
              <label htmlFor="corner_lot" className="checkbox-label">Corner Lot?</label>
            </div>
          </div>
        </section>

        <section id="attributes" className="form-section">
          <div className="section-header-row">
            <FileText className="section-icon" />
            <h2 className="section-title">Property Attributes</h2>
          </div>
          <p className="section-desc">Land types, FEMA and mapping references.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">Property Type <span className="required-star">*</span></label>
              <select name="property_type_id" value={formData.property_type_id} onChange={handleChange} className="input-field">
                <option value="">Select Type...</option>
                {lookups.ls_property_type?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">FEMA Zone <span className="required-star">*</span></label>
              <select name="fema_id" value={formData.fema_id} onChange={handleChange} className="input-field">
                <option value="">Select FEMA...</option>
                {lookups.ls_fema?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Wetlands <span className="required-star">*</span></label>
              <select name="wetlands_id" value={formData.wetlands_id} onChange={handleChange} className="input-field">
                <option value="">Select Wetlands...</option>
                {lookups.ls_wetlands?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">GIS Map Reference <span className="required-star">*</span></label>
              <select name="gismap_id" value={formData.gismap_id} onChange={handleChange} className="input-field">
                <option value="">Select GIS Map...</option>
                {lookups.ls_gismap?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Debit Status <span className="required-star">*</span></label>
              <select name="debit_id" value={formData.debit_id} onChange={handleChange} className="input-field">
                <option value="">Select Status...</option>
                {lookups.ls_debit?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section id="financials" className="form-section">
          <div className="section-header-row">
            <DollarSign className="section-icon" />
            <h2 className="section-title">Appraisals & Financials</h2>
          </div>
          <p className="section-desc">Valuation numbers, tax data, and references.</p>
          
          <div className="form-grid col-3">
            <div className="input-group">
              <label className="input-label">Open Bid ($) <span className="required-star">*</span></label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="open_bid" value={formData.open_bid} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Min Bid ($) (Auto)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="min_bid" value={formData.min_bid} className="input-field currency locked" placeholder="0.00" readOnly disabled />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Max Bid ($) (Auto)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="max_bid" value={formData.max_bid} className="input-field currency locked" placeholder="0.00" readOnly disabled />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Internal Max Bid ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="max_bid_internal" value={formData.max_bid_internal} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Annual Tax ($) <span className="required-star">*</span></label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="annual_tax" value={formData.annual_tax} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">House Price ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="house_price" value={formData.house_price} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">SqFt Price Reference ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="sqft_price_reference" value={formData.sqft_price_reference} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">County Appraisal ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="county_appraisal" value={formData.county_appraisal} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Online Appraisal ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="online_appraisal" value={formData.online_appraisal} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Appraisal Min ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="appraisal_min" value={formData.appraisal_min} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Appraisal Avg ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="appraisal_avg" value={formData.appraisal_avg} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Appraisal Max ($)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="appraisal_max" value={formData.appraisal_max} onChange={handleChange} className="input-field currency" placeholder="0.00" />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Market Value ($) (Auto)</label>
              <div className="currency-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" step="any" name="market_value" value={formData.market_value} className="input-field currency locked" placeholder="0.00" readOnly disabled />
              </div>
            </div>
          </div>
        </section>

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
              <label className="input-label">Regrid Link <span className="required-star">*</span></label>
              <input type="url" name="link_regrid" value={formData.link_regrid} onChange={handleChange} className="input-field" placeholder="https://regrid.com/..." />
            </div>
            <div className="input-group">
              <label className="input-label">Sources Link</label>
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
            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label className="input-label">Google Earth Link</label>
              <input type="url" name="link_earth" value={formData.link_earth} onChange={handleChange} className="input-field" placeholder="https://earth.google.com/..." />
            </div>
          </div>
        </section>

      </div>
      </div>

      <div className="form-actions-bar">
        <button className="btn-secondary" onClick={() => router.push('/auctions')}>
          <X className="w-4 h-4" />
          Cancel
        </button>
        
        {isEditing && (
          <button 
            className="btn-secondary" 
            onClick={handleDelete} 
            disabled={loading || fetchingData}
            style={{ color: '#ef4444', borderColor: '#fee2e2' }}
            title="Delete Auction"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}

        <div style={{ flex: 1 }}></div>

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
