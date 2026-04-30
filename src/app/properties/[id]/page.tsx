"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  Info, 
  MapPin, 
  Tag, 
  DollarSign, 
  ShoppingCart, 
  Link as LinkIcon, 
  Compass, 
  Plus, 
  Trash2,
  Clock,
  Navigation
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hasPermission, getCurrentUserPermissions } from "@/lib/permissions";
import "./details.css";

const TABS_CONFIG = [
  { id: 'general', name: 'General', icon: Info, resource: 'tab:general' },
  { id: 'location', name: 'Location & Specs', icon: MapPin, resource: 'tab:location' },
  { id: 'attributes', name: 'Attributes', icon: Compass, resource: 'tab:attributes' },
  { id: 'financials', name: 'Financials', icon: DollarSign, resource: 'tab:financials' },
  { id: 'acquisition', name: 'Acquisition', icon: ShoppingCart, resource: 'tab:acquisition' },
  { id: 'amenities', name: 'Amenities', icon: Navigation, resource: 'tab:amenities' },
  { id: 'links', name: 'Links & Media', icon: LinkIcon, resource: 'tab:links' },
];

export default function PropertyDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [property, setProperty] = useState<any>(null);
  const [lookups, setLookups] = useState<Record<string, any[]>>({});
  const [permissions, setPermissions] = useState<any>(null);
  
  // Amenities specific state
  const [amenities, setAmenities] = useState<any[]>([]);
  const [amenityCategories, setAmenityCategories] = useState<any[]>([]);
  const [amenityTypes, setAmenityTypes] = useState<any[]>([]);
  const [newAmenity, setNewAmenity] = useState({
    category_id: '',
    type_id: '',
    distance: '',
    time: ''
  });

  const visibleTabs = useMemo(() => {
    // If permissions are loaded but empty, show all (fallback for setup)
    if (permissions && Object.keys(permissions).length > 0) {
      return TABS_CONFIG.filter(tab => hasPermission(permissions, tab.resource, 'view'));
    }
    return TABS_CONFIG;
  }, [permissions]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      
      const tables = [
        "ls_origem", "ls_status", "ls_priority", "ls_county", 
        "ls_auction_type", "ls_auction_model", "ls_property_type", 
        "ls_fema", "ls_wetlands", "ls_debit", "ls_gismap", 
        "ls_property_access", "ls_road_access", "ls_ref_construction"
      ];

      // Fetch Permissions, Property, and basic lookups
      const [permsResult, propertyResult] = await Promise.all([
        getCurrentUserPermissions(),
        supabase.from('ls_assets').select(`
          *,
          ls_county ( name, state ),
          ls_status ( name ),
          ls_priority ( name, color ),
          ls_property_type ( name )
        `).eq('id', id).single()
      ]);

      setPermissions(permsResult);

      if (propertyResult.data) {
        const formatted = { ...propertyResult.data };
        if (formatted.auction_date) formatted.auction_date = new Date(formatted.auction_date).toISOString().slice(0, 16);
        if (formatted.acquisition_date) formatted.acquisition_date = new Date(formatted.acquisition_date).toISOString().slice(0, 16);
        
        // Clean nulls to empty strings for controlled inputs
        Object.keys(formatted).forEach(key => {
          if (formatted[key] === null) formatted[key] = "";
        });
        setProperty(formatted);
      }

      // Fetch Lookups
      const lookupResults: Record<string, any[]> = {};
      await Promise.all(tables.map(table => {
        const columns = table === "ls_county" ? "id, name, state" : "id, name";
        return supabase.from(table).select(columns).order("name").then(({ data }) => {
          lookupResults[table] = data || [];
        });
      }));
      setLookups(lookupResults);

      // Fetch Amenities for this asset
      const { data: amenData } = await supabase
        .from('ls_asset_amenities')
        .select(`
          *,
          ls_amenity_type ( 
            name, 
            ls_amenity_category ( name ) 
          )
        `)
        .eq('asset_id', id);
      setAmenities(amenData || []);

      // Fetch Lookups for Amenities
      const [catData, typeData] = await Promise.all([
        supabase.from('ls_amenity_category').select('*').order('name'),
        supabase.from('ls_amenity_type').select('*').order('name')
      ]);
      setAmenityCategories(catData.data || []);
      setAmenityTypes(typeData.data || []);

      setLoading(false);
    }
    
    if (id) loadData();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setProperty((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleSave = async () => {
    // Check edit permission for this page/resource if needed
    // For now, we assume if they can see it, we check the global 'edit' perm or just the tab perm
    if (permissions && !hasPermission(permissions, 'page:properties', 'edit')) {
      alert("You don't have permission to edit properties.");
      return;
    }

    setSaving(true);
    try {
      const payload = { ...property };
      
      delete payload.ls_county;
      delete payload.ls_status;
      delete payload.ls_priority;
      delete payload.ls_property_type;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.updated_by;
      
      const numericFields = [
        'ref_id', 'size', 'market_value', 'annual_tax', 'open_bid', 'max_bid', 
        'max_bid_internal', 'appraisal_min', 'appraisal_avg', 'appraisal_max', 
        'county_appraisal', 'online_appraisal', 'sqft_price_reference'
      ];
      numericFields.forEach(f => {
        if (payload[f] === "" || payload[f] === undefined) payload[f] = null;
        else payload[f] = Number(payload[f]);
      });

      const uuidFields = [
        'origem_id', 'status_id', 'priority_id', 'county_id', 'auction_type_id', 
        'auction_model_id', 'property_type_id', 'fema_id', 'wetlands_id', 
        'debit_id', 'gismap_id', 'prop_access_id', 'road_access_id', 'ref_construction_id'
      ];
      uuidFields.forEach(f => {
        if (!payload[f]) payload[f] = null;
      });

      if (!payload.auction_date) payload.auction_date = null;
      if (!payload.acquisition_date) payload.acquisition_date = null;

      const { error } = await supabase.from('ls_assets').update(payload).eq('id', id);
      if (error) throw error;
      
      alert("Property updated successfully!");
    } catch (err: any) {
      console.error(err);
      alert("Error updating property: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAmenity = async () => {
    if (!newAmenity.type_id) return;
    
    const payload = {
      asset_id: id,
      amenity_type_id: newAmenity.type_id,
      distance_miles: parseFloat(newAmenity.distance) || 0,
      time_minutes: parseInt(newAmenity.time) || 0
    };

    const { data, error } = await supabase.from('ls_asset_amenities').insert([payload]).select(`
      *,
      ls_amenity_type ( 
        name, 
        ls_amenity_category ( name ) 
      )
    `).single();

    if (!error && data) {
      setAmenities([...amenities, data]);
      setNewAmenity({ category_id: '', type_id: '', distance: '', time: '' });
    }
  };

  const handleDeleteAmenity = async (amenId: string) => {
    const { error } = await supabase.from('ls_asset_amenities').delete().eq('id', amenId);
    if (!error) {
      setAmenities(amenities.filter(a => a.id !== amenId));
    }
  };

  if (loading) {
    return (
      <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: '#64748b' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 600 }}>Loading Property Details...</span>
      </div>
    );
  }

  // If the user can't view the active tab anymore (due to permission change), reset to first available
  const isTabVisible = visibleTabs.some(t => t.id === activeTab);
  if (!isTabVisible && visibleTabs.length > 0) {
    setActiveTab(visibleTabs[0].id);
  }

  return (
    <div className="property-details-container">
      {/* Top Navigation / Header */}
      <div className="details-header">
        <div className="header-left">
          <button onClick={() => router.push('/properties')} className="back-btn">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="header-title-area">
            <div className="id-badge">ID: {property?.id}</div>
            <h1 className="header-title">{property?.address || property?.parcel_number || 'Property Details'}</h1>
            <div className="header-subtitle">
              {property?.ls_county?.name}, {property?.ls_county?.state} • {property?.ls_property_type?.name}
            </div>
          </div>
        </div>
        <div className="header-actions">
          {(!permissions || hasPermission(permissions, 'page:properties', 'edit')) && (
            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          )}
        </div>
      </div>

      {/* Body with Vertical Navigation */}
      <div className="details-body">
        <div className="tabs-nav">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button 
                key={tab.id}
                className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                data-title={tab.name}
                title={tab.name}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </div>

        {/* Tab Content Area */}
        <div className="tab-content" style={{ borderBottomRightRadius: '20px' }}>
          
          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">General Identity</h2>
                <p className="section-desc">Manage the core identity and status of this asset.</p>
              </div>
              <div className="amenity-form-card">
                <div className="amenity-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
                  <div className="form-group">
                    <label>Ref ID</label>
                    <input type="number" name="ref_id" value={property.ref_id} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Parcel Number</label>
                    <input type="text" name="parcel_number" value={property.parcel_number} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Case Number</label>
                    <input type="text" name="case_number" value={property.case_number} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Origem</label>
                    <select name="origem_id" value={property.origem_id} onChange={handleChange} className="form-input">
                      <option value="">Select Origem...</option>
                      {lookups.ls_origem?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select name="status_id" value={property.status_id} onChange={handleChange} className="form-input">
                      <option value="">Select Status...</option>
                      {lookups.ls_status?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select name="priority_id" value={property.priority_id} onChange={handleChange} className="form-input">
                      <option value="">Select Priority...</option>
                      {lookups.ls_priority?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Property Type</label>
                    <select name="property_type_id" value={property.property_type_id} onChange={handleChange} className="form-input">
                      <option value="">Select Type...</option>
                      {lookups.ls_property_type?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LOCATION TAB */}
          {activeTab === 'location' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Location & Specs</h2>
                <p className="section-desc">Physical location, boundaries, and sizing information.</p>
              </div>
              <div className="amenity-form-card">
                <div className="amenity-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Address</label>
                    <input type="text" name="address" value={property.address} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>County</label>
                    <select name="county_id" value={property.county_id} onChange={handleChange} className="form-input">
                      <option value="">Select County...</option>
                      {lookups.ls_county?.map(i => <option key={i.id} value={i.id}>{i.name} ({i.state})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Coordinates</label>
                    <input type="text" name="coordinates" value={property.coordinates} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Zoning</label>
                    <input type="text" name="zoning" value={property.zoning} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Size (Acres/SqFt)</label>
                    <input type="number" name="size" value={property.size} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                    <input type="checkbox" name="corner_lot" checked={property.corner_lot} onChange={handleChange} style={{ width: '20px', height: '20px' }} />
                    <label style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '1rem', color: '#1e293b' }}>Corner Lot?</label>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Legal Description</label>
                    <textarea name="legal_description" value={property.legal_description} onChange={handleChange} className="form-input" rows={4} style={{ resize: 'vertical' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ATTRIBUTES TAB */}
          {activeTab === 'attributes' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Property Attributes</h2>
                <p className="section-desc">Environmental factors, access levels, and site visit logs.</p>
              </div>
              <div className="amenity-form-card">
                <div className="amenity-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
                  <div className="form-group">
                    <label>FEMA Zone</label>
                    <select name="fema_id" value={property.fema_id} onChange={handleChange} className="form-input">
                      <option value="">Select FEMA...</option>
                      {lookups.ls_fema?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Wetlands</label>
                    <select name="wetlands_id" value={property.wetlands_id} onChange={handleChange} className="form-input">
                      <option value="">Select Wetlands...</option>
                      {lookups.ls_wetlands?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>GIS Map</label>
                    <select name="gismap_id" value={property.gismap_id} onChange={handleChange} className="form-input">
                      <option value="">Select Map...</option>
                      {lookups.ls_gismap?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Property Access</label>
                    <select name="prop_access_id" value={property.prop_access_id} onChange={handleChange} className="form-input">
                      <option value="">Select Access...</option>
                      {lookups.ls_property_access?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Road Access</label>
                    <select name="road_access_id" value={property.road_access_id} onChange={handleChange} className="form-input">
                      <option value="">Select Road...</option>
                      {lookups.ls_road_access?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Construction Ref</label>
                    <select name="ref_construction_id" value={property.ref_construction_id} onChange={handleChange} className="form-input">
                      <option value="">Select Ref...</option>
                      {lookups.ls_ref_construction?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                    <input type="checkbox" name="inperson_visit" checked={property.inperson_visit} onChange={handleChange} style={{ width: '20px', height: '20px' }} />
                    <label style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '1rem', color: '#1e293b' }}>In-person Visit?</label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FINANCIALS TAB */}
          {activeTab === 'financials' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Appraisals & Financials</h2>
                <p className="section-desc">Valuation history, tax records, and debt status.</p>
              </div>
              <div className="amenity-form-card">
                <div className="amenity-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
                  <div className="form-group">
                    <label>Market Value ($)</label>
                    <input type="number" name="market_value" value={property.market_value} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Annual Tax ($)</label>
                    <input type="number" name="annual_tax" value={property.annual_tax} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Debit Status</label>
                    <select name="debit_id" value={property.debit_id} onChange={handleChange} className="form-input">
                      <option value="">Select Debit...</option>
                      {lookups.ls_debit?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Appraisal Min ($)</label>
                    <input type="number" name="appraisal_min" value={property.appraisal_min} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Appraisal Avg ($)</label>
                    <input type="number" name="appraisal_avg" value={property.appraisal_avg} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Appraisal Max ($)</label>
                    <input type="number" name="appraisal_max" value={property.appraisal_max} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>County Appraisal ($)</label>
                    <input type="number" name="county_appraisal" value={property.county_appraisal} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Online Appraisal ($)</label>
                    <input type="number" name="online_appraisal" value={property.online_appraisal} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>SqFt Price Ref ($)</label>
                    <input type="number" name="sqft_price_reference" value={property.sqft_price_reference} onChange={handleChange} className="form-input" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ACQUISITION TAB */}
          {activeTab === 'acquisition' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Acquisition & Auction</h2>
                <p className="section-desc">Timeline and bidding metrics from the acquisition process.</p>
              </div>
              <div className="amenity-form-card">
                <div className="amenity-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
                  <div className="form-group">
                    <label>Auction Date</label>
                    <input type="datetime-local" name="auction_date" value={property.auction_date} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Acquisition Date</label>
                    <input type="datetime-local" name="acquisition_date" value={property.acquisition_date} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Auction Type</label>
                    <select name="auction_type_id" value={property.auction_type_id} onChange={handleChange} className="form-input">
                      <option value="">Select Type...</option>
                      {lookups.ls_auction_type?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Auction Model</label>
                    <select name="auction_model_id" value={property.auction_model_id} onChange={handleChange} className="form-input">
                      <option value="">Select Model...</option>
                      {lookups.ls_auction_model?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Open Bid ($)</label>
                    <input type="number" name="open_bid" value={property.open_bid} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Max Bid ($)</label>
                    <input type="number" name="max_bid" value={property.max_bid} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Internal Max Bid ($)</label>
                    <input type="number" name="max_bid_internal" value={property.max_bid_internal} onChange={handleChange} className="form-input" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AMENITIES TAB */}
          {activeTab === 'amenities' && (
            <div className="amenities-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Surrounding Amenities</h2>
                <p className="section-desc">Manage points of interest, schools, and health facilities near the property.</p>
              </div>

              <div className="amenity-form-card">
                <h3>Add New Amenity</h3>
                <div className="amenity-grid">
                  <div className="form-group">
                    <label>Category</label>
                    <select 
                      value={newAmenity.category_id} 
                      onChange={(e) => setNewAmenity({...newAmenity, category_id: e.target.value, type_id: ''})}
                      className="form-input"
                    >
                      <option value="">Select Category...</option>
                      {amenityCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Type / Description</label>
                    <select 
                      value={newAmenity.type_id} 
                      onChange={(e) => setNewAmenity({...newAmenity, type_id: e.target.value})}
                      disabled={!newAmenity.category_id}
                      className="form-input"
                    >
                      <option value="">Select Type...</option>
                      {amenityTypes
                        .filter(t => t.category_id === newAmenity.category_id)
                        .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Distance (mi)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={newAmenity.distance} 
                      onChange={(e) => setNewAmenity({...newAmenity, distance: e.target.value})}
                      placeholder="2.5"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Time (min)</label>
                    <input 
                      type="number" 
                      value={newAmenity.time} 
                      onChange={(e) => setNewAmenity({...newAmenity, time: e.target.value})}
                      placeholder="10"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group add-btn-cell">
                    <button onClick={handleAddAmenity} className="add-amenity-btn" disabled={!newAmenity.type_id} title="Add Amenity">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="amenities-list">
                {amenities.length === 0 ? (
                  <div className="empty-amenities">No amenities registered for this property yet.</div>
                ) : (
                  <table className="amenities-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Distance</th>
                        <th>Time</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amenities.map(a => (
                        <tr key={a.id}>
                          <td className="cat-cell">{a.ls_amenity_type?.ls_amenity_category?.name}</td>
                          <td className="type-cell">{a.ls_amenity_type?.name}</td>
                          <td>
                            <span className="dist-badge">
                              <MapPin className="w-3 h-3" style={{ opacity: 0.6 }} />
                              {a.distance_miles} mi
                            </span>
                          </td>
                          <td>
                            <span className="dist-badge">
                              <Clock className="w-3 h-3" style={{ opacity: 0.6 }} />
                              {a.time_minutes} min
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button onClick={() => handleDeleteAmenity(a.id)} className="delete-btn" style={{ marginLeft: 'auto' }}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* LINKS & MEDIA TAB */}
          {activeTab === 'links' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Links & Media</h2>
                <p className="section-desc">External data sources, research links, and property observations.</p>
              </div>
              <div className="amenity-form-card">
                <div className="amenity-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div className="form-group">
                    <label>Regrid Link</label>
                    <input type="url" name="link_regrid" value={property.link_regrid} onChange={handleChange} className="form-input" placeholder="https://regrid.com/..." />
                  </div>
                  <div className="form-group">
                    <label>Other Sources Link</label>
                    <input type="url" name="link_sources" value={property.link_sources} onChange={handleChange} className="form-input" placeholder="https://..." />
                  </div>
                  <div className="form-group">
                    <label>House Sources Link</label>
                    <input type="url" name="link_house_sources" value={property.link_house_sources} onChange={handleChange} className="form-input" placeholder="https://zillow.com/..." />
                  </div>
                  <div className="form-group">
                    <label>Video Link</label>
                    <input type="url" name="link_video" value={property.link_video} onChange={handleChange} className="form-input" placeholder="https://youtube.com/..." />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Observations</label>
                    <textarea name="observation" value={property.observation} onChange={handleChange} className="form-input" rows={4} style={{ resize: 'vertical' }} />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Surrounds</label>
                    <textarea name="surrounds" value={property.surrounds} onChange={handleChange} className="form-input" rows={2} style={{ resize: 'vertical' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
