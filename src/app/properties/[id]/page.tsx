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
  X,
  TrendingUp,
  ExternalLink,
  FileText,
  Coins,
  Scale,
  Trees,
  Lock,
  CheckSquare,
  Receipt
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hasPermission, getCurrentUserPermissions } from "@/lib/permissions";
import "../../auctions/new/form.css"; // Keep the styles
import "./details.css"; // Keep the tabs structure styling

const TABS_CONFIG = [
  { id: 'research',     name: 'Research',      icon: Search,          resource: 'tab:general' },
  { id: 'amenities',   name: 'Amenities',      icon: NavigationIcon,  resource: 'tab:amenities' },
  { id: 'values',      name: 'Values',         icon: TrendingUp,      resource: 'tab:values' },
  { id: 'acquisition', name: 'Development',    icon: Coins,           resource: 'tab:acquisition' },
  { id: 'docs',        name: 'Documentation',  icon: FileText,        resource: 'tab:docs' },
  { id: 'tax',         name: 'Tax',            icon: Receipt,         resource: 'tab:tax' },
  { id: 'sales',       name: 'Sales',          icon: ShoppingCart,    resource: 'tab:sales' },
  { id: 'strategy',    name: 'Strategy',       icon: Compass,         resource: 'tab:strategy' },
  { id: 'links',       name: 'Marketing',      icon: LinkIcon,        resource: 'tab:links' },
];

