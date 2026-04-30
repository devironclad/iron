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
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./access.css";

const RESOURCES = [
  { id: "page:dashboard", label: "Dashboard Page", category: "Pages" },
  { id: "page:auctions", label: "Auctions Page", category: "Pages" },
  { id: "page:properties", label: "Properties Page", category: "Pages" },
  { id: "page:manager", label: "Manager Page", category: "Pages" },
  { id: "page:access", label: "Access Control Page", category: "Pages" },
  { id: "page:settings", label: "Settings Page", category: "Pages" },
  { id: "tab:general", label: "Property: General Tab", category: "Property Tabs" },
  { id: "tab:location", label: "Property: Location Tab", category: "Property Tabs" },
  { id: "tab:attributes", label: "Property: Attributes Tab", category: "Property Tabs" },
  { id: "tab:financials", label: "Property: Financials Tab", category: "Property Tabs" },
  { id: "tab:acquisition", label: "Property: Acquisition Tab", category: "Property Tabs" },
  { id: "tab:amenities", label: "Property: Amenities Tab", category: "Property Tabs" },
  { id: "tab:links", label: "Property: Links Tab", category: "Property Tabs" },
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
  const [newUser, setNewUser] = useState({ full_name: '', email: '', profile_id: '' });

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
          *,
          ls_user_profiles(profile_id)
        `);
      
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

  async function handleInviteUser() {
    if (!newUser.email || !newUser.full_name) return;
    setSaving(true);
    try {
      // NOTE: In a real app with Service Role, you would call an Edge Function to invite.
      // For now, we will:
      // 1. Tell Supabase to send an invitation (if configured)
      // 2. OR simply add to our metadata table if the user exists.
      
      // Since we can't 'Invite' easily without Service Role from client,
      // we will use the 'signUp' method which is allowed.
      // WARNING: This logs out the admin if not careful, so we use a different approach:
      // We will tell the user to use the Supabase Dashboard to 'Add User', 
      // but we will 'Pre-register' them here to show the flow.
      
      // For this MVP, we insert into metadata. If they have no ID, it fails FK.
      // So we suggest the user creates the auth record first.
      
      alert("In this Supabase setup, please first add the user in your 'Supabase Dashboard -> Authentication -> Users'. \n\nOnce added, they will automatically appear here to have their profile assigned.");
      
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
      setShowAddUserModal(false);
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
                    <th>Assigned Profile</th>
                    <th className="center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={4} className="center" style={{ padding: '3rem', color: '#94a3b8' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <Loader2 className="w-8 h-8 animate-spin opacity-20" />
                        <span>No users found in metadata yet. Make sure to refresh (F5).</span>
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
                            value={u.ls_user_profiles?.profile_id || ""}
                            onChange={(e) => updateUserProfile(u.id, e.target.value)}
                            disabled={saving}
                          >
                            <option value="">No Profile (No Access)</option>
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="center">
                          <button className="delete-btn-mini"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="invite-footer">
              <p>In Supabase, users must be invited or sign up via <strong>Authentication</strong> settings before appearing here.</p>
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
                  onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="john@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Initial Profile</label>
                <select 
                  className="form-input"
                  value={newUser.profile_id}
                  onChange={(e) => setNewUser({...newUser, profile_id: e.target.value})}
                >
                  <option value="">Select a profile...</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <button 
                className="save-btn" 
                style={{ width: '100%', justifyContent: 'center', background: '#10b981' }}
                onClick={handleInviteUser}
                disabled={saving || !newUser.email}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Invite User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
