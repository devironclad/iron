"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus, Search, Loader2, ArrowRight,
  ClipboardList, Calendar, Clock, Trash2, CheckCircle2, AlertTriangle
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { getCurrentUserPermissions, hasPermission, Permission } from "@/lib/permissions";
import "./requests.css";

type LookupItem = { id: string; name: string; color?: string; is_closed?: boolean };
type UserOption = { id: string; full_name: string };

type RequestRow = {
  id: number;
  title: string;
  due_date: string;
  asset_id?: number | null;
  requester_id?: string | null;
  requester?: { full_name?: string; avatar_url?: string } | null;
  assignee?: { full_name?: string; avatar_url?: string } | null;
  category?: { name?: string; color?: string } | null;
  status?: { name?: string; color?: string; is_closed?: boolean } | null;
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [requestToDelete, setRequestToDelete] = useState<RequestRow | null>(null);
  const [toastMsg, setToastMsg] = useState<{ title: string, desc: string } | null>(null);

  // Lookups for filters
  const [statuses, setStatuses] = useState<LookupItem[]>([]);
  const [requesters, setRequesters] = useState<UserOption[]>([]);

  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedRequester, setSelectedRequester] = useState("all");

  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, Permission> | null>(null);

  useEffect(() => {
    fetchLookups();
    async function initCurrentUser() {
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUser(session?.user ?? null);
    }
    initCurrentUser();
    getCurrentUserPermissions().then(setUserPermissions);
  }, []);

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedStatus, selectedRequester, showMyTasks, showOverdueOnly, currentUser]);

  async function fetchLookups() {
    const [statRes, reqRes] = await Promise.all([
      supabase.from("ls_request_status").select("*").order("name"),
      supabase.from("ls_users_metadata").select("id, full_name").eq("user_type", "employee").order("full_name")
    ]);

    setStatuses(statRes.data || []);
    setRequesters(reqRes.data || []);
  }

  async function fetchRequests() {
    setLoading(true);
    try {
      let query = supabase.from("ls_requests").select(`
        *,
        requester:ls_users_metadata!requester_id(full_name, avatar_url),
        assignee:ls_users_metadata!assignee_id(full_name, avatar_url),
        category:ls_request_category(name, color),
        status:ls_request_status!inner(name, color, is_closed)
      `, { count: "exact" }).order('created_at', { ascending: false });

      if (selectedStatus !== "all") query = query.eq("status_id", selectedStatus);
      if (selectedRequester !== "all") query = query.eq("requester_id", selectedRequester);

      if (showMyTasks && currentUser) {
        query = query.eq("assignee_id", currentUser.id);
      }

      if (showOverdueOnly) {
        query = query.lt("due_date", new Date().toISOString()).eq("status.is_closed", false);
      }

      if (searchTerm) {
        query = query.ilike('title', `%${searchTerm}%`);
      }

      const { data, error, count } = await query.limit(50);

      if (error) throw error;
      setRequests(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error("Error fetching requests:", err);
    } finally {
      setLoading(false);
    }
  }

  const canEdit = userPermissions !== null && hasPermission(userPermissions, 'page:requests', 'edit');

  const handleDelete = (req: RequestRow) => {
    if (!canEdit) { alert("You don't have permission to delete requests."); return; }
    setRequestToDelete(req);
  };

  const confirmDelete = async () => {
    if (!requestToDelete || !canEdit) return;
    
    try {
      const { error } = await supabase
        .from("ls_requests")
        .delete()
        .eq("id", requestToDelete.id);
        
      if (error) throw error;
      setRequests(prev => prev.filter(r => r.id !== requestToDelete.id));
      setToastMsg({ title: "Successfully Deleted", desc: "The request was permanently removed." });
      setTimeout(() => setToastMsg(null), 3000);
      setRequestToDelete(null);
    } catch (err) {
      console.error("Error deleting request:", err);
      alert("Failed to delete request.");
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isOverdue = (dateStr: string, isClosed: boolean | undefined) => {
    if (!dateStr || isClosed) return false;
    return new Date(dateStr) < new Date();
  };

  return (
    <PermissionGuard resource="page:requests">
      <div className="requests-container">
        
        {requestToDelete && (
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
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Delete Request</h2>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>ID: #{requestToDelete.id}</p>
                </div>
              </div>
              
              <p style={{ color: '#475569', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
                Are you absolutely sure you want to permanently delete <strong>&quot;{requestToDelete.title}&quot;</strong>? This action cannot be undone.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button 
                  onClick={() => setRequestToDelete(null)}
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

        {/* Header */}
        <div className="page-header">
          <div className="page-header-text">
            <h1 className="page-title">Internal Requests<span className="dot">.</span></h1>
            <p className="page-subtitle">Manage tickets, tasks, and cross-department approvals.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {canEdit && (
              <Link href="/requests/new" className="primary-btn" style={{ textDecoration: 'none' }}>
                <Plus className="w-5 h-5" />
                New Request
              </Link>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="search-filter-bar">
          <div className="search-wrapper">
            <Search className="w-5 h-5 search-icon" />
            <input
              type="text"
              placeholder="Search by title..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="bar-actions">
            <div className="totalizer">
              <strong>{totalCount}</strong> requests
            </div>

            <div className="view-toggle">
              <button 
                onClick={() => setShowMyTasks(false)} 
                className={`view-btn ${!showMyTasks ? 'active' : ''}`}
              >
                All Tasks
              </button>
              <button 
                onClick={() => setShowMyTasks(true)} 
                className={`view-btn ${showMyTasks ? 'active' : ''}`}
              >
                My Tasks
              </button>
            </div>

            <select className="auc-filter-select" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <select className="auc-filter-select" value={selectedRequester} onChange={e => setSelectedRequester(e.target.value)}>
              <option value="all">All Requesters</option>
              {requesters.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>

            <button
              type="button"
              onClick={() => setShowOverdueOnly(v => !v)}
              className="view-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                border: `1px solid ${showOverdueOnly ? '#ef4444' : 'var(--border-subtle)'}`,
                backgroundColor: showOverdueOnly ? '#ef4444' : 'var(--bg-base)',
                color: showOverdueOnly ? 'white' : 'var(--text-secondary)',
              }}
              title="Show only overdue requests"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="requests-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Requester</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <ClipboardList className="w-10 h-10 opacity-50" />
                        <span>No requests found matching your filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : requests.map((req) => (
                  <tr key={req.id}>
                    <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>REQ-{req.id}</td>
                    <td style={{ fontWeight: 600, maxWidth: '250px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {req.title}
                      </div>
                      {req.asset_id && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>
                          Linked to Asset #{req.asset_id}
                        </span>
                      )}
                    </td>
                    
                    <td>
                      <div className="flex-center">
                        <div className="user-avatar-small">
                          {req.requester?.full_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        {req.requester?.full_name || 'System'}
                      </div>
                    </td>

                    <td>
                      {req.assignee ? (
                        <div className="flex-center">
                          <div className="user-avatar-small" style={{ backgroundColor: '#e0e7ff', color: '#4f46e5' }}>
                            {req.assignee.full_name?.charAt(0).toUpperCase()}
                          </div>
                          {req.assignee.full_name}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ 
                        backgroundColor: req.status?.color ? `${req.status.color}20` : '#f1f5f9', 
                        color: req.status?.color || '#475569' 
                      }}>
                        {req.status?.name || 'Unknown'}
                      </span>
                    </td>

                    <td>
                      <div className="flex-center" style={{ 
                        gap: '0.4rem', 
                        color: isOverdue(req.due_date, req.status?.is_closed) ? '#ef4444' : 'inherit',
                        fontWeight: isOverdue(req.due_date, req.status?.is_closed) ? 600 : 400
                      }}>
                        {isOverdue(req.due_date, req.status?.is_closed) ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5 text-muted" />}
                        {formatDate(req.due_date)}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link 
                          href={`/requests/${req.id}`} 
                          className="btn-slate" 
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', textDecoration: 'none' }}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        {canEdit && req.requester_id === currentUser?.id && (
                          <button 
                            onClick={() => handleDelete(req)}
                            className="btn-secondary"
                            style={{ padding: '0.4rem', color: '#475569', borderColor: '#cbd5e1' }}
                            title="Delete Request"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Toast Notification */}
        {toastMsg && (
          <div style={{
            position: 'fixed', bottom: '2rem', right: '2rem',
            backgroundColor: '#10b981', color: 'white',
            padding: '1rem 1.5rem', borderRadius: '0.75rem',
            boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.5), 0 8px 10px -6px rgba(16, 185, 129, 0.1)',
            zIndex: 10000, display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            animation: 'slideUpFade 0.3s ease-out forwards'
          }}>
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" style={{ marginTop: '0.125rem' }} />
            <div>
              <h4 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>{toastMsg.title}</h4>
              <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>{toastMsg.desc}</p>
            </div>
          </div>
        )}

      </div>
    </PermissionGuard>
  );
}
