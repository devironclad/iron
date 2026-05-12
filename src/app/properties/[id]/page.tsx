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
  Navigation as NavigationIcon,
  Search,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hasPermission, getCurrentUserPermissions } from "@/lib/permissions";
import "../../auctions/new/form.css"; // Keep the styles
import "./details.css"; // Keep the tabs structure styling

const TABS_CONFIG = [
  { id: 'research', name: 'Research', icon: Search, resource: 'tab:general' },
  { id: 'financials', name: 'Financials', icon: DollarSign, resource: 'tab:financials' },
  { id: 'amenities', name: 'Amenities', icon: NavigationIcon, resource: 'tab:amenities' },
  { id: 'links', name: 'Media & Map', icon: LinkIcon, resource: 'tab:links' },
];

export default function PropertyDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [activeTab, setActiveTab] = useState('research');
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
    if (permissions && Object.keys(permissions).length > 0) {
      return TABS_CONFIG.filter(tab => hasPermission(permissions, tab.resource, 'view'));
    }
    return TABS_CONFIG;
  }, [permissions]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      
      const tables = [
        "ls_origem", "ls_priority", "ls_county", 
        "ls_auction_type", "ls_auction_model", "ls_property_type", 
        "ls_fema", "ls_wetlands", "ls_debit", "ls_gismap", 
        "ls_property_access", "ls_road_access", "ls_ref_construction"
      ];

      const [permsResult, propertyResult] = await Promise.all([
        getCurrentUserPermissions(),
        supabase.from('ls_assets').select(`
          *,
          ls_county ( name, state ),
          ls_priority ( name, color ),
          ls_property_type ( name )
        `).eq('id', id).single()
      ]);

      setPermissions(permsResult);

      if (propertyResult.data) {
        const formatted = { ...propertyResult.data };
        if (formatted.auction_date) formatted.auction_date = new Date(formatted.auction_date).toISOString().slice(0, 16);
        if (formatted.acquisition_date) formatted.acquisition_date = new Date(formatted.acquisition_date).toISOString().slice(0, 16);
        
        Object.keys(formatted).forEach(key => {
          if (formatted[key] === null) formatted[key] = "";
        });
        setProperty(formatted);
      }

      const lookupResults: Record<string, any[]> = {};
      await Promise.all(tables.map(table => {
        const columns = table === "ls_county" ? "id, name, state" : "id, name";
        return supabase.from(table).select(columns).order("name").then(({ data }) => {
          lookupResults[table] = data || [];
        });
      }));
      setLookups(lookupResults);

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
    if (permissions && !hasPermission(permissions, 'page:properties', 'edit')) {
      alert("You don't have permission to edit properties.");
      return;
    }

    setSaving(true);
    try {
      const payload = { ...property };
      
      delete payload.ls_county;
      delete payload.ls_priority;
      delete payload.ls_property_type;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.updated_by;
      
      const numericFields = [
        'ref_id', 'size', 'market_value', 'annual_tax', 'open_bid', 'min_bid', 'max_bid', 
        'max_bid_internal', 'appraisal_min', 'appraisal_avg', 'appraisal_max', 
        'county_appraisal', 'online_appraisal', 'sqft_price_reference', 'house_price'
      ];
      numericFields.forEach(f => {
        if (payload[f] === "" || payload[f] === undefined) payload[f] = null;
        else payload[f] = Number(payload[f]);
      });

      const uuidFields = [
        'origem_id', 'priority_id', 'county_id', 'auction_type_id', 
        'auction_model_id', 'property_type_id', 'fema_id', 'wetlands_id', 
        'debit_id', 'gismap_id', 'prop_access_id', 'road_access_id', 'ref_construction_id'
      ];
      uuidFields.forEach(f => {
        if (!payload[f]) payload[f] = null;
      });

      if (!payload.auction_date) payload.auction_date = null;
      if (!payload.acquisition_date) payload.acquisition_date = null;

      Object.keys(payload).forEach(key => {
        if (payload[key] === "") {
          payload[key] = null;
        }
      });

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

  const formatPropId = (ref_id: any) => {
    if (ref_id && !isNaN(Number(ref_id))) {
      return `PRP-${Number(ref_id).toString().padStart(4, '0')}`;
    }
    return "Not Assigned";
  };

  if (loading) {
    return (
      <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: '#64748b' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 600 }}>Loading Property Details...</span>
      </div>
    );
  }

  const businessId = formatPropId(property?.ref_id);

  return (
    <div className="property-details-container">
      <div className="details-header">
        <div className="header-left">
          <button onClick={() => router.push('/properties')} className="back-btn">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="header-title-area">
            <div className="id-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700 }}>
              {businessId}
            </div>
            <h1 className="header-title">{property?.address || property?.parcel_number || 'Property Details'}</h1>
            <div className="header-subtitle">
              {property?.ls_county?.name}, {property?.ls_county?.state} • {property?.ls_property_type?.name}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

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
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </div>

        <div className="tab-content">
          
          {/* RESEARCH TAB */}
          {activeTab === 'research' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">{TABS_CONFIG.find(t => t.id === 'research')?.name}</h2>
                <p className="section-desc">Comprehensive data regarding the asset's origin, location, and characteristics.</p>
              </div>
              
              <div className="form-grid col-3" style={{ padding: '0 1rem' }}>
                <div className="input-group">
                  <label className="input-label">Origin</label>
                  <select name="origem_id" value={property.origem_id} onChange={handleChange} className="input-field">
                    <option value="">Select Origin...</option>
                    {lookups.ls_origem?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Acquisition Date</label>
                  <input type="datetime-local" name="acquisition_date" value={property.acquisition_date} onChange={handleChange} className="input-field" />
                </div>
                <div className="input-group">
                  <label className="input-label">County</label>
                  <select name="county_id" value={property.county_id} onChange={handleChange} className="input-field">
                    <option value="">Select County...</option>
                    {lookups.ls_county?.map(i => <option key={i.id} value={i.id}>{i.name} ({i.state})</option>)}
                  </select>
                </div>

                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label className="input-label">Address</label>
                  <input type="text" name="address" value={property.address} onChange={handleChange} className="input-field" />
                </div>
                <div className="input-group">
                  <label className="input-label">Coordinates</label>
                  <input type="text" name="coordinates" value={property.coordinates} onChange={handleChange} className="input-field" />
                </div>

                <div className="input-group">
                  <label className="input-label">Zoning</label>
                  <input type="text" name="zoning" value={property.zoning} onChange={handleChange} className="input-field" />
                </div>
                <div className="input-group">
                  <label className="input-label">Size (Acres/SqFt)</label>
                  <input type="number" name="size" value={property.size} onChange={handleChange} className="input-field" />
                </div>
                <div className="input-group">
                  <label className="input-label">Parcel Number</label>
                  <input type="text" name="parcel_number" value={property.parcel_number} onChange={handleChange} className="input-field" />
                </div>

                <div className="input-group">
                  <label className="input-label">Case Number</label>
                  <input type="text" name="case_number" value={property.case_number} onChange={handleChange} className="input-field" />
                </div>
                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label className="input-label">Legal Description</label>
                  <textarea name="legal_description" value={property.legal_description} onChange={handleChange} className="input-field" rows={2} style={{ resize: 'vertical' }} />
                </div>

                <div className="input-group">
                  <label className="input-label">GIS Map Reference</label>
                  <select name="gismap_id" value={property.gismap_id} onChange={handleChange} className="input-field">
                    <option value="">Select Map...</option>
                    {lookups.ls_gismap?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Wetlands</label>
                  <select name="wetlands_id" value={property.wetlands_id} onChange={handleChange} className="input-field">
                    <option value="">Select Wetlands...</option>
                    {lookups.ls_wetlands?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">FEMA Zone</label>
                  <select name="fema_id" value={property.fema_id} onChange={handleChange} className="input-field">
                    <option value="">Select FEMA...</option>
                    {lookups.ls_fema?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Debit Status</label>
                  <select name="debit_id" value={property.debit_id} onChange={handleChange} className="input-field">
                    <option value="">Select Debit...</option>
                    {lookups.ls_debit?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Property Type</label>
                  <select name="property_type_id" value={property.property_type_id} onChange={handleChange} className="input-field">
                    <option value="">Select Type...</option>
                    {lookups.ls_property_type?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Property Access</label>
                  <select name="prop_access_id" value={property.prop_access_id} onChange={handleChange} className="input-field">
                    <option value="">Select Access...</option>
                    {lookups.ls_property_access?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Road Access</label>
                  <select name="road_access_id" value={property.road_access_id} onChange={handleChange} className="input-field">
                    <option value="">Select Road...</option>
                    {lookups.ls_road_access?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="checkbox-group">
                  <input type="checkbox" id="inperson_visit" name="inperson_visit" checked={property.inperson_visit} onChange={handleChange} className="checkbox-input" />
                  <label htmlFor="inperson_visit" className="checkbox-label">In Person Visitor?</label>
                </div>
                <div className="checkbox-group">
                  <input type="checkbox" id="corner_lot" name="corner_lot" checked={property.corner_lot} onChange={handleChange} className="checkbox-input" />
                  <label htmlFor="corner_lot" className="checkbox-label">Corner Lot?</label>
                </div>

                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label className="input-label">Regrid Link</label>
                  <input type="url" name="link_regrid" value={property.link_regrid} onChange={handleChange} className="input-field" placeholder="https://regrid.com/..." />
                </div>
                <div className="input-group"></div>

                <div className="input-group" style={{ gridColumn: 'span 3' }}>
                  <label className="input-label">Observations</label>
                  <textarea name="observation" value={property.observation} onChange={handleChange} className="input-field" rows={3} style={{ resize: 'vertical' }} />
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
              <div className="form-grid col-3" style={{ padding: '0 1rem' }}>
                <div className="input-group">
                  <label className="input-label">Market Value ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="market_value" value={property.market_value} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Annual Tax ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="annual_tax" value={property.annual_tax} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">SqFt Price Ref ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="sqft_price_reference" value={property.sqft_price_reference} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Appraisal Min ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="appraisal_min" value={property.appraisal_min} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Appraisal Avg ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="appraisal_avg" value={property.appraisal_avg} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Appraisal Max ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="appraisal_max" value={property.appraisal_max} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">County Appraisal ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="county_appraisal" value={property.county_appraisal} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Online Appraisal ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="online_appraisal" value={property.online_appraisal} onChange={handleChange} className="input-field currency" />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">House Price ($)</label>
                  <div className="currency-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input type="number" step="any" name="house_price" value={property.house_price} onChange={handleChange} className="input-field currency" />
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

              <div style={{ backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '2rem', border: '1px solid #e2e8f0', margin: '0 1rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>Add New Amenity</h4>
                <div className="form-grid col-3" style={{ alignItems: 'flex-end' }}>
                  <div className="input-group">
                    <label className="input-label">Category</label>
                    <select 
                      value={newAmenity.category_id} 
                      onChange={(e) => setNewAmenity({...newAmenity, category_id: e.target.value, type_id: ''})}
                      className="input-field"
                    >
                      <option value="">Select Category...</option>
                      {amenityCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Type / Description</label>
                    <select 
                      value={newAmenity.type_id} 
                      onChange={(e) => setNewAmenity({...newAmenity, type_id: e.target.value})}
                      disabled={!newAmenity.category_id}
                      className="input-field"
                    >
                      <option value="">Select Type...</option>
                      {amenityTypes
                        .filter(t => t.category_id === newAmenity.category_id)
                        .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <label className="input-label">Distance (mi)</label>
                        <input 
                          type="number" 
                          step="0.1" 
                          value={newAmenity.distance} 
                          onChange={(e) => {
                            const dist = e.target.value;
                            const calcTime = dist ? Math.round(parseFloat(dist) * 2) : '';
                            setNewAmenity({...newAmenity, distance: dist, time: calcTime.toString()});
                          }}
                          className="input-field"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="input-label">Time (min)</label>
                        <input 
                          type="number" 
                          value={newAmenity.time} 
                          onChange={(e) => setNewAmenity({...newAmenity, time: e.target.value})}
                          className="input-field"
                        />
                      </div>
                      <button onClick={handleAddAmenity} className="save-btn" style={{ height: '38px', padding: '0 1rem', marginTop: 'auto', backgroundColor: 'var(--primary)', color: 'white', border: 'none' }} disabled={!newAmenity.type_id}>
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="amenity-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', padding: '1rem' }}>
                {amenities.map(a => {
                  const catName = a.ls_amenity_type?.ls_amenity_category?.name || "";
                  return (
                    <div key={a.id} style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8' }}>{catName}</span>
                          <h4 style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', fontWeight: 700 }}>{a.ls_amenity_type?.name}</h4>
                        </div>
                        <button onClick={() => handleDeleteAmenity(a.id)} style={{ color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <span style={{ backgroundColor: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <MapPin className="w-3 h-3" /> {a.distance_miles} mi
                        </span>
                        <span style={{ backgroundColor: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Clock className="w-3 h-3" /> {a.time_minutes} min
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MEDIA & MAP TAB */}
          {activeTab === 'links' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Media & Map Links</h2>
                <p className="section-desc">External data sources, research links, and property observations.</p>
              </div>
              <div className="form-grid col-2" style={{ padding: '0 1rem' }}>
                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label className="input-label">Google Earth Link</label>
                  <input type="url" name="link_earth" value={property.link_earth} onChange={handleChange} className="input-field" placeholder="https://earth.google.com/..." />
                </div>
                <div className="input-group">
                  <label className="input-label">Other Sources Link</label>
                  <input type="url" name="link_sources" value={property.link_sources} onChange={handleChange} className="input-field" placeholder="https://..." />
                </div>
                <div className="input-group">
                  <label className="input-label">House Sources Link</label>
                  <input type="url" name="link_house_sources" value={property.link_house_sources} onChange={handleChange} className="input-field" placeholder="https://zillow.com/..." />
                </div>
                <div className="input-group">
                  <label className="input-label">Video Link</label>
                  <input type="url" name="link_video" value={property.link_video} onChange={handleChange} className="input-field" placeholder="https://youtube.com/..." />
                </div>
                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label className="input-label">Surrounds Notes</label>
                  <textarea name="surrounds" value={property.surrounds} onChange={handleChange} className="input-field" rows={4} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
