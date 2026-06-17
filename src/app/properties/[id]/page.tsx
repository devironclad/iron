"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import NextImage from "next/image";
import { formatPropId } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
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
  Receipt,
  Handshake,
  BadgeCheck,
  CalendarCheck,
  User,
  Mail,
  Phone,
  Home,
  UserCog,
  CheckCircle2
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hasPermission, getCurrentUserPermissions } from "@/lib/permissions";
import "../../auctions/new/form.css"; // Keep the styles
import "./details.css"; // Keep the tabs structure styling

const MARKETING_FIELDS = [
  'marketing_report', 'library', 'website_video_copy', 'video_3d_copy',
  'short_form_copy', 'before_video', 'after_video', 'video_3d',
  'product_page', 'zillow_listing', 'facebook_listing', 'edited_photos',
  'website_video', 'short_form_videos',
] as const;

const BLOCKED_DECIMAL_KEYS = new Set(['.', ',', 'e', 'E', '+', '-']);
const handleBlockDecimal = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (BLOCKED_DECIMAL_KEYS.has(e.key)) e.preventDefault();
};

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
  const searchParams = useSearchParams();
  const id = params.id;
  const source = searchParams.get('source');
  const returnTo = searchParams.get('returnTo')
    ? decodeURIComponent(searchParams.get('returnTo')!)
    : `/properties${source ? `?source=${source}` : ''}`;

  function pushReturn(extra: Record<string, string> = {}) {
    const [base, search] = returnTo.split('?');
    const p = new URLSearchParams(search || '');
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    router.push(`${base}?${p.toString()}`);
  }

  const [activeTab, setActiveTab] = useState('research');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const originalPropertyRef = useRef<any>(null);
  const paidBidMounted = useRef(false);
  const [savedOk, setSavedOk] = useState(false);
  const [wasSaved, setWasSaved] = useState(false);
  const [property, setProperty] = useState<any>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [lookups, setLookups] = useState<Record<string, any[]>>({});
  const [permissions, setPermissions] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  
  // Tax specific state
  const [taxes, setTaxes] = useState<any[]>([]);
  const [taxForm, setTaxForm] = useState<any>({ due_date: '', pay_date: '', received_date: '', perc_iron: '', perc_inv: '', link_proof: '', link_bill: '', link_advalorem: '', value: '', vigency: '', recurrence: '', status: '', type_tax: '' });
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxSavedOk, setTaxSavedOk] = useState(false);

  // Marketing 1:1 record state
  const [marketing, setMarketing] = useState<any>({
    marketing_report: '', library: '', website_video_copy: '', video_3d_copy: '',
    short_form_copy: '', before_video: '', after_video: '', video_3d: '',
    product_page: '', zillow_listing: '', facebook_listing: '', edited_photos: '',
    website_video: '', short_form_videos: ''
  });

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

  // Derive the correct resource key based on where the user came from
  const propertiesResource = source === 'broker' ? 'page:properties:broker' : source === 'partners' ? 'page:properties:partners' : 'page:properties:ironclad';
  const canEdit = permissions !== null && hasPermission(permissions, propertiesResource, 'edit');

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

  // Whether the current active tab allows editing.
  // Tab-level permissions are INDEPENDENT of page-level:
  //   - If a tab has an explicit permission → use it directly (overrides page-level)
  //   - If no tab permission is defined → fall back to page-level canEdit
  // Uses tab.resource (from TABS_CONFIG) as the key, not `tab:${activeTab}`,
  // because some tabs share a resource key (e.g. 'research' maps to 'tab:general').
  const tabCanEdit = useMemo(() => {
    if (!permissions) return false;
    const activeTabConfig = TABS_CONFIG.find(t => t.id === activeTab);
    const resourceKey = activeTabConfig?.resource ?? `tab:${activeTab}`;
    const tabPerm = permissions[resourceKey];
    if (tabPerm !== undefined) return tabPerm.can_edit;
    return canEdit; // no tab-specific rule → inherit page-level
  }, [permissions, activeTab, canEdit]);

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
        originalPropertyRef.current = { ...formatted };
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
      const sortedAmenities = (amenData || []).sort((a: any, b: any) => {
        const catA = a.ls_amenity_type?.ls_amenity_category?.name || '';
        const catB = b.ls_amenity_type?.ls_amenity_category?.name || '';
        if (catA !== catB) return catA.localeCompare(catB);
        return (a.ls_amenity_type?.name || '').localeCompare(b.ls_amenity_type?.name || '');
      });
      setAmenities(sortedAmenities);

      const [catData, typeData] = await Promise.all([
        supabase.from('ls_amenity_category').select('*').order('name'),
        supabase.from('ls_amenity_type').select('*').order('name')
      ]);
      setAmenityCategories(catData.data || []);
      setAmenityTypes(typeData.data || []);

      // Load tax records + marketing record in parallel (independent queries)
      const [taxResult, mktResult] = await Promise.all([
        supabase.from('ls_asset_tax').select('*').eq('asset_id', id).order('created_at', { ascending: false }),
        supabase.from('ls_asset_marketing').select('*').eq('asset_id', id).maybeSingle(),
      ]);
      setTaxes(taxResult.data || []);
      if (mktResult.data) {
        const mktFormatted: any = {};
        MARKETING_FIELDS.forEach(f => { mktFormatted[f] = mktResult.data[f] ?? ''; });
        setMarketing(mktFormatted);
      }

      setLoading(false);
    }
    
    if (id) loadData();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setProperty((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleMarketingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMarketing((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleOwnerChange = (value: string) => {
    if (value === 'ironclad') {
      setProperty((prev: any) => ({ ...prev, owner_type: 'ironclad', owner_partner_id: '' }));
    } else {
      setProperty((prev: any) => ({ ...prev, owner_type: 'partner', owner_partner_id: value }));
    }
  };

  const renderLinkInput = (label: string, name: string, value: string, placeholder: string, style?: React.CSSProperties, onChangeFn?: React.ChangeEventHandler<HTMLInputElement>) => {
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
            onChange={onChangeFn ?? handleChange}
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

  // Auto-calculate investment_total = paid_bid + active cost toggles + doc_fees
  useEffect(() => {
    if (!property) return;
    const costItems = [
      { cost: 'warrantydeedtransfer', toggle: 'tg_warrantydeedtransfer' },
      { cost: 'titleclaim_action',    toggle: 'tg_titleclaim_action' },
      { cost: 'surveyor',             toggle: 'tg_surveyor' },
      { cost: 'land_clearing',        toggle: 'tg_land_clearing' },
      { cost: 'fencing_gate',         toggle: 'tg_fencing_gate' },
      { cost: 'preapproval_review',   toggle: 'tg_preapproval_review' },
    ];
    const toggleSum = costItems.reduce((acc, { cost, toggle }) =>
      acc + (property[toggle] ? (Number(property[cost]) || 0) : 0), 0);
    const total = (Number(property.paid_bid) || 0) + toggleSum + (Number(property.doc_fees) || 0);
    setProperty((prev: any) => ({ ...prev, investment_total: total }));
  }, [
    property?.paid_bid, property?.doc_fees,
    property?.warrantydeedtransfer, property?.tg_warrantydeedtransfer,
    property?.titleclaim_action,    property?.tg_titleclaim_action,
    property?.surveyor,             property?.tg_surveyor,
    property?.land_clearing,        property?.tg_land_clearing,
    property?.fencing_gate,         property?.tg_fencing_gate,
    property?.preapproval_review,   property?.tg_preapproval_review,
  ]);

  // Auto-seed paid_bid_inv = paid_bid * 2 whenever paid_bid changes (user may still override)
  // Skip on initial load to preserve manually loaded values in the database
  useEffect(() => {
    if (!property) return;
    if (!paidBidMounted.current) { paidBidMounted.current = true; return; }
    const auto = (Number(property.paid_bid) || 0) * 2;
    setProperty((prev: any) => ({ ...prev, paid_bid_inv: auto }));
  }, [property?.paid_bid]);

  // Auto-calculate investment_total_inv = paid_bid_inv + doc_fees_inv + closing_fess_inv + active strategy cost toggles
  useEffect(() => {
    if (!property) return;
    const strategyItems = [
      { cost: 'warrantydeedtransfer_stg', toggle: 'tg_warrantydeedtransfer_stg' },
      { cost: 'titleclaim_action_stg',    toggle: 'tg_titleclaim_action_stg' },
      { cost: 'surveyor_stg',             toggle: 'tg_surveyor_stg' },
      { cost: 'land_clearing_stg',        toggle: 'tg_land_clearing_stg' },
      { cost: 'fencing_gate_stg',         toggle: 'tg_fencing_gate_stg' },
      { cost: 'preapproval_review_stg',   toggle: 'tg_preapproval_review_stg' },
    ];
    const strategySum = strategyItems.reduce((acc, { cost, toggle }) =>
      acc + (property[toggle] ? (Number(property[cost]) || 0) : 0), 0);
    const total = (Number(property.paid_bid_inv) || 0)
      + (Number(property.doc_fees_inv) || 0)
      + (Number(property.closing_fess_inv) || 0)
      + strategySum;
    setProperty((prev: any) => ({ ...prev, investment_total_inv: total }));
  }, [
    property?.paid_bid_inv,
    property?.doc_fees_inv,
    property?.closing_fess_inv,
    property?.warrantydeedtransfer_stg, property?.tg_warrantydeedtransfer_stg,
    property?.titleclaim_action_stg,    property?.tg_titleclaim_action_stg,
    property?.surveyor_stg,             property?.tg_surveyor_stg,
    property?.land_clearing_stg,        property?.tg_land_clearing_stg,
    property?.fencing_gate_stg,         property?.tg_fencing_gate_stg,
    property?.preapproval_review_stg,   property?.tg_preapproval_review_stg,
  ]);

  // Auto-calculate financed_owner = (monthly_installment * 72) + investment_total
  useEffect(() => {
    if (!property) return;
    const pmt = Number(property.monthly_installment) || 0;
    const inv = Number(property.investment_total) || 0;
    if (pmt <= 0) {
      setProperty((prev: any) => ({ ...prev, financed_owner: null }));
      return;
    }
    const total = parseFloat(((pmt * 72) + inv).toFixed(2));
    setProperty((prev: any) => ({ ...prev, financed_owner: total }));
  }, [property?.monthly_installment, property?.investment_total]);

  // Auto-calculate monthly_installment using PMT formula: rate=12% a.a., n=72 months, PV=(sale_price - investment_total)
  useEffect(() => {
    if (!property) return;
    const pv = (Number(property.sale_price) || 0) - (Number(property.investment_total) || 0);
    if (pv <= 0) {
      setProperty((prev: any) => ({ ...prev, monthly_installment: null }));
      return;
    }
    const r = 0.12 / 12;
    const n = 72;
    const pmt = (pv * r) / (1 - Math.pow(1 + r, -n));
    setProperty((prev: any) => ({ ...prev, monthly_installment: parseFloat(pmt.toFixed(2)) }));
  }, [property?.sale_price, property?.investment_total]);

  // Auto-calculate sale_price based on state (FL/GA vs others) + active cost toggles with markup
  useEffect(() => {
    if (!property) return;
    const state = property.ls_county?.state;
    const isFlGa = state === 'FL' || state === 'GA';

    const markups = isFlGa
      ? { surveyor: 1.05, land_clearing: 1.10, fencing_gate: 1.05, preapproval_review: 1.08 }
      : { surveyor: 1.035, land_clearing: 1.075, fencing_gate: 1.035, preapproval_review: 1.08 };

    const costItems = [
      { cost: 'surveyor',           toggle: 'tg_surveyor',           markup: markups.surveyor },
      { cost: 'land_clearing',      toggle: 'tg_land_clearing',      markup: markups.land_clearing },
      { cost: 'fencing_gate',       toggle: 'tg_fencing_gate',       markup: markups.fencing_gate },
      { cost: 'preapproval_review', toggle: 'tg_preapproval_review', markup: markups.preapproval_review },
    ];

    const costsWithMarkup = costItems.reduce((acc, { cost, toggle, markup }) =>
      acc + (property[toggle] ? (Number(property[cost]) || 0) * markup : 0), 0);

    const salePrice = (Number(property.appraisal_avg) || 0) + costsWithMarkup;
    setProperty((prev: any) => ({ ...prev, sale_price: salePrice }));
  }, [
    property?.ls_county?.state,
    property?.appraisal_avg,
    property?.surveyor,             property?.tg_surveyor,
    property?.land_clearing,        property?.tg_land_clearing,
    property?.fencing_gate,         property?.tg_fencing_gate,
    property?.preapproval_review,   property?.tg_preapproval_review,
  ]);

  // Auto-calculate market_value (Residual Land Value) = house_price × 25% (FL/GA) or 20% (others)
  useEffect(() => {
    if (!property) return;
    const housePrice = Number(property.house_price) || 0;
    if (!housePrice) {
      setProperty((prev: any) => ({ ...prev, market_value: '' }));
      return;
    }
    const state = property.ls_county?.state;
    const isFlGa = state === 'FL' || state === 'GA';
    const calculated = housePrice * (isFlGa ? 0.25 : 0.20);
    setProperty((prev: any) => ({ ...prev, market_value: calculated }));
  }, [property?.house_price, property?.ls_county?.state]);

  const renderCostTableHeader = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1.5fr',
      backgroundColor: '#f8fafc',
      padding: '0.75rem 1.25rem',
      borderBottom: '2px solid #e2e8f0',
      fontWeight: 700,
      fontSize: '0.75rem',
      color: '#475569',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em'
    }}>
      <div>Item / Service</div>
      <div style={{ textAlign: 'center' }}>Required / Check</div>
      <div style={{ textAlign: 'right', paddingRight: '1rem' }}>Estimated Cost ($)</div>
    </div>
  );

  const renderCostTableRow = (label: string, desc: string, costName: string, toggleName: string, IconComponent: any, disabled = false) => {
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

        {/* Coluna 3: Input de Moeda */}
        <div className="input-group" style={{ margin: 0 }}>
          <CurrencyInput
            name={costName}
            value={property[costName]}
            onChange={handleChange}
            placeholder="0.00"
            disabled={disabled}
            style={{
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              cursor: disabled ? 'not-allowed' : 'text',
              transition: 'all 0.2s',
              border: '1px solid #cbd5e1'
            }}
          />
        </div>
      </div>
    );
  };

  const handleSave = async () => {
    if (!canEdit) {
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
        'fencing_gate', 'preapproval_review', 'investment_total', 'paid_bid',
        'sale_price', 'doc_fees', 'paid_bid_inv', 'investment_total_inv', 'doc_fees_inv', 'closing_fess_inv',
        'financed_owner', 'monthly_installment', 'sold_value'
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

      // Build marketing payload
      const mktPayload: any = { asset_id: id };
      Object.entries(marketing).forEach(([k, v]) => { mktPayload[k] = (v === '' ? null : v); });

      // Save ls_assets + ls_asset_marketing in parallel
      const [assetsResult, mktResult] = await Promise.all([
        supabase.from('ls_assets').update(payload).eq('id', id),
        supabase.from('ls_asset_marketing').upsert(mktPayload, { onConflict: 'asset_id' }),
      ]);
      if (assetsResult.error) throw assetsResult.error;
      if (mktResult.error) throw mktResult.error;

      // Log tracked field changes
      const TRACKED_FIELDS = [
        { key: 'sale_type',       label: 'Sale Type' },
        { key: 'paid_bid',        label: 'Paid Bid ($)' },
        { key: 'paid_bid_inv',    label: 'Paid Bid Investor ($)' },
      ];
      const orig = originalPropertyRef.current;
      if (orig) {
        const norm = (v: any) => (v === null || v === undefined || v === '') ? '' : String(v);
        const logs = TRACKED_FIELDS
          .filter(({ key }) => norm(orig[key]) !== norm(property[key]))
          .map(({ key, label }) => logAudit({
            action_type: 'FIELD_UPDATE',
            asset_id: Number(id),
            field_name: key,
            old_value: norm(orig[key]) || undefined,
            new_value: norm(property[key]) || undefined,
            meta: { label },
          }));

        // Property Owner: resolve display name instead of raw "partner"/"ironclad"
        const resolveOwner = (prop: any) =>
          prop.owner_type === 'partner'
            ? (partners.find((p: any) => p.id === prop.owner_partner_id)?.full_name || 'Unknown Partner')
            : 'Ironclad';
        const origOwner = resolveOwner(orig);
        const newOwner  = resolveOwner(property);
        if (origOwner !== newOwner) {
          logs.push(logAudit({
            action_type: 'FIELD_UPDATE',
            asset_id: Number(id),
            field_name: 'owner',
            old_value: origOwner,
            new_value: newOwner,
            meta: { label: 'Property Owner' },
          }));
        }

        await Promise.all(logs);
        originalPropertyRef.current = { ...property };
      }

      setSavedOk(true);
      setWasSaved(true);
      // Stay on the page — reset the save button after 2s so the user can save again
      setTimeout(() => setSavedOk(false), 2000);
    } catch (err: any) {
      console.error(err);
      alert("Error updating property: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAmenity = async () => {
    if (!newAmenity.type_id || !canEdit || !tabCanEdit) return;
    
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
    setTaxSavedOk(false);
  };

  const handleTaxFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'type_tax' && value === 'Closing Fees') {
      setTaxForm((prev: any) => ({ ...prev, type_tax: value, perc_iron: 0, perc_inv: 100 }));
    } else if (name === 'type_tax' && value !== 'Closing Fees') {
      setTaxForm((prev: any) => ({ ...prev, type_tax: value, perc_iron: '', perc_inv: '' }));
    } else {
      setTaxForm((prev: any) => ({ ...prev, [name]: value }));
    }
  };

  const handleSaveTax = async () => {
    if (!tabCanEdit) {
      alert("You don't have permission to edit this tab.");
      return;
    }
    // Required field validation
    const requiredFields: Record<string, any> = {
      'Received Date': taxForm.received_date,
      'Type': taxForm.type_tax,
      'Recurrence': taxForm.recurrence,
      'Vigency': taxForm.vigency,
      'Due Date': taxForm.due_date,
      'Value': taxForm.value,
    };
    const missing = Object.entries(requiredFields)
      .filter(([, v]) => v === '' || v === null || v === undefined)
      .map(([k]) => k);
    if (missing.length > 0) {
      alert(`Please fill in all required fields: ${missing.join(', ')}`);
      return;
    }
    // % sum validation — applies when at least one field is filled
    const ironRaw = taxForm.perc_iron !== '' ? parseInt(taxForm.perc_iron, 10) : null;
    const invRaw = taxForm.perc_inv !== '' ? parseInt(taxForm.perc_inv, 10) : null;
    if (ironRaw !== null || invRaw !== null) {
      const sum = (ironRaw ?? 0) + (invRaw ?? 0);
      if (isNaN(sum) || sum !== 100) {
        alert(`% Ironclad + % Investor must equal exactly 100%. Current total: ${sum}%`);
        return;
      }
    }

    const payload: any = {
      asset_id: id,
      due_date: taxForm.due_date || null,
      pay_date: taxForm.pay_date || null,
      received_date: taxForm.received_date || null,
      perc_iron: ironRaw,
      perc_inv: invRaw,
      link_proof: taxForm.link_proof || null,
      link_bill: taxForm.link_bill || null,
      link_advalorem: taxForm.link_advalorem || null,
      value: taxForm.value !== '' ? Number(String(taxForm.value).replace(/[^0-9.-]/g, '')) : null,
      vigency: taxForm.vigency || null,
      recurrence: taxForm.recurrence || null,
      status: taxForm.status || null,
      type_tax: taxForm.type_tax || null,
    };

    const applyAssetAccumulation = async () => {
      const { data: allTaxes } = await supabase
        .from('ls_asset_tax')
        .select('type_tax, pay_date, value, perc_iron, perc_inv')
        .eq('asset_id', id);

      if (!allTaxes) return;

      const eligible = allTaxes.filter(t => t.pay_date && t.value !== null);

      const doc_fees = eligible
        .filter(t => t.type_tax !== 'Closing Fees' && t.perc_iron !== null)
        .reduce((acc, t) => acc + (Number(t.value) * (Number(t.perc_iron) / 100)), 0);

      const doc_fees_inv = eligible
        .filter(t => t.type_tax !== 'Closing Fees' && t.perc_inv !== null)
        .reduce((acc, t) => acc + (Number(t.value) * (Number(t.perc_inv) / 100)), 0);

      const closing_fess_inv = eligible
        .filter(t => t.type_tax === 'Closing Fees' && t.perc_inv !== null)
        .reduce((acc, t) => acc + (Number(t.value) * (Number(t.perc_inv) / 100)), 0);

      const updates = { doc_fees, doc_fees_inv, closing_fess_inv };
      await supabase.from('ls_assets').update(updates).eq('id', id);
      setProperty((prev: any) => ({ ...prev, ...updates }));
    };

    if (editingTaxId) {
      const original = taxes.find(t => t.id === editingTaxId);
      const { data, error } = await supabase.from('ls_asset_tax').update(payload).eq('id', editingTaxId).select('*').single();
      if (!error && data) {
        setTaxes(taxes.map(t => t.id === editingTaxId ? data : t));
        await applyAssetAccumulation();
        logAudit({
          action_type: 'TAX_EDIT',
          asset_id: Number(id),
          field_name: 'value',
          old_value: original?.value != null ? String(original.value) : undefined,
          new_value: data.value != null ? String(data.value) : undefined,
          meta: {
            tax_type: data.type_tax,
          },
        });
        setTaxSavedOk(true);
        setTimeout(() => resetTaxForm(), 1400);
      } else if (error) alert('Error updating tax record: ' + error.message);
    } else {
      const { data, error } = await supabase.from('ls_asset_tax').insert([payload]).select('*').single();
      if (!error && data) {
        setTaxes([data, ...taxes]);
        await applyAssetAccumulation();
        logAudit({
          action_type: 'TAX_ADD',
          asset_id: Number(id),
          meta: {
            tax_type: data.type_tax,
            amount: data.value,
            description: data.vigency,
          },
        });
        setTaxSavedOk(true);
        setTimeout(() => resetTaxForm(), 1400);
      } else if (error) alert('Error saving tax record: ' + error.message);
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


  if (loading) {
    return (
      <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: '#64748b' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 600 }}>Loading Property Details...</span>
      </div>
    );
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1 * 1024 * 1024) {
      alert("Photo must be 1 MB or smaller.");
      e.target.value = "";
      return;
    }

    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${id}/photo.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("property-photos")
        .upload(path, file, { upsert: true });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("property-photos")
        .getPublicUrl(path);

      const cleanUrl = urlData.publicUrl;

      const { error: dbErr } = await supabase
        .from("ls_assets")
        .update({ photo_url: cleanUrl })
        .eq("id", id);

      if (dbErr) throw dbErr;

      // Cache-bust only in local state so the new image loads immediately
      setProperty((prev: any) => ({ ...prev, photo_url: `${cleanUrl}?t=${Date.now()}` }));
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const businessId = formatPropId(property?.ref_id);

  return (
    <div className="property-details-container">
      <div className="details-header">
        <div className="header-left">
          <button onClick={() => wasSaved ? pushReturn({ action: 'updated', highlight: String(id) }) : router.push(returnTo)} className="back-btn">
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
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
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

                {/* ── PHOTO UPLOAD ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '1.25rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ width: '120px', height: '80px', borderRadius: '0.5rem', overflow: 'hidden', flexShrink: 0, backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {property.photo_url ? (
                      <NextImage
                        src={property.photo_url}
                        alt="Property photo"
                        width={120}
                        height={80}
                        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textAlign: 'center', padding: '0.5rem' }}>No photo</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>Property Photo</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Max 1 MB · JPG, PNG or WebP</span>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={handlePhotoUpload}
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', backgroundColor: 'white', border: '1.5px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
                    >
                      {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      {uploadingPhoto ? 'Uploading...' : property.photo_url ? 'Change Photo' : 'Upload Photo'}
                    </button>
                  </div>
                </div>
              </div>
              </fieldset>
            </div>
          )}

          {/* AMENITIES TAB */}
          {activeTab === 'amenities' && (
            <div className="amenities-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Surrounding Amenities</h2>
                <p className="section-desc">Manage points of interest, schools, and health facilities near the property.</p>
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
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
                        <label className="input-label">Time (min)</label>
                        <input
                          type="number"
                          value={newAmenity.time}
                          onChange={(e) => {
                            const time = e.target.value;
                            const calcDist = time ? (parseFloat(time) / 1.6).toFixed(1) : '';
                            setNewAmenity({...newAmenity, time, distance: calcDist.toString()});
                          }}
                          className="input-field"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="input-label">Distance (mi)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={newAmenity.distance}
                          onChange={(e) => setNewAmenity({...newAmenity, distance: e.target.value})}
                          className="input-field"
                        />
                      </div>
                      <button onClick={handleAddAmenity} className="save-btn" style={{ height: '38px', padding: '0 1rem', marginTop: 'auto', backgroundColor: 'var(--primary)', color: 'white', border: 'none' }} disabled={!newAmenity.type_id || !canEdit || !tabCanEdit}>
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
            </fieldset>
          </div>
        )}

          {/* VALUES TAB */}
          {activeTab === 'values' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Valuations & References</h2>
                <p className="section-desc">Track appraisal history, pricing evolution, bidding limits, and reference documents.</p>
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
              {/* Group 1: Evolution */}
              <div style={{ margin: '0 1rem 2.5rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Evolution</h3>
                <div className="form-grid col-3">
                  {source !== 'partners' && (
                  <div className="input-group">
                    <label className="input-label">Open Bid ($)</label>
                    <CurrencyInput name="open_bid" value={property.open_bid} onChange={handleChange} disabled />
                  </div>
                  )}
                  {source !== 'partners' && (
                  <div className="input-group">
                    <label className="input-label">County Appraisal ($)</label>
                    <CurrencyInput name="county_appraisal" value={property.county_appraisal} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  )}
                  <div className="input-group">
                    <label className="input-label">Size (Acres/SqFt)</label>
                    <input type="number" step="any" name="size" value={property.size} onChange={handleChange} className="input-field" placeholder="0.00" />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Appraisal Min ($)</label>
                    <CurrencyInput name="appraisal_min" value={property.appraisal_min} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Appraisal Avg ($)</label>
                    <CurrencyInput name="appraisal_avg" value={property.appraisal_avg} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Appraisal Max ($)</label>
                    <CurrencyInput name="appraisal_max" value={property.appraisal_max} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">House Price ($)</label>
                    <CurrencyInput name="house_price" value={property.house_price} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Residual Land Value ($)</label>
                    <CurrencyInput name="market_value" value={property.market_value} onChange={handleChange} disabled />
                  </div>
                  <div className="input-group">
                    <label className="input-label">SqFt Price Reference</label>
                    <input type="number" step="any" name="sqft_price_reference" value={property.sqft_price_reference} onChange={handleChange} className="input-field" placeholder="0.00" />
                  </div>
                  {source !== 'partners' && (
                  <div className="input-group">
                    <label className="input-label">Min Bid ($)</label>
                    <CurrencyInput name="min_bid" value={property.min_bid} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  )}
                  {source !== 'partners' && (
                  <div className="input-group">
                    <label className="input-label">Max Bid ($)</label>
                    <CurrencyInput name="max_bid" value={property.max_bid} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  )}
                  {source !== 'partners' && (
                  <div className="input-group">
                    <label className="input-label">Max Bid Internal ($)</label>
                    <CurrencyInput name="max_bid_internal" value={property.max_bid_internal} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  )}
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
              </fieldset>
            </div>
          )}

          {/* SALES TAB */}
          {activeTab === 'sales' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Sales</h2>
                <p className="section-desc">Sales information and records for this property.</p>
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <div className="form-grid col-2">
                  <div className="input-group">
                    <label className="input-label">Sale Price ($) <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: '0.4rem' }}>auto-calculated</span></label>
                    <CurrencyInput name="sale_price" value={property.sale_price} onChange={handleChange} disabled />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Paid Bid Investor ($) <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: '0.4rem' }}>auto · editável</span></label>
                    <CurrencyInput name="paid_bid_inv" value={property.paid_bid_inv} onChange={handleChange} disabled={!tabCanEdit} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Doc Fees Investor ($) <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: '0.4rem' }}>auto-calculated</span></label>
                    <CurrencyInput name="doc_fees_inv" value={property.doc_fees_inv} onChange={handleChange} disabled />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Closing Fees Investor ($) <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: '0.4rem' }}>auto-calculated</span></label>
                    <CurrencyInput name="closing_fess_inv" value={property.closing_fess_inv} onChange={handleChange} disabled />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Financed by Owner ($) <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: '0.4rem' }}>auto-calculated</span></label>
                    <CurrencyInput name="financed_owner" value={property.financed_owner} onChange={handleChange} disabled />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Monthly Installment ($) <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: '0.4rem' }}>auto-calculated</span></label>
                    <CurrencyInput name="monthly_installment" value={property.monthly_installment} onChange={handleChange} disabled />
                  </div>
                  <div style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 16px rgba(26,26,46,0.25)', border: '2px solid #7c3aed' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#ffffff' }}>$</div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total Investment Investor</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
                      {property.investment_total_inv != null ? `$${Number(property.investment_total_inv).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ownership */}
              {source !== 'partners' && <div style={{ margin: '0 1rem 1rem 1rem' }}>
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
              </div>}

              {/* Sale Status */}
              {source !== 'partners' && <div style={{ margin: '0 1rem 1.5rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Sale Status</h3>

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = property.sale_type === 'sold_to_investor' ? null : 'sold_to_investor';
                      setProperty((prev: any) => ({
                        ...prev,
                        sale_type: next,
                        sold_date: next && !prev.sold_date ? new Date().toISOString() : prev.sold_date,
                        sold_value: next && !prev.sold_value ? (prev.investment_total_inv ?? null) : prev.sold_value,
                      }));
                    }}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                      padding: '0.85rem 1rem', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem',
                      cursor: 'pointer', transition: 'all 0.2s',
                      border: property.sale_type === 'sold_to_investor' ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                      backgroundColor: property.sale_type === 'sold_to_investor' ? '#eff6ff' : '#f8fafc',
                      color: property.sale_type === 'sold_to_investor' ? '#1d4ed8' : '#64748b',
                    }}
                  >
                    <Handshake className="w-5 h-5" />
                    Sold to Investor
                    {property.sale_type === 'sold_to_investor' && (
                      <span style={{ marginLeft: '0.25rem', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: 700 }}>ACTIVE</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next = property.sale_type === 'sold_out' ? null : 'sold_out';
                      setProperty((prev: any) => ({
                        ...prev,
                        sale_type: next,
                        sold_date: next && !prev.sold_date ? new Date().toISOString() : prev.sold_date,
                        sold_value: next && !prev.sold_value ? (prev.investment_total_inv ?? null) : prev.sold_value,
                      }));
                    }}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                      padding: '0.85rem 1rem', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem',
                      cursor: 'pointer', transition: 'all 0.2s',
                      border: property.sale_type === 'sold_out' ? '2px solid #059669' : '2px solid #e2e8f0',
                      backgroundColor: property.sale_type === 'sold_out' ? '#ecfdf5' : '#f8fafc',
                      color: property.sale_type === 'sold_out' ? '#059669' : '#64748b',
                    }}
                  >
                    <BadgeCheck className="w-5 h-5" />
                    Sold Out
                    {property.sale_type === 'sold_out' && (
                      <span style={{ marginLeft: '0.25rem', backgroundColor: '#059669', color: '#fff', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: 700 }}>ACTIVE</span>
                    )}
                  </button>
                </div>

                {property.sale_type && (
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: property.sale_type === 'sold_out' ? '1.25rem' : 0 }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CalendarCheck className="w-3.5 h-3.5" /> Sale Date
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                          {property.sold_date ? new Date(property.sold_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <DollarSign className="w-3.5 h-3.5" /> Value
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                          {property.investment_total_inv != null ? `$${Number(property.investment_total_inv).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </div>
                      </div>
                    </div>

                    {property.sale_type === 'sold_out' && (
                      <div className="form-grid col-2" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        <div className="input-group">
                          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <User className="w-3.5 h-3.5" /> Client Name
                          </label>
                          <input type="text" name="client_name" value={property.client_name || ''} onChange={handleChange} className="input-field" placeholder="Full name..." />
                        </div>
                        <div className="input-group">
                          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Mail className="w-3.5 h-3.5" /> Client Email
                          </label>
                          <input type="email" name="client_email" value={property.client_email || ''} onChange={handleChange} className="input-field" placeholder="email@..." />
                        </div>
                        <div className="input-group">
                          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Phone className="w-3.5 h-3.5" /> Client Phone
                          </label>
                          <input type="text" name="client_phone" value={property.client_phone || ''} onChange={handleChange} className="input-field" placeholder="(000) 000-0000" />
                        </div>
                        <div className="input-group">
                          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Home className="w-3.5 h-3.5" /> Client Address
                          </label>
                          <input type="text" name="client_addrees" value={property.client_addrees || ''} onChange={handleChange} className="input-field" placeholder="Address..." />
                        </div>
                        <div className="input-group">
                          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <UserCog className="w-3.5 h-3.5" /> Buyer Agent
                          </label>
                          <input type="text" name="buyer_agent" value={property.buyer_agent || ''} onChange={handleChange} className="input-field" placeholder="Agent name..." />
                        </div>
                        <div className="input-group">
                          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <UserCog className="w-3.5 h-3.5" /> Seller Agent
                          </label>
                          <input type="text" name="seller_agente" value={property.seller_agente || ''} onChange={handleChange} className="input-field" placeholder="Agent name..." />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>}
              </fieldset>
            </div>
          )}

          {/* STRATEGY TAB */}
          {activeTab === 'strategy' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Strategy</h2>
                <p className="section-desc">Projected costs and strategic approvals for the property development plan.</p>
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
              <div style={{ margin: '0 1rem 2.5rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Strategic Cost Estimates & Clearances</h3>

                <div style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
                }}>
                  {renderCostTableHeader()}

                  {/* Table Rows */}
                  {renderCostTableRow("Warranty Deed Transfer", "Deed preparation and recording fees", "warrantydeedtransfer_stg", "tg_warrantydeedtransfer_stg", FileText, !tabCanEdit)}
                  {renderCostTableRow("Title Claim Action", "Clearing title or legal fees", "titleclaim_action_stg", "tg_titleclaim_action_stg", Scale, !tabCanEdit)}
                  {renderCostTableRow("Surveyor Cost", "Boundary mapping and layout marking", "surveyor_stg", "tg_surveyor_stg", Compass, !tabCanEdit)}
                  {renderCostTableRow("Land Clearing", "Tree removal and grading", "land_clearing_stg", "tg_land_clearing_stg", Trees, !tabCanEdit)}
                  {renderCostTableRow("Fencing & Gate", "Perimeter fence and security gate", "fencing_gate_stg", "tg_fencing_gate_stg", Lock, !tabCanEdit)}
                  {renderCostTableRow("Preapproval Review", "Zoning review and compliance", "preapproval_review_stg", "tg_preapproval_review_stg", CheckSquare, !tabCanEdit)}
                </div>
              </div>
              </fieldset>
            </div>
          )}

          {/* MARKETING TAB */}
          {activeTab === 'links' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Marketing</h2>
                <p className="section-desc">Production materials and published listings for this property.</p>
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
              {/* ── Material ── */}
              <div style={{ margin: '0 1rem 2rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Material</h3>
                <div className="form-grid col-2">
                  {renderLinkInput("Marketing Report",   "marketing_report",   marketing.marketing_report,   "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("Library",            "library",            marketing.library,            "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("Website Video Copy", "website_video_copy", marketing.website_video_copy, "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("Short Form Copy",    "short_form_copy",    marketing.short_form_copy,    "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("Before Video",       "before_video",       marketing.before_video,       "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("After Video",        "after_video",        marketing.after_video,        "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("3D Video",           "video_3d",           marketing.video_3d,           "https://...", undefined, handleMarketingChange)}
                </div>
              </div>

              {/* ── Done ── */}
              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Done</h3>
                <div className="form-grid col-2">
                  {renderLinkInput("Product Page",     "product_page",     marketing.product_page,     "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("Zillow Listing",   "zillow_listing",   marketing.zillow_listing,   "https://zillow.com/...", undefined, handleMarketingChange)}
                  {renderLinkInput("Facebook Listing", "facebook_listing", marketing.facebook_listing, "https://facebook.com/...", undefined, handleMarketingChange)}
                  {renderLinkInput("Edited Photos",    "edited_photos",    marketing.edited_photos,    "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("Website Video",    "website_video",    marketing.website_video,    "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("3D Video Copy",    "video_3d_copy",    marketing.video_3d_copy,    "https://...", undefined, handleMarketingChange)}
                  {renderLinkInput("Short Form Videos","short_form_videos", marketing.short_form_videos,"https://...", undefined, handleMarketingChange)}
                </div>
              </div>
              </fieldset>
            </div>
          )}

          {/* ACQUISITION & DEVELOPMENT TAB */}
          {activeTab === 'acquisition' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Acquisition & Development</h2>
                <p className="section-desc">Manage property development costs, acquisition toggles, sales statuses, improvements, and modular options.</p>
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              {property.sale_type && (
                <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '0.65rem 1rem' }}>
                  <Lock className="w-4 h-4" style={{ color: '#a16207', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#a16207' }}>
                    This property is marked as <strong>{property.sale_type === 'sold_to_investor' ? 'Sold to Investor' : 'Sold Out'}</strong>. Development fields are locked for editing.
                  </span>
                </div>
              )}

              <fieldset disabled={!tabCanEdit || !!property.sale_type} style={{ border: 'none', padding: 0, margin: 0 }}>
              <div style={{ margin: '0 1rem 2.5rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Cost Estimates & Clearances</h3>
                
                <div style={{ 
                  backgroundColor: '#ffffff', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '12px', 
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
                }}>
                  {renderCostTableHeader()}

                  {/* Table Rows */}
                  {renderCostTableRow("Warranty Deed Transfer", "Deed preparation and recording fees", "warrantydeedtransfer", "tg_warrantydeedtransfer", FileText, !tabCanEdit || !!property.sale_type)}
                  {renderCostTableRow("Title Claim Action", "Clearing title or legal fees", "titleclaim_action", "tg_titleclaim_action", Scale, !tabCanEdit || !!property.sale_type)}
                  {renderCostTableRow("Surveyor Cost", "Boundary mapping and layout marking", "surveyor", "tg_surveyor", Compass, !tabCanEdit || !!property.sale_type)}
                  {renderCostTableRow("Land Clearing", "Tree removal and grading", "land_clearing", "tg_land_clearing", Trees, !tabCanEdit || !!property.sale_type)}
                  {renderCostTableRow("Fencing & Gate", "Perimeter fence and security gate", "fencing_gate", "tg_fencing_gate", Lock, !tabCanEdit || !!property.sale_type)}
                  {renderCostTableRow("Preapproval Review", "Zoning review and compliance", "preapproval_review", "tg_preapproval_review", CheckSquare, !tabCanEdit || !!property.sale_type)}
                </div>
              </div>

              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Development Details & Total Investment</h3>
                <div className="form-grid col-2">
                  <div className="input-group">
                    <label className="input-label">Paid Bid ($)</label>
                    <CurrencyInput name="paid_bid" value={property.paid_bid} onChange={handleChange} disabled={!tabCanEdit || !!property.sale_type} />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Doc Fees ($)</label>
                    <CurrencyInput name="doc_fees" value={property.doc_fees} onChange={handleChange} disabled />
                  </div>

                  <div style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 16px rgba(15,23,42,0.25)', border: '2px solid #3b82f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#ffffff' }}>$</div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#93c5fd', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total Investment</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
                      {property.investment_total != null ? `$${Number(property.investment_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </span>
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
              </fieldset>
            </div>
          )}

          {/* DOCUMENTATION TAB */}
          {activeTab === 'docs' && (
            <div className="form-tab">
              <div className="tab-section-header">
                <h2 className="section-title">Documentation</h2>
                <p className="section-desc">Manage essential property deeds, surveys, planning designs, and tax deadlines.</p>
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
              <div style={{ margin: '0 1rem 1rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>Deeds, Surveys and Plans</h3>
                <div className="form-grid col-2">
                  {source !== 'partners' && renderLinkInput("Tax Deed Link", "tax_deed", property.tax_deed, "https://...")}
                  {renderLinkInput("Warranty Deed Link", "warranty_deed", property.warranty_deed, "https://...")}
                  {renderLinkInput("Survey Link", "survey", property.survey, "https://...")}
                  {renderLinkInput("Site Plan Link", "site_plan", property.site_plan, "https://...")}
                  
                </div>
              </div>
              </fieldset>
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
                {!showTaxForm && canEdit && tabCanEdit && (
                  <button
                    onClick={() => { resetTaxForm(); setShowTaxForm(true); }}
                    className="save-btn"
                    style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    <Plus className="w-4 h-4" /> Add Record
                  </button>
                )}
              </div>
              {!tabCanEdit && <div style={{ margin: '0 1rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.65rem 1rem' }}><Lock className="w-4 h-4" style={{ color: '#dc2626', flexShrink: 0 }} /><span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>This tab is locked for editing based on your profile permissions.</span></div>}
              <fieldset disabled={!tabCanEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
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

                    {/* Row 1 – Date + Classification */}
                    <div className="form-grid col-4" style={{ marginBottom: '0.75rem' }}>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Received Date <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="date" name="received_date" value={taxForm.received_date} onChange={handleTaxFormChange} className="input-field" />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Type <span style={{ color: '#ef4444' }}>*</span></label>
                        <select name="type_tax" value={taxForm.type_tax} onChange={handleTaxFormChange} className="input-field">
                          <option value="">Select...</option>
                          <option value="Annual Tax">Annual Tax</option>
                          <option value="Fees">Fees</option>
                          <option value="HOA/POA">HOA/POA</option>
                          <option value="Closing Fees">Closing Fees</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Recurrence <span style={{ color: '#ef4444' }}>*</span></label>
                        <select name="recurrence" value={taxForm.recurrence} onChange={handleTaxFormChange} className="input-field">
                          <option value="">Select...</option>
                          <option value="Annual">Annual</option>
                          <option value="Single">Single</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Vigency <span style={{ color: '#ef4444' }}>*</span></label>
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
                    </div>

                    {/* Row 2 – Due Date, Value, Percentages */}
                    <div className="form-grid col-4" style={{ marginBottom: '0.75rem' }}>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Due Date <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="date" name="due_date" value={taxForm.due_date} onChange={handleTaxFormChange} className="input-field" />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Value ($) <span style={{ color: '#ef4444' }}>*</span></label>
                        <CurrencyInput name="value" value={taxForm.value} onChange={(e: any) => setTaxForm((p: any) => ({ ...p, value: e.target.value }))} disabled={!tabCanEdit} />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">% Ironclad</label>
                        <input type="number" step="1" min="0" max="100" name="perc_iron" value={taxForm.perc_iron} onChange={handleTaxFormChange} className={`input-field${taxForm.type_tax === 'Closing Fees' ? ' locked' : ''}`} placeholder="0" onKeyDown={handleBlockDecimal} disabled={taxForm.type_tax === 'Closing Fees'} />
                      </div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">% Investor</label>
                        <input type="number" step="1" min="0" max="100" name="perc_inv" value={taxForm.perc_inv} onChange={handleTaxFormChange} className={`input-field${taxForm.type_tax === 'Closing Fees' ? ' locked' : ''}`} placeholder="0" onKeyDown={handleBlockDecimal} disabled={taxForm.type_tax === 'Closing Fees'} />
                      </div>
                    </div>

                    {/* Row 3 – Links + Pay On */}
                    <div className="form-grid col-4" style={{ marginBottom: '1.25rem' }}>
                      {(['link_bill', 'link_proof', 'link_advalorem'] as const).map((field) => {
                        const labels: Record<string, string> = { link_bill: 'Bill Link', link_proof: 'Payment Proof Link', link_advalorem: 'Ad Valorem Link' };
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
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Pay On</label>
                        <input type="date" name="pay_date" value={taxForm.pay_date} onChange={handleTaxFormChange} className="input-field" />
                      </div>
                    </div>

                    {/* Form Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button onClick={resetTaxForm} className="btn-secondary" style={{ padding: '0.5rem 1.25rem' }} disabled={taxSavedOk}>Cancel</button>
                      <button
                        onClick={handleSaveTax}
                        className="primary-btn"
                        disabled={taxSavedOk || !canEdit || !tabCanEdit}
                        style={{
                          padding: '0.5rem 1.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          ...(taxSavedOk ? { backgroundColor: '#10b981', cursor: 'default' } : {})
                        }}
                      >
                        {taxSavedOk
                          ? <><CheckSquare className="w-4 h-4" /> Saved!</>
                          : <><Save className="w-4 h-4" /> {editingTaxId ? 'Update Record' : 'Save Record'}</>
                        }
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
                                  {tabCanEdit && <button onClick={() => handleEditTax(tax)} title="Edit" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>}
                                  {tabCanEdit && <button onClick={() => handleDeleteTax(tax.id)} title="Delete" style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>}
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
              </fieldset>
            </div>
          )}

        </div>

      </div>

      {savedOk && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem',
          backgroundColor: '#10b981', color: 'white',
          padding: '1rem 1.5rem', borderRadius: '0.75rem',
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)', zIndex: 9999,
          animation: 'slideUpFade 0.3s ease-out forwards'
        }}>
          <CheckCircle2 className="w-6 h-6 flex-shrink-0" style={{ marginTop: '0.125rem' }} />
          <div>
            <h4 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>Successfully Saved</h4>
            <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>The property record was updated.</p>
          </div>
        </div>
      )}

      <div className="form-actions-bar">
        <button className="btn-secondary" onClick={() => wasSaved ? pushReturn({ action: 'updated', highlight: String(id) }) : router.push(returnTo)}>
          <X className="w-4 h-4" />
          Exit
        </button>
        
        <div style={{ flex: 1 }}></div>

        <button
          className="primary-btn"
          onClick={handleSave}
          disabled={saving || savedOk || !canEdit || !tabCanEdit}
          title={!canEdit || !tabCanEdit ? "You don't have permission to edit this tab." : undefined}
          style={
            savedOk ? { backgroundColor: '#10b981', cursor: 'default' } :
            (!canEdit || !tabCanEdit) ? { backgroundColor: '#94a3b8', cursor: 'not-allowed', opacity: 0.7 } :
            undefined
          }
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : savedOk ? "Saved!" : (!canEdit || !tabCanEdit) ? "Read Only" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
