"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Plus, Search, Filter, Loader2, ArrowRight,
  ClipboardList, Calendar, Clock, Trash2, CheckCircle2
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "./requests.css";

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [requestToDelete, setRequestToDelete] = useState<any | null>(null);
  const [toastMsg, setToastMsg] = useState<{ title: string, desc: string } | null>(null);
  
  // Lookups for filters
  const [statuses, setStatuses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const router = useRouter();

  useEffect(() => {
    fetchLookups();
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    }
    getUser();
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [searchTerm, selectedStatus, selectedPriority, selectedCategory, showMyTasks, currentUser]);

  async function fetchLookups() {
    const [statRes, catRes, priRes] = await Promise.all([
      supabase.from("ls_request_status").select("*").order("name"),
      supabase.from("ls_request_category").select("*").order("name"),
      supabase.from("ls_request_priority").select("*").order("name")
    ]);
    
    setStatuses(statRes.data || []);
    setCategories(catRes.data || []);
    setPriorities(priRes.data || []);
  }

  async function fetchRequests() {
    setLoading(true);
    try {
      let query = supabase.from("ls_requests").select(`
        *,
        requester:ls_users_metadata!requester_id(full_name, avatar_url),
        assignee:ls_users_metadata!assignee_id(full_name, avatar_url),
        category:ls_request_category(name, color),
        priority:ls_request_priority(name, color),
        status:ls_request_status(name, color, is_closed)
      `).order('created_at', { ascending: false });

      if (selectedStatus !== "all") query = query.eq("status_id", selectedStatus);
      if (selectedPriority !== "all") query = query.eq("priority_id", selectedPriority);
      if (selectedCategory !== "all") query = query.eq("category_id", selectedCategory);
      
      if (showMyTasks && currentUser) {
        query = query.eq("assignee_id", currentUser.id);
      }
      
      if (searchTerm) {
        query = query.ilike('title', `%${searchTerm}%`);
      }

      const { data, error } = await query.limit(50);
      
      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error("Error fetching requests:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = (req: any) => {
    setRequestToDelete(req);
  };

  const confirmDelete = async () => {
    if (!requestToDelete) return;
    
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

  const isOverdue = (dateStr: string, isClosed: boolean) => {
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
                Are you absolutely sure you want to permanently delete <strong>"{requestToDelete.title}"</strong>? This action cannot be undone.
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
            <Link href="/requests/new" className="primary-btn" style={{ textDecoration: 'none' }}>
              <Plus className="w-5 h-5" />
              New Request
            </Link>
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

            <select className="auc-filter-select" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            
            <select className="auc-filter-select" value={selectedPriority} onChange={e => setSelectedPriority(e.target.value)}>
              <option value="all">All Priorities</option>
              {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
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
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-50" style={{ margin: '0 auto 0.5rem auto' }} />
                      No requests found matching your filters.
                    </td>
                  </tr>
                ) : requests.map((req) => (
                  <tr key={req.id}>
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
                        {req.requester_id === currentUser?.id && (
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