const CurrencyInput = ({ 
  name, 
  value, 
  onChange, 
  placeholder = "0.00", 
  disabled = false, 
  style = {}, 
  className = "" 
}: { 
  name: string; 
  value: any; 
  onChange: (e: any) => void; 
  placeholder?: string; 
  disabled?: boolean; 
  style?: React.CSSProperties; 
  className?: string; 
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState("");

  useEffect(() => {
    if (!isFocused) {
      if (value === null || value === undefined || value === "") {
        setLocalValue("");
      } else {
        const num = Number(value);
        if (isNaN(num)) {
          setLocalValue("");
        } else {
          setLocalValue(new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(num));
        }
      }
    } else {
      setLocalValue(value === null || value === undefined ? "" : String(value));
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(value === null || value === undefined ? "" : String(value));
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value === null || value === undefined || value === "") {
      setLocalValue("");
    } else {
      const num = Number(value);
      if (isNaN(num)) {
        setLocalValue("");
      } else {
        setLocalValue(new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(num));
      }
    }
  };

  const handleChangeLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);
    
    const cleanVal = val.replace(/[^0-9.-]/g, '');
    onChange({
      target: {
        name,
        value: cleanVal,
        type: 'number'
      }
    } as any);
  };

  return (
    <div className="currency-input-wrapper" style={{ width: '100%' }}>
      <span className="currency-symbol">$</span>
      <input
        type={isFocused ? "number" : "text"}
        step="any"
        name={name}
        value={localValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChangeLocal}
        placeholder={placeholder}
        disabled={disabled}
        className={className || "input-field currency"}
        style={{
          ...style,
          textAlign: isFocused ? 'left' : 'right',
          paddingRight: isFocused ? '0.75rem' : '1.25rem'
        }}
      />
    </div>
  );
};

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
  const [partners, setPartners] = useState<any[]>([]);
  
  // Tax specific state
  const [taxes, setTaxes] = useState<any[]>([]);
  const [taxForm, setTaxForm] = useState<any>({ due_date: '', pay_date: '', received_date: '', perc_iron: '', perc_inv: '', link_proof: '', link_bill: '', link_advalorem: '', value: '', vigency: '', recurrence: '', status: '', type_tax: '' });
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [showTaxForm, setShowTaxForm] = useState(false);

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
      return TABS_CONFIG.filter(tab => {
        const p = permissions[tab.resource];
        // If no permission entry exists for this resource, default to visible.
        // Only hide if an entry exists AND can_view is explicitly false.
        return p === undefined ? true : p.can_view;
      });
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

      const [permsResult, propertyResult, partnersResult] = await Promise.all([
        getCurrentUserPermissions(),
        supabase.from('ls_assets').select(`
          *,
          ls_county ( name, state ),
          ls_priority ( name, color ),
          ls_property_type ( name )
        `).eq('id', id).single(),
        supabase.from('ls_users_metadata').select('id, full_name').eq('user_type', 'partner').order('full_name')
      ]);
      setPartners(partnersResult.data || []);

      setPermissions(permsResult);

      if (propertyResult.data) {
        const formatted = { ...propertyResult.data };
        if (formatted.auction_date) formatted.auction_date = new Date(formatted.auction_date).toISOString().slice(0, 16);
        if (formatted.acquisition_date) formatted.acquisition_date = new Date(formatted.acquisition_date).toISOString().slice(0, 16);
        if (formatted.tax_pay_dead) formatted.tax_pay_dead = new Date(formatted.tax_pay_dead).toISOString().slice(0, 10);
        
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

      // Load tax records
      const { data: taxRecordsData } = await supabase
        .from('ls_asset_tax')
        .select('*')
        .eq('asset_id', id)
        .order('created_at', { ascending: false });
      setTaxes(taxRecordsData || []);

      setLoading(false);
    }
    
    if (id) loadData();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setProperty((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleOwnerChange = (value: string) => {
    if (value === 'ironclad') {
      setProperty((prev: any) => ({ ...prev, owner_type: 'ironclad', owner_partner_id: '' }));
    } else {
      setProperty((prev: any) => ({ ...prev, owner_type: 'partner', owner_partner_id: value }));
    }
  };

  const renderLinkInput = (label: string, name: string, value: string, placeholder: string, style?: React.CSSProperties) => {
    const getHref = (url: string) => {
      if (!url) return "";
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      return `https://${url}`;
    };

    return (
      <div className="input-group" style={style}>
        <label className="input-label">{label}</label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input 
            type="url" 
            name={name} 
            value={value || ""} 
            onChange={handleChange} 
            className="input-field" 
            placeholder={placeholder} 
            style={{ paddingRight: value ? '2.5rem' : '0.75rem' }} 
          />
          {value && (
            <a 
              href={getHref(value)} 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ 
                position: 'absolute', 
                right: '0.375rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '28px', 
                height: '28px', 
                borderRadius: '6px', 
                color: '#64748b', 
                backgroundColor: '#f1f5f9',
                transition: 'all 0.2s ease-in-out',
                border: '1px solid #e2e8f0',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#10b981';
                e.currentTarget.style.backgroundColor = '#ecfdf5';
                e.currentTarget.style.borderColor = '#a7f3d0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748b';
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
              title={`Open ${label}`}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    );
  };

  const renderCostTableRow = (label: string, desc: string, costName: string, toggleName: string, IconComponent: any) => {
    return (
      <div 
        className="cost-table-row"
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '2fr 1fr 1.5fr', 
          alignItems: 'center', 
          padding: '0.875rem 1.25rem', 
          borderBottom: '1px solid #f1f5f9',
          transition: 'background-color 0.15s ease'
        }}
      >
        {/* Coluna 1: Nome, Descrição e Ícone */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            width: '32px', 
            height: '32px', 
            borderRadius: '8px', 
            backgroundColor: '#f1f5f9', 
            color: '#475569' 
          }}>
            <IconComponent className="w-4 h-4" />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{label}</div>
            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.1rem' }}>{desc}</div>
          </div>
        </div>

        {/* Coluna 2: Toggle / Checkbox */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <input 
            type="checkbox" 
            id={toggleName} 
            name={toggleName} 
            checked={!!property[toggleName]} 
            onChange={handleChange} 
            className="checkbox-input" 
            style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
          />
        </div>

        {/* Coluna 3: Input de Moeda (Sempre editável) */}
        <div className="input-group" style={{ margin: 0 }}>
          <CurrencyInput 
            name={costName} 
            value={property[costName]} 
            onChange={handleChange} 
            placeholder="0.00"
            style={{
              backgroundColor: '#ffffff',
              cursor: 'text',
              transition: 'all 0.2s',
              border: '1px solid #cbd5e1'
            }}
          />
        </div>
      </div>
    );
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
        'county_appraisal', 'online_appraisal', 'sqft_price_reference', 'house_price',
        'warrantydeedtransfer', 'titleclaim_action', 'surveyor', 'land_clearing', 
        'fencing_gate', 'preapproval_review', 'investment_total'
      ];
      numericFields.forEach(f => {
        if (payload[f] === "" || payload[f] === undefined) payload[f] = null;
        else payload[f] = Number(payload[f]);
      });

      const uuidFields = [
        'origem_id', 'priority_id', 'county_id', 'auction_type_id',
        'auction_model_id', 'property_type_id', 'fema_id', 'wetlands_id',
        'debit_id', 'gismap_id', 'prop_access_id', 'road_access_id', 'ref_construction_id',
        'owner_partner_id'
      ];
      uuidFields.forEach(f => {
        if (!payload[f]) payload[f] = null;
      });

      if (!payload.auction_date) payload.auction_date = null;
      if (!payload.acquisition_date) payload.acquisition_date = null;
      if (!payload.tax_pay_dead) payload.tax_pay_dead = null;

      Object.keys(payload).forEach(key => {
        if (payload[key] === "") {
          payload[key] = null;
        }
      });

      const { error } = await supabase.from('ls_assets').update(payload).eq('id', id);
      if (error) throw error;
      
      window.location.href = `/properties?action=updated`;
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

  const resetTaxForm = () => {
    setTaxForm({ due_date: '', pay_date: '', received_date: '', perc_iron: '', perc_inv: '', link_proof: '', link_bill: '', link_advalorem: '', value: '', vigency: '', recurrence: '', status: '', type_tax: '' });
    setEditingTaxId(null);
    setShowTaxForm(false);
  };

  const handleTaxFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTaxForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSaveTax = async () => {
    const payload: any = {
      asset_id: id,
      due_date: taxForm.due_date || null,
      pay_date: taxForm.pay_date || null,
      received_date: taxForm.received_date || null,
      perc_iron: taxForm.perc_iron !== '' ? Number(taxForm.perc_iron) : null,
      perc_inv: taxForm.perc_inv !== '' ? Number(taxForm.perc_inv) : null,
      link_proof: taxForm.link_proof || null,
      link_bill: taxForm.link_bill || null,
      link_advalorem: taxForm.link_advalorem || null,
      value: taxForm.value !== '' ? Number(String(taxForm.value).replace(/[^0-9.-]/g, '')) : null,
      vigency: taxForm.vigency || null,
      recurrence: taxForm.recurrence || null,
      status: taxForm.status || null,
      type_tax: taxForm.type_tax || null,
    };

    if (editingTaxId) {
      const { data, error } = await supabase.from('ls_asset_tax').update(payload).eq('id', editingTaxId).select('*').single();
      if (!error && data) { setTaxes(taxes.map(t => t.id === editingTaxId ? data : t)); resetTaxForm(); }
      else if (error) alert('Error updating tax record: ' + error.message);
    } else {
      const { data, error } = await supabase.from('ls_asset_tax').insert([payload]).select('*').single();
      if (!error && data) { setTaxes([data, ...taxes]); resetTaxForm(); }
      else if (error) alert('Error saving tax record: ' + error.message);
    }
  };

  const handleDeleteTax = async (taxId: string) => {
    if (!confirm('Delete this tax record?')) return;
    const { error } = await supabase.from('ls_asset_tax').delete().eq('id', taxId);
    if (!error) setTaxes(taxes.filter(t => t.id !== taxId));
  };

  const handleEditTax = (tax: any) => {
    setTaxForm({
      due_date: tax.due_date || '',
      pay_date: tax.pay_date || '',
      received_date: tax.received_date || '',
      perc_iron: tax.perc_iron ?? '',
      perc_inv: tax.perc_inv ?? '',
      link_proof: tax.link_proof || '',
      link_bill: tax.link_bill || '',
      link_advalorem: tax.link_advalorem || '',
      value: tax.value ?? '',
      vigency: tax.vigency || '',
      recurrence: tax.recurrence || '',
      status: tax.status || '',
      type_tax: tax.type_tax || '',
    });
    setEditingTaxId(tax.id);
    setShowTaxForm(true);
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
              
              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>ID and Qualities</h3>
                <div className="form-grid col-3">
                  <div className="input-group">
                    <label className="input-label">Origin</label>
                    <select name="origem_id" value={property.origem_id} onChange={handleChange} className="input-field" disabled>
                      <option value="">Select Origin...</option>
                      {lookups.ls_origem?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Acquisition Date</label>
                    <input type="datetime-local" name="acquisition_date" value={property.acquisition_date} onChange={handleChange} className="input-field" disabled />
                  </div>
                  <div className="input-group">
                    <label className="input-label">County</label>
                    <select name="county_id" value={property.county_id} onChange={handleChange} className="input-field" disabled>
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
                    <input type="text" name="coordinates" value={property.coordinates} onChange={handleChange} className="input-field" readOnly />
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
                    <input type="text" name="parcel_number" value={property.parcel_number} onChange={handleChange} className="input-field" readOnly />
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
                    <select name="gismap_id" value={property.gismap_id} onChange={handleChange} className="input-field" disabled>
                      <option value="">Select Map...</option>
                      {lookups.ls_gismap?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Wetlands</label>
                    <select name="wetlands_id" value={property.wetlands_id} onChange={handleChange} className="input-field" disabled>
                      <option value="">Select Wetlands...</option>
                      {lookups.ls_wetlands?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">FEMA Zone</label>
                    <select name="fema_id" value={property.fema_id} onChange={handleChange} className="input-field" disabled>
                      <option value="">Select FEMA...</option>
                      {lookups.ls_fema?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Debit Status</label>
                    <select name="debit_id" value={property.debit_id} onChange={handleChange} className="input-field" disabled>
                      <option value="">Select Debit...</option>
                      {lookups.ls_debit?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Property Type</label>
                    <select name="property_type_id" value={property.property_type_id} onChange={handleChange} className="input-field" disabled>
                      <option value="">Select Type...</option>
                      {lookups.ls_property_type?.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Property Access</label>
                    <select name="prop_access_id" value={property.prop_access_id} onChange={handleChange} className="input-field" disabled>
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

                  {renderLinkInput("Regrid Link", "link_regrid", property.link_regrid, "https://regrid.com/...", { gridColumn: 'span 2' })}
                  <div className="input-group"></div>

                  <div className="input-group" style={{ gridColumn: 'span 3' }}>
                    <label className="input-label">Observations</label>
                    <textarea name="observation" value={property.observation} onChange={handleChange} className="input-field" rows={3} style={{ resize: 'vertical' }} />
                  </div>
                </div>
              </div>

              {/* Ownership */}
              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Ownership</h3>
                <div className="form-grid col-3">
                  <div className="input-group">
                    <label className="input-label">Property Owner</label>
                    <select
                      value={property.owner_type === 'partner' ? (property.owner_partner_id || '') : 'ironclad'}
                      onChange={(e) => handleOwnerChange(e.target.value)}
                      className="input-field"
                    >
                      <option value="ironclad">IronClad</option>
                      {partners.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>
                  {property.owner_type === 'partner' && (
                    <div className="input-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f59e0b', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        Assigned to Partner
                      </span>
                    </div>
                  )}
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

              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Amenities in Region</h3>
                
                <div style={{ backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
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
          </div>
        )}

          {/* VALUES TAB */}
          {activeTab === 'values' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Valuations & References</h2>
                <p className="section-desc">Track appraisal history, pricing evolution, bidding limits, and reference documents.</p>
              </div>

              {/* Group 1: Evolution */}
              <div style={{ margin: '0 1rem 2.5rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Evolution</h3>
                <div className="form-grid col-3">
                  <div className="input-group">
                    <label className="input-label">County Appraisal ($)</label>
                    <CurrencyInput name="county_appraisal" value={property.county_appraisal} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Size (Acres/SqFt)</label>
                    <input type="number" step="any" name="size" value={property.size} onChange={handleChange} className="input-field" placeholder="0.00" />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Appraisal Min ($)</label>
                    <CurrencyInput name="appraisal_min" value={property.appraisal_min} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Appraisal Avg ($)</label>
                    <CurrencyInput name="appraisal_avg" value={property.appraisal_avg} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Appraisal Max ($)</label>
                    <CurrencyInput name="appraisal_max" value={property.appraisal_max} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">House Price ($)</label>
                    <CurrencyInput name="house_price" value={property.house_price} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">SqFt Price Ref ($)</label>
                    <CurrencyInput name="sqft_price_reference" value={property.sqft_price_reference} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Min Bid ($)</label>
                    <CurrencyInput name="min_bid" value={property.min_bid} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Max Bid ($)</label>
                    <CurrencyInput name="max_bid" value={property.max_bid} onChange={handleChange} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Max Bid Internal ($)</label>
                    <CurrencyInput name="max_bid_internal" value={property.max_bid_internal} onChange={handleChange} />
                  </div>
                </div>
              </div>

              {/* Group 2: References */}
              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>References</h3>
                <div className="form-grid col-2">
                  {renderLinkInput("Source Link", "link_sources", property.link_sources, "https://...")}
                  {renderLinkInput("House Source Link", "link_house_sources", property.link_house_sources, "https://...")}
                </div>
              </div>
            </div>
          )}

          {/* SALES TAB */}
          {activeTab === 'sales' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Sales</h2>
                <p className="section-desc">Sales information and records for this property.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
                <ShoppingCart className="w-12 h-12" style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>Coming Soon</p>
                <p style={{ fontSize: '0.85rem' }}>Sales content will be added here.</p>
              </div>
            </div>
          )}

          {/* STRATEGY TAB */}
          {activeTab === 'strategy' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Strategy</h2>
                <p className="section-desc">Strategic planning and notes for this property.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
                <Compass className="w-12 h-12" style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>Coming Soon</p>
                <p style={{ fontSize: '0.85rem' }}>Strategy content will be added here.</p>
              </div>
            </div>
          )}

          {/* MARKETING TAB */}
          {activeTab === 'links' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Marketing</h2>
                <p className="section-desc">External data sources, research links, and property observations.</p>
              </div>
              <div className="form-grid col-2" style={{ padding: '0 1rem' }}>
                {renderLinkInput("Google Earth Link", "link_earth", property.link_earth, "https://earth.google.com/...", { gridColumn: 'span 2' })}
                {renderLinkInput("Other Sources Link", "link_sources", property.link_sources, "https://...")}
                {renderLinkInput("House Sources Link", "link_house_sources", property.link_house_sources, "https://zillow.com/...")}
                {renderLinkInput("Video Link", "link_video", property.link_video, "https://youtube.com/...")}
                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label className="input-label">Surrounds Notes</label>
                  <textarea name="surrounds" value={property.surrounds} onChange={handleChange} className="input-field" rows={4} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )}

          {/* ACQUISITION & DEVELOPMENT TAB */}
          {activeTab === 'acquisition' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Acquisition & Development</h2>
                <p className="section-desc">Manage property development costs, acquisition toggles, sales statuses, improvements, and modular options.</p>
              </div>

              <div style={{ margin: '0 1rem 2.5rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Cost Estimates & Clearances</h3>
                
                <div style={{ 
                  backgroundColor: '#ffffff', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '12px', 
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
                }}>
                  {/* Table Header */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '2fr 1fr 1.5fr', 
                    backgroundColor: '#f8fafc', 
                    padding: '0.75rem 1.25rem', 
                    borderBottom: '2px solid #e2e8f0',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    <div>Item / Service</div>
                    <div style={{ textAlign: 'center' }}>Required / Check</div>
                    <div style={{ textAlign: 'right', paddingRight: '1rem' }}>Estimated Cost ($)</div>
                  </div>

                  {/* Table Rows */}
                  {renderCostTableRow("Warranty Deed Transfer", "Deed preparation and recording fees", "warrantydeedtransfer", "tg_warrantydeedtransfer", FileText)}
                  {renderCostTableRow("Title Claim Action", "Clearing title or legal fees", "titleclaim_action", "tg_titleclaim_action", Scale)}
                  {renderCostTableRow("Surveyor Cost", "Boundary mapping and layout marking", "surveyor", "tg_surveyor", Compass)}
                  {renderCostTableRow("Land Clearing", "Tree removal and grading", "land_clearing", "tg_land_clearing", Trees)}
                  {renderCostTableRow("Fencing & Gate", "Perimeter fence and security gate", "fencing_gate", "tg_fencing_gate", Lock)}
                  {renderCostTableRow("Preapproval Review", "Zoning review and compliance", "preapproval_review", "tg_preapproval_review", CheckSquare)}
                </div>
              </div>

              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Development Details & Total Investment</h3>
                <div className="form-grid col-2">
                  <div className="input-group">
                    <label className="input-label">Total Investment ($)</label>
                    <CurrencyInput name="investment_total" value={property.investment_total} onChange={handleChange} />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Sale Status</label>
                    <select name="sale_status" value={property.sale_status || ""} onChange={handleChange} className="input-field">
                      <option value="">Select Status...</option>
                      <option value="Pending">Pending</option>
                      <option value="Listed">Listed</option>
                      <option value="Awaiting Purchase">Awaiting Purchase</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Improvements</label>
                    <select name="improvements" value={property.improvements || ""} onChange={handleChange} className="input-field">
                      <option value="">Select Improvements...</option>
                      <option value="No Improvements">No Improvements</option>
                      <option value="Well only">Well only</option>
                      <option value="Septic only">Septic only</option>
                      <option value="Well & Septic">Well & Septic</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Mobile Home Allowed</label>
                    <select name="mh_allowed" value={property.mh_allowed || ""} onChange={handleChange} className="input-field">
                      <option value="">Select Option...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Modular Only">Modular Only</option>
                    </select>
                  </div>

                  <div className="input-group" style={{ gridColumn: 'span 2' }}>
                    <label className="input-label">Utilities Notes</label>
                    <textarea 
                      name="utilities" 
                      value={property.utilities || ""} 
                      onChange={handleChange} 
                      className="input-field" 
                      rows={3} 
                      style={{ resize: 'vertical' }} 
                      placeholder="Describe electrical, gas, sewer connection notes..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENTATION TAB */}
          {activeTab === 'docs' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Documentation</h2>
                <p className="section-desc">Manage essential property deeds, surveys, planning designs, and tax deadlines.</p>
              </div>
              
              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Deeds, Surveys and Plans</h3>
                <div className="form-grid col-2">
                  {renderLinkInput("Tax Deed Link", "tax_deed", property.tax_deed, "https://...")}
                  {renderLinkInput("Warranty Deed Link", "warranty_deed", property.warranty_deed, "https://...")}
                  {renderLinkInput("Survey Link", "survey", property.survey, "https://...")}
                  {renderLinkInput("Site Plan Link", "site_plan", property.site_plan, "https://...")}
                  
                  <div className="input-group">
                    <label className="input-label">Tax Payment Deadline</label>
                    <input 
                      type="date" 
                      name="tax_pay_dead" 
                      value={property.tax_pay_dead} 
                      onChange={handleChange} 
                      className="input-field" 
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAX TAB */}
          {activeTab === 'tax' && (
            <div className="form-tab">
              <div className="tab-section-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 className="section-title">Tax Records</h2>
                  <p className="section-desc">Manage tax, fees and HOA/POA records associated with this property.</p>
                </div>
                {!showTaxForm && (
                  <button
                    onClick={() => { resetTaxForm(); setShowTaxForm(true); }}
                    className="save-btn"
                    style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    <Plus className="w-4 h-4" /> Add Record
                  </button>
                )}
              </div>

              <div style={{ margin: '0 1rem 1rem 1rem' }}>

                {/* ── Add / Edit Form ── */}
                {showTaxForm && (
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                        {editingTaxId ? 'Edit Tax Record' : 'New Tax Record'}
                      </h4>
                      <button onClick={resetTaxForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Row 1 – Classification */}
                    <div className="form-grid col-4" style={{ marginBottom: '0.75rem' }}>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Type</label>
                        <select name="type_tax" value={taxForm.type_tax} onChange={handleTaxFormChange} className="input-field">
                          <option value="">Select...</option>
                          <option value="Annual Tax">Annual Tax</option>
                          <option value="Fees">Fees</option>
                          <option value="HOA/POA">HOA/POA</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Vigency</label>
                        <select name="vigency" value={taxForm.vigency} onChange={handleTaxFormChange} className="input-field">
                          <option value="">Select...</option>
                          <option value="2025">2025</option>
                          <option value="2026">2026</option>
                          <option value="2027">2027</option>
                          <option value="2028">2028</option>
                          <option value="2029">2029</option>
                          <option value="2030">2030</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Recurrence</label>
                        <select name="recurrence" value={taxForm.recurrence} onChange={handleTaxFormChange} className="input-field">
                          <option value="">Select...</option>
                          <option value="Annual">Annual</option>
                          <option value="Single">Single</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Status</label>
                        <select name="status" value={taxForm.status} onChange={handleTaxFormChange} className="input-field">
                          <option value="">Select...</option>
                          <option value="On Time">On Time</option>
                          <option value="Over Due">Over Due</option>
                        </select>
                      </div>
                    </div>

                    {/* Row 2 – Dates */}
                    <div className="form-grid col-3" style={{ marginBottom: '0.75rem' }}>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Due Date</label>
                        <input type="date" name="due_date" value={taxForm.due_date} onChange={handleTaxFormChange} className="input-field" />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Pay Date</label>
                        <input type="date" name="pay_date" value={taxForm.pay_date} onChange={handleTaxFormChange} className="input-field" />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Received Date</label>
                        <input type="date" name="received_date" value={taxForm.received_date} onChange={handleTaxFormChange} className="input-field" />
                      </div>
                    </div>

                    {/* Row 3 – Value & Percentages */}
                    <div className="form-grid col-3" style={{ marginBottom: '0.75rem' }}>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Value ($)</label>
                        <CurrencyInput name="value" value={taxForm.value} onChange={(e: any) => setTaxForm((p: any) => ({ ...p, value: e.target.value }))} />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">% Ironclad</label>
                        <input type="number" step="any" name="perc_iron" value={taxForm.perc_iron} onChange={handleTaxFormChange} className="input-field" placeholder="0.00" />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">% Investor</label>
                        <input type="number" step="any" name="perc_inv" value={taxForm.perc_inv} onChange={handleTaxFormChange} className="input-field" placeholder="0.00" />
                      </div>
                    </div>

                    {/* Row 4 – Links */}
                    <div className="form-grid col-3" style={{ marginBottom: '1.25rem' }}>
                      {(['link_bill', 'link_proof', 'link_advalorem'] as const).map((field) => {
                        const labels: Record<string, string> = { link_bill: 'Bill Link', link_proof: 'Proof Link', link_advalorem: 'Ad Valorem Link' };
                        const val = taxForm[field] || '';
                        const getHref = (u: string) => u.startsWith('http') ? u : `https://${u}`;
                        return (
                          <div className="input-group" key={field} style={{ margin: 0 }}>
                            <label className="input-label">{labels[field]}</label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <input type="url" name={field} value={val} onChange={handleTaxFormChange} className="input-field" placeholder="https://..." style={{ paddingRight: val ? '2.5rem' : '0.75rem' }} />
                              {val && (
                                <a href={getHref(val)} target="_blank" rel="noopener noreferrer" style={{ position: 'absolute', right: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', color: '#64748b', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Form Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button onClick={resetTaxForm} className="btn-secondary" style={{ padding: '0.5rem 1.25rem' }}>Cancel</button>
                      <button onClick={handleSaveTax} className="primary-btn" style={{ padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Save className="w-4 h-4" /> {editingTaxId ? 'Update Record' : 'Save Record'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Records Table ── */}
                {taxes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                    <Receipt className="w-10 h-10" style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600 }}>No tax records yet.</p>
                    <p style={{ fontSize: '0.85rem' }}>Click "Add Record" to register the first entry.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          {['Type', 'Vigency', 'Status', 'Value', 'Due Date', 'Pay Date', 'Rec. Date', '% Iron', '% Inv', 'Links', ''].map((h, i) => (
                            <th key={i} style={{ padding: '0.75rem 1rem', textAlign: i >= 7 && i <= 8 ? 'right' : i === 9 ? 'center' : 'left', fontWeight: 700, fontSize: '0.7rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {taxes.map((tax, idx) => {
                          const statusName = tax.status || '';
                          const statusColor = statusName === 'Over Due' ? { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' } : statusName === 'On Time' ? { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' } : { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
                          const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
                          const fmtMoney = (v: any) => v != null && v !== '' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v)) : '—';
                          return (
                            <tr key={tax.id} style={{ borderBottom: idx < taxes.length - 1 ? '1px solid #f1f5f9' : 'none', backgroundColor: editingTaxId === tax.id ? '#fffbeb' : 'white' }}>
                              <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{tax.type_tax || '—'}</td>
                              <td style={{ padding: '0.875rem 1rem', color: '#475569', whiteSpace: 'nowrap' }}>{tax.vigency || '—'}</td>
                              <td style={{ padding: '0.875rem 1rem', whiteSpace: 'nowrap' }}>
                                {statusName ? (
                                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}` }}>{statusName}</span>
                                ) : '—'}
                              </td>
                              <td style={{ padding: '0.875rem 1rem', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(tax.value)}</td>
                              <td style={{ padding: '0.875rem 1rem', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(tax.due_date)}</td>
                              <td style={{ padding: '0.875rem 1rem', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(tax.pay_date)}</td>
                              <td style={{ padding: '0.875rem 1rem', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(tax.received_date)}</td>
                              <td style={{ padding: '0.875rem 1rem', color: '#475569', textAlign: 'right', whiteSpace: 'nowrap' }}>{tax.perc_iron != null ? `${tax.perc_iron}%` : '—'}</td>
                              <td style={{ padding: '0.875rem 1rem', color: '#475569', textAlign: 'right', whiteSpace: 'nowrap' }}>{tax.perc_inv != null ? `${tax.perc_inv}%` : '—'}</td>
                              <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                                  {[{ url: tax.link_bill, label: 'Bill' }, { url: tax.link_proof, label: 'Proof' }, { url: tax.link_advalorem, label: 'Ad Val.' }].map(({ url, label }) =>
                                    url ? (
                                      <a key={label} href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" title={label}
                                        style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                                        {label}
                                      </a>
                                    ) : null
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.875rem 1rem', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                  <button onClick={() => handleEditTax(tax)} title="Edit" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => handleDeleteTax(tax.id)} title="Delete" style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

      <div className="form-actions-bar">
        <button className="btn-secondary" onClick={() => router.push('/properties')}>
          <X className="w-4 h-4" />
          Cancel
        </button>
        
        <div style={{ flex: 1 }}></div>

        <button className="primary-btn" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
