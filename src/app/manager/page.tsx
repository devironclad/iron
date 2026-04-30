"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Plus, Trash2, Edit2, Save, X, Database, 
  AlertCircle, CheckCircle2, ArrowLeft,
  Search, Info, Gavel, MapPin, FileText, Key, DollarSign, 
  Tag, Activity, ListFilter, Layout, Layers, ShieldCheck, Map, Construction
} from "lucide-react";
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
];

export default function ManagerPage() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Edit/Add state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newCountyState, setNewCountyState] = useState("FL");
  const [editValue, setEditValue] = useState("");
  const [editStateValue, setEditStateValue] = useState("");
  const [newPriorityColor, setNewPriorityColor] = useState("#94a3b8");
  const [editPriorityColor, setEditPriorityColor] = useState("#94a3b8");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (selectedTable) {
      fetchData();
      if (selectedTable === "ls_amenity_type") {
        fetchCategories();
      }
    }
  }, [selectedTable]);

  async function fetchCategories() {
    const { data: cats } = await supabase.from("ls_amenity_category").select("*").order("name");
    setCategories(cats || []);
  }

  async function fetchData() {
    if (!selectedTable) return;
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: supabaseError } = await supabase
        .from(selectedTable)
        .select("*")
        .order('name', { ascending: true });

      if (supabaseError) throw supabaseError;
      setData(result || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newItemName.trim() || !selectedTable) return;
    setLoading(true);
    try {
      const payload: any = { name: newItemName };
      if (selectedTable === "ls_county") {
        payload.state = newCountyState;
      } else if (selectedTable === "ls_priority") {
        payload.color = newPriorityColor;
      } else if (selectedTable === "ls_amenity_type") {
        payload.category_id = newCategoryId;
      }
      
      const { error: supabaseError } = await supabase
        .from(selectedTable)
        .insert([payload]);

      if (supabaseError) throw supabaseError;
      
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
    if (!confirm("Are you sure you want to delete this item?")) return;
    if (!selectedTable) return;
    setLoading(true);
    try {
      const { error: supabaseError } = await supabase
        .from(selectedTable)
        .delete()
        .eq('id', id);

      if (supabaseError) throw supabaseError;
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
    setLoading(true);
    try {
      const payload: any = { name: editValue };
      if (selectedTable === "ls_county") {
        payload.state = editStateValue;
      } else if (selectedTable === "ls_priority") {
        payload.color = editPriorityColor;
      } else if (selectedTable === "ls_amenity_type") {
        payload.category_id = editCategoryId;
      }

      const { error: supabaseError } = await supabase
        .from(selectedTable)
        .update(payload)
        .eq('id', id);

      if (supabaseError) throw supabaseError;
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

  async function handleSeed() {
    if (!confirm("This will populate all 14 tables with sample data. Continue?")) return;
    setLoading(true);
    setError(null);
    try {
      const seedData: Record<string, any[]> = {
        ls_origem: [{name: 'Lead Provider'}, {name: 'County Website'}, {name: 'Direct Mail'}, {name: 'Agent Referral'}],
        ls_status: [{name: 'Active Auction'}, {name: 'Archived'}, {name: 'Researching'}, {name: 'In Review'}],
        ls_priority: [{name: 'High'}, {name: 'Medium'}, {name: 'Low'}, {name: 'No Interest'}],
        ls_county: [
          {name: 'Miami-Dade', state: 'FL'}, {name: 'Broward', state: 'FL'}, {name: 'Palm Beach', state: 'FL'},
          {name: 'Hillsborough', state: 'FL'}, {name: 'Orange', state: 'FL'}, {name: 'Duval', state: 'FL'},
          {name: 'Pinellas', state: 'FL'}, {name: 'Lee', state: 'FL'}, {name: 'Polk', state: 'FL'}
        ],
        ls_auction_type: [{name: 'Tax Deed Sale'}, {name: 'Foreclosure'}, {name: 'Lien Sale'}],
        ls_auction_model: [{name: 'Online'}, {name: 'In-person'}, {name: 'Hybrid'}],
        ls_property_type: [{name: 'SFH'}, {name: 'Vacant Land'}, {name: 'Condo'}, {name: 'Multi-Family'}],
        ls_fema: [{name: 'Zone X'}, {name: 'Zone AE'}, {name: 'Zone AH'}, {name: 'Zone VE'}],
        ls_wetlands: [{name: 'None'}, {name: 'Partial'}, {name: 'Full Wetlands'}],
        ls_debit: [{name: 'Clear Title'}, {name: 'Active Liens'}, {name: 'Mortgage Outstanding'}],
        ls_gismap: [{name: 'Verified'}, {name: 'Pending'}, {name: 'Manual Review Req'}],
        ls_property_access: [{name: 'Open Access'}, {name: 'Gated'}, {name: 'Restricted/Locked'}],
        ls_road_access: [{name: 'Paved'}, {name: 'Dirt Road'}, {name: 'No Access'}, {name: 'Water Access'}],
        ls_ref_construction: [{name: 'New Build'}, {name: 'Rehab Required'}, {name: 'Tear Down'}, {name: 'Occupied'}],
      };

      for (const table of TABLES) {
        const { error: seedError } = await supabase.from(table.id).insert(seedData[table.id]);
        if (seedError) console.warn(`Seed warning for ${table.id}:`, seedError.message);
      }

      setSuccess("All tables populated successfully!");
      fetchData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError("Seed failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedTableInfo = TABLES.find(t => t.id === selectedTable);

  return (
    <div className="manager-container">
      <div className="page-header">
        <div className="page-header-text">
          <div className="header-with-back">
            {selectedTable && (
              <button className="back-btn" onClick={() => setSelectedTable(null)}>
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
        {!selectedTable && (
          <button className="seed-btn" onClick={handleSeed} disabled={loading}>
            <Database className="w-4 h-4" />
            Populate with Sample Data
          </button>
        )}
      </div>

      {!selectedTable ? (
        /* CATEGORY SELECTION GRID */
        <div className="categories-grid">
          {TABLES.map(table => {
            const Icon = table.icon;
            return (
              <div 
                key={table.id} 
                className="category-card"
                onClick={() => setSelectedTable(table.id)}
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
        </div>
      ) : (
        /* TABLE ITEMS MANAGEMENT VIEW */
        <div className="manager-content">
          <div className="content-card">
            <div className="card-header">
              <div className="add-form">
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
                <button className="add-btn" onClick={handleAdd} disabled={loading}>
                  <Plus className="w-4 h-4" />
                  Add
                </button>
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
                    <th>Name</th>
                    {selectedTable === "ls_county" && <th>State</th>}
                    {selectedTable === "ls_priority" && <th>Color</th>}
                    {selectedTable === "ls_amenity_type" && <th>Category</th>}
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
                          <td>
                            {editingId === item.id ? (
                              <input
                                type="text"
                                className="manager-input state-input"
                                value={editStateValue}
                                onChange={(e) => setEditStateValue(e.target.value)}
                              />
                            ) : (
                              item.state
                            )}
                          </td>
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
                              <button className="icon-btn-circle edit" onClick={() => {
                                setEditingId(item.id);
                                setEditValue(item.name);
                                if (selectedTable === "ls_county") setEditStateValue(item.state || "FL");
                                if (selectedTable === "ls_priority") setEditPriorityColor(item.color || "#94a3b8");
                                if (selectedTable === "ls_amenity_type") setEditCategoryId(item.category_id || "");
                              }}>
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button className="icon-btn-circle delete" onClick={() => handleDelete(item.id)}>
                                <Trash2 className="w-4 h-4" />
                              </button>
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
      )}
    </div>
  );
}
