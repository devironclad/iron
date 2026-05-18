"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Save, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

// We can reuse the form.css from auctions if it matches the global style, 
// or define inline classes. We will import global CSS but use custom inline styles for uniqueness if needed.
// Actually, we can import the auction form CSS since it has standard inputs.
import "@/app/auctions/new/form.css";

export default function NewRequestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [lookups, setLookups] = useState<any>({
    users: [],
    categories: [],
    priorities: [],
    assets: []
  });

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assignee_id: "",
    category_id: "",
    priority_id: "",
    asset_id: ""
  });

  useEffect(() => {
    async function fetchLookups() {
      const [userRes, catRes, priRes, assetRes] = await Promise.all([
        supabase.from("ls_users_metadata").select("id, full_name").order("full_name"),
        supabase.from("ls_request_category").select("id, name").order("name"),
        supabase.from("ls_request_priority").select("id, name, sla_days").order("name"),
        supabase.from("ls_assets").select("id, parcel_number, address").eq("record_type", "PROPERTY").limit(500)
      ]);
      
      setLookups({
        users: userRes.data || [],
        categories: catRes.data || [],
        priorities: priRes.data || [],
        assets: assetRes.data || []
      });
    }
    fetchLookups();
  }, []);

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.category_id || !formData.priority_id) {
      alert("Please fill in the required fields: Title, Category, and Priority.");
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;

      // Find the "Open" status ID
      const { data: statusRes } = await supabase.from("ls_request_status").select("id").eq("name", "Open").limit(1).single();
      const openStatusId = statusRes?.id;

      const payload = {
        ...formData,
        requester_id: currentUserId,
        status_id: openStatusId,
        assignee_id: formData.assignee_id || null,
        asset_id: formData.asset_id ? Number(formData.asset_id) : null
      };

      const { data, error } = await supabase.from("ls_requests").insert(payload).select("id").single();
      if (error) throw error;

      router.push(`/requests/${data.id}`);
    } catch (error: any) {
      console.error("Error creating request:", error);
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PermissionGuard resource="page:requests">
      <div className="smart-form-container" style={{ padding: '2rem' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button onClick={() => router.back()} className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%' }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Create New Request</h1>
            <p style={{ margin: 0, color: '#64748b' }}>Open a ticket or assign a task to a team member.</p>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '1rem', padding: '2rem', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          
          <div className="form-grid col-2">
            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label className="input-label">Title <span className="required-star">*</span></label>
              <input 
                type="text" 
                name="title" 
                value={formData.title} 
                onChange={handleChange} 
                className="input-field" 
                placeholder="Brief summary of the request" 
              />
            </div>

            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label className="input-label">Description</label>
              <textarea 
                name="description" 
                value={formData.description} 
                onChange={handleChange} 
                className="input-field" 
                rows={5} 
                placeholder="Detailed explanation..."
              />
            </div>

            <div className="input-group">
              <label className="input-label">Category <span className="required-star">*</span></label>
              <select name="category_id" value={formData.category_id} onChange={handleChange} className="input-field">
                <option value="">Select Category...</option>
                {lookups.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Priority (SLA) <span className="required-star">*</span></label>
              <select name="priority_id" value={formData.priority_id} onChange={handleChange} className="input-field">
                <option value="">Select Priority...</option>
                {lookups.priorities.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.sla_days !== undefined && p.sla_days !== null ? `(${p.sla_days} day${p.sla_days > 1 ? 's' : ''})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Assignee</label>
              <select name="assignee_id" value={formData.assignee_id} onChange={handleChange} className="input-field">
                <option value="">Unassigned (Leave open)</option>
                {lookups.users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Link to Property (Optional)</label>
              <select name="asset_id" value={formData.asset_id} onChange={handleChange} className="input-field">
                <option value="">None</option>
                {lookups.assets.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.parcel_number} {a.address ? `- ${a.address}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

        </div>

        <div className="form-actions-bar">
          <button className="btn-secondary" onClick={() => router.push('/requests')}>
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button className="primary-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {loading ? "Creating..." : "Create Request"}
          </button>
        </div>

      </div>
    </PermissionGuard>
  );
}
