"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  Plus, Trash2, Edit2, Save, X, 
  AlertCircle, CheckCircle2, ArrowLeft,
  Search, Info, Gavel, MapPin, FileText, Key, DollarSign, 
  Tag, Activity, ListFilter, Layout, Layers, ShieldCheck, Map, Construction,
  ChevronRight,
  ShieldAlert,
  Loader2
} from "lucide-react";
import { hasPermission, getCurrentUserPermissions } from "@/lib/permissions";
import "./manager.css";

const TABLES = [
  { id: "ls_origem", label: "Origem", icon: Tag, desc: "Manage source origins for leads" },
  { id: "ls_status", label: "Status", icon: Activity, desc: "Asset lifecycle status codes" },
  { id: "ls_priority", label: "Priority", icon: ListFilter, desc: "High, Medium, Low priority levels" },
  { id: "ls_county", label: "County", icon: MapPin, desc: "Florida counties and regions" },
  { id: "ls_auction_type", label: "Auction Type", icon: Gavel, desc: "Tax Deed, Foreclosure, etc" },
  { id: "ls_auction_model", label: "Auction Model", icon: Layout, desc: "Online or In-person modes" },
  { id: "ls_property_type", label: "Property Type", icon: Layers, desc: "SFH, Vacant Land, Condo" },
  { id: "ls_fema", label: "FEMA", icon: ShieldCheck, desc: "Flood zone classifications" },
  { id: "ls_wetlands", label: "Wetlands", icon: Map, desc: "Wetland status and environmental" },
  { id: "ls_debit", label: "Debit", icon: DollarSign, desc: "Title debit and lien status" },
  { id: "ls_gismap", label: "GIS Map", icon: Map, desc: "Map reference verifications" },
  { id: "ls_property_access", label: "Property Access", icon: Key, desc: "Access types (Gated, Open)" },
  { id: "ls_road_access", label: "Road Access", icon: Construction, desc: "Paved, Dirt, No access" },
  { id: "ls_ref_construction", label: "Ref Construction", icon: Info, desc: "New build vs rehab status" },
  { id: "ls_amenity_category", label: "Amenity Categories", icon: Layers, desc: "Groups like Shopping, Transport, etc" },
  { id: "ls_amenity_type", label: "Amenity Types", icon: MapPin, desc: "Specific items like Walmart, Schools" },
  { id: "ls_request_category", label: "Request Category", icon: Layers, desc: "Categories for Helpdesk requests" },
  { id: "ls_safety_index", label: "Safety Index", icon: ShieldCheck, desc: "Low, Medium, High area safety rating" },
  { id: "ls_financial_rating", label: "Financial Rating", icon: DollarSign, desc: "Low, Medium, High financial rating" },
];

function ManagerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedTable = searchParams.get("table");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Edit/Add state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newCountyState, setNewCountyState] = useState("FL");
  const [editValue, setEditValue] = useState("");
  const [newPriorityColor, setNewPriorityColor] = useState("#94a3b8");
  const [editPriorityColor, setEditPriorityColor] = useState("#94a3b8");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterState, setFilterState] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  // County details modal (address/phone/links/notes + contacts sub-registry)
  const [detailsCounty, setDetailsCounty] = useState<any>(null);
  const [detailsForm, setDetailsForm] = useState<any>({});
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSuccess, setDetailsSuccess] = useState<string | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", role: "", email: "", phone: "", notes: "" });
  const [deletingContact, setDeletingContact] = useState<any>(null);
  const [confirmingContactDelete, setConfirmingContactDelete] = useState(false);

  useEffect(() => {
    async function loadPermissions() {
      const perms = await getCurrentUserPermissions();
      setPermissions(perms);
    }
    loadPermissions();
  }, []);

  useEffect(() => {
    setFilterCategoryId(""); // Reset filter when table changes
    setFilterState("");
    if (selectedTable) {
      fetchData();
      if (selectedTable === "ls_amenity_type") {
        fetchCategories();
      }
      if (selectedTable === "ls_county") {
        fetchStates();
      }
    }
  }, [selectedTable]);

  useEffect(() => {
    if (selectedTable === "ls_amenity_type" || selectedTable === "ls_county") {
      fetchData();
    }
  }, [filterCategoryId, filterState, sortConfig]);

  async function fetchCategories() {
    const { data: cats } = await supabase.from("ls_amenity_category").select("*").order("name");
    setCategories(cats || []);
  }

  async function fetchStates() {
    const { data: result } = await supabase.from("ls_county").select("state");
    if (result) {
      const uniqueStates = Array.from(new Set(result.map(r => r.state).filter(Boolean))) as string[];
      setStates(uniqueStates.sort());
    }
  }

  async function fetchData() {
    if (!selectedTable) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(selectedTable).select("*");
      
      if (selectedTable === "ls_amenity_type" && filterCategoryId) {
        query = query.eq('category_id', filterCategoryId);
      }

      if (selectedTable === "ls_county" && filterState) {
        query = query.eq('state', filterState);
      }

      query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

      const { data: result, error: supabaseError } = await query;

      if (supabaseError) throw supabaseError;
      setData(result || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }

  function handleSort(key: string) {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function handleAdd() {
    if (!newItemName.trim() || !selectedTable) return;
    if (!canEditTable(selectedTable)) {
      setError("You don't have permission to add items to this table.");
      return;
    }
    if (selectedTable === "ls_amenity_type" && !newCategoryId) {
      setError("Please select a category.");
      return;
    }
    setLoading(true);
    try {
      const payload: any = { name: newItemName };
      if (selectedTable === "ls_county")       payload.state       = newCountyState;
      else if (selectedTable === "ls_priority") payload.color       = newPriorityColor;
      else if (selectedTable === "ls_amenity_type") payload.category_id = newCategoryId;

      const res = await fetch("/api/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await getToken()}` },
        body: JSON.stringify({ table: selectedTable, payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setNewItemName("");
      setNewPriorityColor("#94a3b8");
      setSuccess("Item added successfully!");
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!selectedTable) return;
    if (!canEditTable(selectedTable)) {
      setError("You don't have permission to delete items from this table.");
      return;
    }
    if (!confirm("Are you sure you want to delete this item?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/manager", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await getToken()}` },
        body: JSON.stringify({ table: selectedTable, id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setSuccess("Item deleted!");
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editValue.trim() || !selectedTable) return;
    if (!canEditTable(selectedTable)) {
      setError("You don't have permission to edit items in this table.");
      return;
    }
    setLoading(true);
    try {
      const payload: any = { name: editValue };
      if (selectedTable === "ls_priority")           payload.color       = editPriorityColor;
      else if (selectedTable === "ls_amenity_type")  payload.category_id = editCategoryId;

      const res = await fetch("/api/manager", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await getToken()}` },
        body: JSON.stringify({ table: selectedTable, id, payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setEditingId(null);
      setSuccess("Item updated!");
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }



  async function fetchContacts(countyId: string) {
    setContactsLoading(true);
    const { data: result } = await supabase.from("ls_county_contacts").select("*").eq("county_id", countyId).order("name");
    setContacts(result || []);
    setContactsLoading(false);
  }

  function openDetails(item: any) {
    setDetailsCounty(item);
    setDetailsForm({
      name: item.name || "",
      state: item.state || "FL",
      address: item.address || "",
      phone: item.phone || "",
      link1_label: item.link1_label || "",
      link1_url: item.link1_url || "",
      link2_label: item.link2_label || "",
      link2_url: item.link2_url || "",
      notes: item.notes || "",
    });
    setNewContact({ name: "", role: "", email: "", phone: "", notes: "" });
    setDetailsError(null);
    setDetailsSuccess(null);
    fetchContacts(item.id);
  }

  function closeDetails() {
    setDetailsCounty(null);
    setContacts([]);
    setDeletingContact(null);
  }

  async function handleSaveDetails() {
    if (!detailsCounty || !detailsForm.name?.trim() || !canEditTable("ls_county")) return;
    setDetailsSaving(true);
    setDetailsError(null);
    try {
      const res = await fetch("/api/manager", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await getToken()}` },
        body: JSON.stringify({ table: "ls_county", id: detailsCounty.id, payload: detailsForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setSuccess("County updated!");
      closeDetails();
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setDetailsError(err.message);
    } finally {
      setDetailsSaving(false);
    }
  }

  async function handleAddContact() {
    if (!detailsCounty || !newContact.name.trim() || !canEditTable("ls_county")) return;
    setDetailsError(null);
    try {
      const res = await fetch("/api/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await getToken()}` },
        body: JSON.stringify({ table: "ls_county_contacts", payload: { county_id: detailsCounty.id, ...newContact } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setDetailsSuccess(`Contact "${newContact.name}" added successfully!`);
      setNewContact({ name: "", role: "", email: "", phone: "", notes: "" });
      fetchContacts(detailsCounty.id);
      setTimeout(() => setDetailsSuccess(null), 3000);
    } catch (err: any) {
      setDetailsError(err.message);
    }
  }

  async function handleDeleteContact() {
    if (!detailsCounty || !deletingContact || !canEditTable("ls_county")) return;
    setDetailsError(null);
    setConfirmingContactDelete(true);
    try {
      const res = await fetch("/api/manager", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await getToken()}` },
        body: JSON.stringify({ table: "ls_county_contacts", id: deletingContact.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setContacts(contacts.filter(c => c.id !== deletingContact.id));
      setDetailsSuccess(`Contact "${deletingContact.name}" deleted!`);
      setDeletingContact(null);
      setTimeout(() => setDetailsSuccess(null), 3000);
    } catch (err: any) {
      setDetailsError(err.message);
    } finally {
      setConfirmingContactDelete(false);
    }
  }

  const selectedTableInfo = TABLES.find(t => t.id === selectedTable);

  // Page-level permission gate — must be loaded and explicitly allow edit
  const pageCanEdit = permissions !== null && hasPermission(permissions, 'page:manager', 'edit');

  // Table-level edit: BOTH page-level AND table-level must allow edit
  const canEditTable = (tableId: string) =>
    pageCanEdit && hasPermission(permissions, `table:${tableId}`, 'edit');

  return (
    <div className="manager-container">
      <div className="page-header">
        <div className="page-header-text">
          <div className="header-with-back">
            {selectedTable && (
              <button className="back-btn" onClick={() => router.push('/manager')}>
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="page-title">
              {selectedTable ? selectedTableInfo?.label : "System Manager"}
              <span className="dot">.</span>
            </h1>
          </div>
          <p className="page-subtitle">
            {selectedTable 
              ? `Management of entries for ${selectedTableInfo?.label}`
              : "Select a category below to manage its auxiliary lookup data."
            }
          </p>
        </div>

      </div>

      {!selectedTable ? (
        /* CATEGORY SELECTION GRID */
        <div className="categories-grid">
          {TABLES.filter(t => permissions && hasPermission(permissions, `table:${t.id}`, 'view')).map(table => {
            const Icon = table.icon;
            return (
              <div 
                key={table.id} 
                className="category-card"
                onClick={() => router.push(`/manager?table=${table.id}`)}
              >
                <div className="category-icon-wrapper">
                  <Icon className="category-icon" />
                </div>
                <div className="category-info">
                  <h3 className="category-name">{table.label}</h3>
                  <p className="category-desc">{table.desc}</p>
                </div>
              </div>
            );
          })}
          {permissions && TABLES.filter(t => hasPermission(permissions, `table:${t.id}`, 'view')).length === 0 && (
             <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>You don't have permission to view any management tables.</p>
             </div>
          )}
        </div>
      ) : (
        /* TABLE ITEMS MANAGEMENT VIEW */
        !permissions ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p>Checking permissions...</p>
          </div>
        ) : !hasPermission(permissions, `table:${selectedTable}`, 'view') ? (
          <div className="content-card" style={{ padding: '4rem', textAlign: 'center' }}>
            <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Access Denied</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>You don't have permission to view the {selectedTableInfo?.label} table.</p>
            <button className="back-btn" style={{ margin: '0 auto' }} onClick={() => router.push('/manager')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Manager
            </button>
          </div>
        ) : (
          <div className="manager-content">
            <div className="content-card">
              <div className="card-header">
                <div className="header-controls">
                  <div className="add-form">
                    {canEditTable(selectedTable) ? (
                      <>
                        {selectedTable === "ls_amenity_type" && (
                          <select 
                            className="manager-input"
                            value={newCategoryId}
                            onChange={(e) => setNewCategoryId(e.target.value)}
                            required
                          >
                            <option value="">Select Category...</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                        <input
                          type="text"
                          placeholder={`New ${selectedTableInfo?.label} name...`}
                          className="manager-input"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                        />
                        {selectedTable === "ls_county" && (
                          <input
                            type="text"
                            placeholder="State"
                            className="manager-input state-input"
                            value={newCountyState}
                            onChange={(e) => setNewCountyState(e.target.value)}
                          />
                        )}
                        {selectedTable === "ls_priority" && (
                          <input
                            type="color"
                            className="manager-input color-input"
                            value={newPriorityColor}
                            onChange={(e) => setNewPriorityColor(e.target.value)}
                            style={{ padding: "0.2rem", width: "50px", height: "42px" }}
                            title="Select priority color"
                          />
                        )}
                        <button className="add-btn" onClick={handleAdd} disabled={loading}>
                          <Plus className="w-4 h-4" />
                          Add
                        </button>
                      </>
                    ) : (
                      <div className="read-only-badge">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Read Only Mode</span>
                      </div>
                    )}
                  </div>

                  {selectedTable === "ls_amenity_type" && (
                    <div className="filter-group">
                      <ListFilter className="w-4 h-4" />
                      <select 
                        className="manager-input filter-select"
                        value={filterCategoryId}
                        onChange={(e) => setFilterCategoryId(e.target.value)}
                      >
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {selectedTable === "ls_county" && (
                    <div className="filter-group">
                      <ListFilter className="w-4 h-4" />
                      <select 
                        className="manager-input filter-select"
                        value={filterState}
                        onChange={(e) => setFilterState(e.target.value)}
                      >
                        <option value="">All States</option>
                        {states.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

            {error && (
              <div className="alert alert-error">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            
            {success && (
              <div className="alert alert-success">
                <CheckCircle2 className="w-4 h-4" />
                {success}
              </div>
            )}

            <div className="table-wrapper">
              <table className="manager-table">
                <thead>
                  <tr>
                    {selectedTable === "ls_amenity_type" && (
                      <th onClick={() => handleSort('category_id')} className="sortable-th">
                        Category {sortConfig.key === 'category_id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                    )}
                    <th onClick={() => handleSort('name')} className="sortable-th">
                      Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    {selectedTable === "ls_county" && (
                      <th onClick={() => handleSort('state')} className="sortable-th">
                        State {sortConfig.key === 'state' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                    )}
                    {selectedTable === "ls_priority" && <th>Color</th>}
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && data.length === 0 ? (
                    <tr><td colSpan={selectedTable === "ls_amenity_type" ? 3 : 2} className="empty-state">Loading...</td></tr>
                  ) : data.length === 0 ? (
                    <tr><td colSpan={selectedTable === "ls_amenity_type" ? 3 : 2} className="empty-state">No records found.</td></tr>
                  ) : (
                    data.map(item => (
                      <tr key={item.id}>
                        {selectedTable === "ls_amenity_type" && (
                          <td>
                            {editingId === item.id ? (
                              <select 
                                className="manager-input"
                                value={editCategoryId}
                                onChange={(e) => setEditCategoryId(e.target.value)}
                              >
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            ) : (
                              categories.find(c => c.id === item.category_id)?.name || "N/A"
                            )}
                          </td>
                        )}
                        <td>
                          {editingId === item.id ? (
                            <input
                              type="text"
                              className="manager-input table-edit-input"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                            />
                          ) : (
                            item.name
                          )}
                        </td>
                        {selectedTable === "ls_county" && (
                          <td>{item.state}</td>
                        )}
                        {selectedTable === "ls_priority" && (
                          <td>
                            {editingId === item.id ? (
                              <input
                                type="color"
                                className="manager-input color-input"
                                value={editPriorityColor}
                                onChange={(e) => setEditPriorityColor(e.target.value)}
                                style={{ padding: "0.2rem", width: "50px", height: "36px" }}
                              />
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: item.color || "#94a3b8" }} />
                                {item.color || "#94a3b8"}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="actions-cell">
                          {editingId === item.id ? (
                            <div className="actions-row">
                              <button className="icon-btn-circle save" onClick={() => handleUpdate(item.id)}>
                                <Save className="w-4 h-4" />
                              </button>
                              <button className="icon-btn-circle cancel" onClick={() => setEditingId(null)}>
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="actions-row">
                              {selectedTable === "ls_county" && (
                                <button className="icon-btn-circle details" onClick={() => openDetails(item)} title="County details">
                                  <Info className="w-4 h-4" />
                                </button>
                              )}
                              {canEditTable(selectedTable) && (
                                <>
                                  {selectedTable !== "ls_county" && (
                                    <button className="icon-btn-circle edit" onClick={() => {
                                      setEditingId(item.id);
                                      setEditValue(item.name);
                                      if (selectedTable === "ls_priority") setEditPriorityColor(item.color || "#94a3b8");
                                      if (selectedTable === "ls_amenity_type") setEditCategoryId(item.category_id || "");
                                    }}>
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button className="icon-btn-circle delete" onClick={() => handleDelete(item.id)}>
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))
    }

    {detailsCounty && (
      <div className="modal-overlay" onClick={closeDetails}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{detailsCounty.name} — County Details</h2>
            <button className="modal-close-btn" onClick={closeDetails}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="modal-body">
            {detailsError && (
              <div className="alert alert-error">
                <AlertCircle className="w-4 h-4" />
                {detailsError}
              </div>
            )}

            {detailsSuccess && (
              <div className="alert alert-success">
                <CheckCircle2 className="w-4 h-4" />
                {detailsSuccess}
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input
                  className="manager-input"
                  value={detailsForm.name || ""}
                  onChange={(e) => setDetailsForm({ ...detailsForm, name: e.target.value })}
                  disabled
                />
              </div>
              <div className="form-group" style={{ flex: "0 0 90px" }}>
                <label>State</label>
                <input
                  className="manager-input"
                  value={detailsForm.state || ""}
                  onChange={(e) => setDetailsForm({ ...detailsForm, state: e.target.value })}
                  disabled
                />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input
                className="manager-input"
                value={detailsForm.address || ""}
                onChange={(e) => setDetailsForm({ ...detailsForm, address: e.target.value })}
                disabled={!canEditTable("ls_county")}
              />
            </div>

            <div className="form-group">
              <label>Phone</label>
              <input
                className="manager-input"
                value={detailsForm.phone || ""}
                onChange={(e) => setDetailsForm({ ...detailsForm, phone: e.target.value })}
                disabled={!canEditTable("ls_county")}
              />
            </div>

            <div className="form-group">
              <label>Link 1 — Label</label>
              <input
                className="manager-input"
                placeholder="e.g. Official Website"
                value={detailsForm.link1_label || ""}
                onChange={(e) => setDetailsForm({ ...detailsForm, link1_label: e.target.value })}
                disabled={!canEditTable("ls_county")}
              />
            </div>

            <div className="form-group">
              <label>Link 1 — URL</label>
              <input
                className="manager-input"
                placeholder="https://..."
                value={detailsForm.link1_url || ""}
                onChange={(e) => setDetailsForm({ ...detailsForm, link1_url: e.target.value })}
                disabled={!canEditTable("ls_county")}
              />
            </div>

            <div className="form-group">
              <label>Link 2 — Label</label>
              <input
                className="manager-input"
                placeholder="e.g. Auction Portal"
                value={detailsForm.link2_label || ""}
                onChange={(e) => setDetailsForm({ ...detailsForm, link2_label: e.target.value })}
                disabled={!canEditTable("ls_county")}
              />
            </div>

            <div className="form-group">
              <label>Link 2 — URL</label>
              <input
                className="manager-input"
                placeholder="https://..."
                value={detailsForm.link2_url || ""}
                onChange={(e) => setDetailsForm({ ...detailsForm, link2_url: e.target.value })}
                disabled={!canEditTable("ls_county")}
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                className="manager-input"
                rows={3}
                value={detailsForm.notes || ""}
                onChange={(e) => setDetailsForm({ ...detailsForm, notes: e.target.value })}
                disabled={!canEditTable("ls_county")}
              />
            </div>

            <h3 className="modal-section-title">Contacts</h3>

            {canEditTable("ls_county") && (
              <div className="contact-add-form">
                <input className="manager-input" placeholder="Name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                <input className="manager-input" placeholder="Role" value={newContact.role} onChange={(e) => setNewContact({ ...newContact, role: e.target.value })} />
                <input className="manager-input" placeholder="Email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                <input className="manager-input" placeholder="Phone" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                <textarea className="manager-input" rows={3} placeholder="Notes" style={{ gridColumn: "1 / -1" }} value={newContact.notes} onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })} />
                <button className="add-btn contact-add-btn" onClick={handleAddContact} disabled={!newContact.name.trim()}>
                  <Plus className="w-4 h-4" />
                  Add Contact
                </button>
              </div>
            )}

            <div className="contact-list">
              {contactsLoading ? (
                <div className="contact-empty">Loading contacts...</div>
              ) : contacts.length === 0 ? (
                <div className="contact-empty">No contacts added yet.</div>
              ) : (
                contacts.map((c) => (
                  <div className="contact-card" key={c.id}>
                    <div className="contact-card-info">
                      <span className="contact-card-name">{c.name}</span>
                      {c.role && <span className="contact-card-role">{c.role}</span>}
                      <div className="contact-card-meta">
                        {c.email && <span>{c.email}</span>}
                        {c.phone && <span>{c.phone}</span>}
                      </div>
                      {c.notes && <span className="contact-card-notes">{c.notes}</span>}
                    </div>
                    {canEditTable("ls_county") && (
                      <button className="icon-btn-circle delete" onClick={() => setDeletingContact(c)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {canEditTable("ls_county") && (
            <div className="modal-footer">
              <button className="add-btn" onClick={handleSaveDetails} disabled={detailsSaving || !detailsForm.name?.trim()}>
                {detailsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    {deletingContact && (
      <div className="modal-overlay" onClick={() => setDeletingContact(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
          <div className="modal-header">
            <h2>Remove Contact</h2>
            <button className="modal-close-btn" onClick={() => setDeletingContact(null)}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Are you sure you want to remove <strong>{deletingContact.name}</strong> from this county&apos;s contacts?
          </p>

          <div className="modal-footer">
            <button
              className="seed-btn"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setDeletingContact(null)}
              disabled={confirmingContactDelete}
            >
              Cancel
            </button>
            <button
              className="add-btn"
              style={{ flex: 1, justifyContent: "center", backgroundColor: "#ef4444" }}
              onClick={handleDeleteContact}
              disabled={confirmingContactDelete}
            >
              {confirmingContactDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Remove
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

export default function ManagerPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading Manager...</p>
      </div>
    }>
      <ManagerContent />
    </Suspense>
  );
}
