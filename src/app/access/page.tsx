"use client";

import { useState, useEffect } from "react";
import {
  Users,
  ShieldCheck,
  Settings2,
  Plus,
  Save,
  Trash2,
  Eye,
  Edit3,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mail,
  UserCircle,
  X,
  Send,
  Pencil
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { startPreview } from "@/lib/impersonation";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "./access.css";

const RESOURCES = [
  { id: "page:dashboard", label: "Dashboard Page", category: "Pages" },
  { id: "page:auctions", label: "Research: Auctions", category: "Pages" },
  { id: "page:auctions:rejected", label: "Research: Rejecteds", category: "Pages" },
  { id: "page:properties:ironclad", label: "Properties: Ironclad", category: "Pages" },
  { id: "page:properties:broker", label: "Properties: Broker", category: "Pages" },
  { id: "page:properties:partners", label: "Properties: Partners", category: "Pages" },
  { id: "page:requests", label: "Requests Page", category: "Pages" },
  { id: "page:manager", label: "Manager Page", category: "Pages" },
  { id: "page:access", label: "Access Control Page", category: "Pages" },
  { id: "page:settings", label: "Settings Page", category: "Pages" },
  { id: "tab:general",      label: "Property: Research Tab",       category: "Property Tabs" },
  { id: "tab:amenities",   label: "Property: Amenities Tab",      category: "Property Tabs" },
  { id: "tab:values",      label: "Property: Values Tab",         category: "Property Tabs" },
  { id: "tab:acquisition", label: "Property: Development Tab",    category: "Property Tabs" },
  { id: "tab:docs",        label: "Property: Documentation Tab",  category: "Property Tabs" },
  { id: "tab:tax",         label: "Property: Tax Tab",            category: "Property Tabs" },
  { id: "tab:sales",       label: "Property: Sales Tab",          category: "Property Tabs" },
  { id: "tab:strategy",    label: "Property: Strategy Tab",       category: "Property Tabs" },
  { id: "tab:links",       label: "Property: Marketing Tab",      category: "Property Tabs" },
  // Manager Tables
  { id: "table:ls_origem", label: "Manager: Origem", category: "Manager Tables" },
  { id: "table:ls_status", label: "Manager: Status", category: "Manager Tables" },
  { id: "table:ls_priority", label: "Manager: Priority", category: "Manager Tables" },
  { id: "table:ls_county", label: "Manager: County", category: "Manager Tables" },
  { id: "table:ls_auction_type", label: "Manager: Auction Type", category: "Manager Tables" },
  { id: "table:ls_auction_model", label: "Manager: Auction Model", category: "Manager Tables" },
  { id: "table:ls_property_type", label: "Manager: Property Type", category: "Manager Tables" },
  { id: "table:ls_fema", label: "Manager: FEMA", category: "Manager Tables" },
  { id: "table:ls_wetlands", label: "Manager: Wetlands", category: "Manager Tables" },
  { id: "table:ls_debit", label: "Manager: Debit", category: "Manager Tables" },
  { id: "table:ls_gismap", label: "Manager: GIS Map", category: "Manager Tables" },
  { id: "table:ls_property_access", label: "Manager: Property Access", category: "Manager Tables" },
  { id: "table:ls_road_access", label: "Manager: Road Access", category: "Manager Tables" },
  { id: "table:ls_ref_construction", label: "Manager: Ref Construction", category: "Manager Tables" },
  { id: "table:ls_amenity_category", label: "Manager: Amenity Categories", category: "Manager Tables" },
  { id: "table:ls_amenity_type", label: "Manager: Amenity Types", category: "Manager Tables" },
  { id: "table:ls_request_category", label: "Manager: Request Category", category: "Manager Tables" },
  // Actions
  { id: "action:export_auctions", label: "Action: Export Auctions Data", category: "Actions" },
];

export default function AccessPage() {
  const [activeTab, setActiveTab] = useState<"profiles" | "users">("profiles");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [permissions, setPermissions] = useState<Record<string, { can_view: boolean, can_edit: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', user_type: 'employee', profile_id: '' });
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch Profiles
      const { data: profData } = await supabase.from("ls_profiles").select("*").order("name");
      setProfiles(profData || []);
      
      if (profData && profData.length > 0 && !selectedProfile) {
        handleSelectProfile(profData[0]);
      }

      // Fetch Users with their profiles
      const { data: userData, error: userError } = await supabase
        .from("ls_users_metadata")
        .select(`
          id, email, full_name, avatar_url, user_type, invited_at,
          ls_user_profiles(profile_id)
        `)
        .order("full_name", { ascending: true });
      
      if (userError) {
        console.error("Error fetching users:", JSON.stringify(userError, null, 2));
      }
      setUsers(userData || []);
    } catch (err) {
      console.error("Critical error in fetchData:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectProfile(profile: any) {
    setSelectedProfile(profile);
    setLoading(true);
    
    const { data } = await supabase
      .from("ls_permissions")
      .select("*")
      .eq("profile_id", profile.id);
    
    const permMap: any = {};
    RESOURCES.forEach(r => {
      const found = data?.find(p => p.resource_key === r.id);
      permMap[r.id] = {
        can_view: found ? found.can_view : false,
        can_edit: found ? found.can_edit : false
      };
    });
    setPermissions(permMap);
    setLoading(false);
  }

  const togglePermission = (resourceKey: string, type: 'can_view' | 'can_edit') => {
    setPermissions((prev: any) => ({
      ...prev,
      [resourceKey]: {
        ...prev[resourceKey],
        [type]: !prev[resourceKey][type]
      }
    }));
  };

  async function savePermissions() {
    if (!selectedProfile) return;
    setSaving(true);
    setMessage(null);

    try {
      const payload = Object.entries(permissions).map(([key, val]) => ({
        profile_id: selectedProfile.id,
        resource_key: key,
        can_view: val.can_view,
        can_edit: val.can_edit
      }));

      const { error } = await supabase.from("ls_permissions").upsert(payload, { onConflict: "profile_id, resource_key" });
      if (error) throw error;
      setMessage({ type: 'success', text: "Permissions updated successfully!" });
    } catch (err: any) {
      setMessage({ type: 'error', text: "Error saving permissions: " + err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function updateUserType(userId: string, userType: string) {
    try {
      const { error } = await supabase
        .from("ls_users_metadata")
        .update({ user_type: userType })
        .eq("id", userId);

      if (error) throw error;

      setUsers((prev: any[]) => prev.map(u => u.id === userId ? { ...u, user_type: userType } : u));
      setMessage({ type: 'success', text: "User type updated!" });
    } catch (err: any) {
      setMessage({ type: 'error', text: "Error updating user type: " + err.message });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function updateUserProfile(userId: string, profileId: string) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ls_user_profiles")
        .upsert({ user_id: userId, profile_id: profileId === "" ? null : profileId });
      
      if (error) throw error;
      
      setUsers((prev: any[]) => prev.map(u => u.id === userId ? { ...u, ls_user_profiles: { profile_id: profileId } } : u));
      setMessage({ type: 'success', text: "User profile updated!" });
    } catch (err: any) {
      setMessage({ type: 'error', text: "Error updating user: " + err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleCreateUser() {
    if (!newUser.email || !newUser.full_name) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(newUser),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      // Add new user to local state immediately (no need to refetch)
      setUsers((prev: any[]) => [
        ...prev,
        {
          id: json.user.id,
          email: json.user.email,
          full_name: json.user.full_name,
          user_type: json.user.user_type,
          invited_at: null,
          ls_user_profiles: newUser.profile_id ? { profile_id: newUser.profile_id } : null,
        },
      ]);

      setMessage({ type: 'success', text: `User ${json.user.full_name} created successfully.` });
      setShowAddUserModal(false);
      setNewUser({ full_name: '', email: '', user_type: 'employee', profile_id: '' });
    } catch (err: any) {
      setMessage({ type: 'error', text: "Error creating user: " + err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  async function handleSendInvite(userId: string, email: string) {
    setInvitingUserId(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: userId, email }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setUsers((prev: any[]) =>
        prev.map(u => u.id === userId ? { ...u, invited_at: new Date().toISOString() } : u)
      );
      setMessage({ type: 'success', text: `Invite sent to ${email}.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: "Error sending invite: " + err.message });
    } finally {
      setInvitingUserId(null);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  function openEditModal(user: any) {
    setEditingUser(user);
    setEditForm({ full_name: user.full_name || '', email: user.email || '' });
    setEditError(null);
  }

  async function handleEditUser() {
    if (!editingUser || !editForm.full_name || !editForm.email) return;
    setSaving(true);
    setEditError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Only send fields that actually changed
      const payload: Record<string, string> = { user_id: editingUser.id };
      if (editForm.full_name !== editingUser.full_name) payload.full_name = editForm.full_name;
      if (editForm.email !== editingUser.email) payload.email = editForm.email;

      if (Object.keys(payload).length === 1) {
        // Nothing changed
        setEditingUser(null);
        return;
      }

      const res = await fetch("/api/users/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setUsers((prev: any[]) =>
        prev.map(u => u.id === editingUser.id ? { ...u, ...editForm } : u)
      );
      setMessage({ type: 'success', text: "User updated successfully." });
      setEditingUser(null);
    } catch (err: any) {
      console.error("Edit user error:", err);
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser() {
    if (!deletingUser) return;
    setConfirmingDelete(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/users/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: deletingUser.id }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setUsers((prev: any[]) => prev.filter(u => u.id !== deletingUser.id));
      setMessage({ type: 'success', text: `User ${deletingUser.full_name} removed.` });
      setDeletingUser(null);
    } catch (err: any) {
      setMessage({ type: 'error', text: "Error deleting user: " + err.message });
    } finally {
      setConfirmingDelete(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  if (loading && profiles.length === 0) {
    return (
      <div className="access-loading">
        <Loader2 className="w-10 h-10 animate-spin" />
        <span>Loading Access Control...</span>
      </div>
    );
  }

  return (
    <PermissionGuard resource="page:access">
      <div className="access-container">
      <div className="access-header">
        <div className="header-text">
          <h1 className="page-title">Access Control<span className="dot">.</span></h1>
          <p className="page-subtitle">Manage system users, profiles and granular permissions.</p>
        </div>
        
        <div className="access-tabs">
          <button 
            className={`access-tab-btn ${activeTab === "profiles" ? "active" : ""}`}
            onClick={() => setActiveTab("profiles")}
          >
            <ShieldCheck className="w-4 h-4" />
            Profiles & Permissions
          </button>
          <button 
            className={`access-tab-btn ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            <Users className="w-4 h-4" />
            User Management
          </button>
        </div>
      </div>

      {activeTab === "profiles" ? (
        <div className="access-layout">
          <div className="profile-sidebar">
            <div className="sidebar-section">
              <div className="section-header">
                <ShieldCheck className="w-4 h-4" />
                <span>SELECT PROFILE</span>
              </div>
              <div className="profile-list">
                {profiles.map(p => (
                  <button 
                    key={p.id} 
                    className={`profile-item ${selectedProfile?.id === p.id ? "active" : ""}`}
                    onClick={() => handleSelectProfile(p)}
                  >
                    <div className="profile-info">
                      <span className="profile-name">{p.name}</span>
                      <span className="profile-desc">{p.description}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 icon" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="permissions-area">
            {selectedProfile ? (
              <div className="permissions-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <Settings2 className="w-5 h-5 text-accent" />
                    <div>
                      <h3>{selectedProfile.name} Permissions</h3>
                      <p>Define what this profile can see and do in the system.</p>
                    </div>
                  </div>
                  <button className="save-btn" onClick={savePermissions} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                </div>

                {message && (
                  <div className={`message-banner ${message.type}`}>
                    {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {message.text}
                  </div>
                )}

                <div className="permissions-table-wrapper">
                  <table className="permissions-table">
                    <thead>
                      <tr>
                        <th>Resource / Screen</th>
                        <th className="center">View Access</th>
                        <th className="center">Edit Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="category-row"><td colSpan={3}>System Pages & Navigation</td></tr>
                      {RESOURCES.filter(r => r.category === "Pages").map(r => (
                        <tr key={r.id}>
                          <td className="resource-name">{r.label}</td>
                          <td className="center">
                            <label className="permission-toggle">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_view || false} 
                                onChange={() => togglePermission(r.id, 'can_view')}
                              />
                              <div className="toggle-slider"><Eye className="w-3 h-3 icon-view" /></div>
                            </label>
                          </td>
                          <td className="center">
                            <label className="permission-toggle edit">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_edit || false} 
                                onChange={() => togglePermission(r.id, 'can_edit')}
                              />
                              <div className="toggle-slider"><Edit3 className="w-3 h-3 icon-edit" /></div>
                            </label>
                          </td>
                        </tr>
                      ))}
                      <tr className="category-row"><td colSpan={3}>Internal Property Tabs</td></tr>
                      {RESOURCES.filter(r => r.category === "Property Tabs").map(r => (
                        <tr key={r.id}>
                          <td className="resource-name">{r.label}</td>
                          <td className="center">
                            <label className="permission-toggle">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_view || false} 
                                onChange={() => togglePermission(r.id, 'can_view')}
                              />
                              <div className="toggle-slider"><Eye className="w-3 h-3 icon-view" /></div>
                            </label>
                          </td>
                          <td className="center">
                            <label className="permission-toggle edit">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_edit || false} 
                                onChange={() => togglePermission(r.id, 'can_edit')}
                              />
                              <div className="toggle-slider"><Edit3 className="w-3 h-3 icon-edit" /></div>
                            </label>
                          </td>
                        </tr>
                      ))}
                      <tr className="category-row"><td colSpan={3}>Manager Tables</td></tr>
                      {RESOURCES.filter(r => r.category === "Manager Tables").map(r => (
                        <tr key={r.id}>
                          <td className="resource-name">{r.label}</td>
                          <td className="center">
                            <label className="permission-toggle">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_view || false} 
                                onChange={() => togglePermission(r.id, 'can_view')}
                              />
                              <div className="toggle-slider"><Eye className="w-3 h-3 icon-view" /></div>
                            </label>
                          </td>
                          <td className="center">
                            <label className="permission-toggle edit">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_edit || false} 
                                onChange={() => togglePermission(r.id, 'can_edit')}
                              />
                              <div className="toggle-slider"><Edit3 className="w-3 h-3 icon-edit" /></div>
                            </label>
                          </td>
                        </tr>
                      ))}
                      <tr className="category-row"><td colSpan={3}>Functional Actions</td></tr>
                      {RESOURCES.filter(r => r.category === "Actions").map(r => (
                        <tr key={r.id}>
                          <td className="resource-name">{r.label}</td>
                          <td className="center">
                            <label className="permission-toggle">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_view || false} 
                                onChange={() => togglePermission(r.id, 'can_view')}
                              />
                              <div className="toggle-slider"><Eye className="w-3 h-3 icon-view" /></div>
                            </label>
                          </td>
                          <td className="center">
                            <label className="permission-toggle edit">
                              <input 
                                type="checkbox" 
                                checked={permissions[r.id]?.can_edit || false} 
                                onChange={() => togglePermission(r.id, 'can_edit')}
                              />
                              <div className="toggle-slider"><Edit3 className="w-3 h-3 icon-edit" /></div>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-permissions">
                <ShieldCheck className="w-12 h-12 mb-4 opacity-20" />
                <p>Select a profile from the left to manage permissions.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="users-management-area">
          <div className="permissions-card">
            <div className="card-header">
              <div className="card-title-group">
                <Users className="w-5 h-5 text-accent" />
                <div>
                  <h3>User Assignments</h3>
                  <p>Assign profiles to registered users to control their access levels.</p>
                </div>
              </div>
              <button className="save-btn" onClick={() => setShowAddUserModal(true)}>
                <Plus className="w-4 h-4" />
                Add New User
              </button>
            </div>

            {message && (
              <div className={`message-banner ${message.type}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <div className="users-list-wrapper">
              <table className="permissions-table">
                <thead>
                  <tr>
                    <th>User Information</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>Assigned Profile</th>
                    <th className="center">Invite</th>
                    <th className="center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={6} className="center" style={{ padding: '3rem', color: '#94a3b8' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <Users className="w-8 h-8 opacity-20" />
                        <span>No users found. Click "Add New User" to create the first one.</span>
                      </div>
                    </td></tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div className="user-avatar-mini">
                              {u.avatar_url ? <img src={u.avatar_url} alt="" /> : <UserCircle className="w-5 h-5" />}
                            </div>
                            <span style={{ fontWeight: 600 }}>{u.full_name || 'Anonymous User'}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                            <Mail className="w-3 h-3" />
                            {u.email}
                          </div>
                        </td>
                        <td>
                          <select
                            className="profile-select"
                            value={u.user_type || "employee"}
                            onChange={(e) => updateUserType(u.id, e.target.value)}
                          >
                            <option value="employee">Employee</option>
                            <option value="partner">Partner</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="profile-select"
                            value={u.ls_user_profiles?.profile_id || ""}
                            onChange={(e) => updateUserProfile(u.id, e.target.value)}
                            disabled={saving}
                          >
                            <option value="">No Profile (No Access)</option>
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="center">
                          {u.invited_at ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.75rem', justifyContent: 'center' }}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Sent
                            </div>
                          ) : (
                            <button
                              title="Send invite email"
                              onClick={() => handleSendInvite(u.id, u.email)}
                              disabled={invitingUserId === u.id}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem',
                                fontWeight: 600, cursor: 'pointer', border: '1px solid #334155',
                                background: 'transparent', color: '#94a3b8',
                                opacity: invitingUserId === u.id ? 0.5 : 1,
                              }}
                            >
                              {invitingUserId === u.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Send className="w-3.5 h-3.5" />}
                              Invite
                            </button>
                          )}
                        </td>
                        <td className="center">
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            {u.user_type === 'partner' && (
                              <button
                                title="Preview as this partner"
                                className="delete-btn-mini"
                                onClick={() => {
                                  startPreview({ id: u.id, full_name: u.full_name || u.email });
                                  window.location.href = '/properties?source=partners';
                                }}
                                style={{ color: '#b45309' }}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              title="Edit user"
                              className="delete-btn-mini"
                              onClick={() => openEditModal(u)}
                              style={{ color: '#64748b' }}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              title="Delete user"
                              className="delete-btn-mini"
                              onClick={() => setDeletingUser(u)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="invite-footer">
              <p>Users created here are immediately available in the system. Send the invite when ready to grant access.</p>
            </div>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="modal-overlay">
          <div className="modal-content card shadow-xl" style={{ maxWidth: '500px', width: '90%', padding: '2rem' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <h2 className="text-xl font-bold">Add New User</h2>
              <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="John Doe"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="john@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">User Type</label>
                <select
                  className="form-input"
                  value={newUser.user_type}
                  onChange={(e) => setNewUser({ ...newUser, user_type: e.target.value })}
                >
                  <option value="employee">Employee</option>
                  <option value="partner">Partner</option>
                </select>
              </div>
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Initial Profile</label>
                <select
                  className="form-input"
                  value={newUser.profile_id}
                  onChange={(e) => setNewUser({ ...newUser, profile_id: e.target.value })}
                >
                  <option value="">Select a profile...</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '-0.5rem' }}>
                No invite email will be sent. You can send the invite later from the user list.
              </p>
            </div>

            <div className="modal-footer" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <button
                className="save-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleCreateUser}
                disabled={saving || !newUser.email || !newUser.full_name}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}
      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal-content card shadow-xl" style={{ maxWidth: '500px', width: '90%', padding: '2rem' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <h2 className="text-xl font-bold">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {editError && (
                <div className="message-banner error" style={{ marginBottom: 0 }}>
                  <AlertCircle className="w-4 h-4" />
                  {editError}
                </div>
              )}
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <button
                className="save-btn"
                style={{ flex: 1, justifyContent: 'center', background: 'transparent', border: '1px solid #334155', color: '#94a3b8' }}
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </button>
              <button
                className="save-btn"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleEditUser}
                disabled={saving || !editForm.full_name || !editForm.email}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingUser && (
        <div className="modal-overlay">
          <div className="modal-content card shadow-xl" style={{ maxWidth: '440px', width: '90%', padding: '2rem' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 className="text-xl font-bold">Remove User</h2>
              <button onClick={() => setDeletingUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <p style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>
              Are you sure you want to remove <strong style={{ color: '#f1f5f9' }}>{deletingUser.full_name}</strong>?
            </p>
            <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '2rem' }}>
              The email <strong>{deletingUser.email}</strong> will be freed and can be registered again.
            </p>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                className="save-btn"
                style={{ flex: 1, justifyContent: 'center', background: 'transparent', border: '1px solid #334155', color: '#94a3b8' }}
                onClick={() => setDeletingUser(null)}
              >
                Cancel
              </button>
              <button
                className="save-btn"
                style={{ flex: 1, justifyContent: 'center', background: '#ef4444' }}
                onClick={handleDeleteUser}
                disabled={confirmingDelete}
              >
                {confirmingDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PermissionGuard>
  );
}
