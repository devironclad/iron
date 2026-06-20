"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, MessageSquareText, Info, Loader2, Save, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPropId } from "@/lib/utils";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "../../auctions/new/form.css";
import "../../properties/[id]/details.css";
import "../requests.css";

export default function RequestDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [request, setRequest] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [newComment, setNewComment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  useEffect(() => {
    scrollToBottom();
  }, [comments]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Get current user
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUser(session?.user);

      // 2. Fetch Request Details
      const { data: reqData, error: reqError } = await supabase.from("ls_requests").select(`
        *,
        requester:ls_users_metadata!requester_id(full_name, avatar_url),
        assignee:ls_users_metadata!assignee_id(full_name, avatar_url),
        category:ls_request_category(name, color),
        priority:ls_request_priority(name, color),
        status:ls_request_status(name, color, is_closed),
        asset:ls_assets(id, ref_id, parcel_number, address, ls_county(name, state))
      `).eq("id", params.id).single();

      if (reqError) throw reqError;
      setRequest(reqData);
      setSelectedStatus(reqData.status_id);

      // 3. Fetch Statuses for dropdown
      const { data: statData } = await supabase.from("ls_request_status").select("*").not("name", "in", '("Open","In Progress")').order("name");
      setStatuses(statData || []);

      // 4. Fetch Comments
      fetchComments();

    } catch (err: any) {
      console.error("Error fetching data:", err);
      alert("Error loading request details.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchComments() {
    const { data: commentsData } = await supabase.from("ls_request_comments").select(`
      *,
      author:ls_users_metadata!author_id(full_name, avatar_url)
    `).eq("request_id", params.id).order("created_at", { ascending: true });
    
    setComments(commentsData || []);
  }

  const handlePostComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    
    setSaving(true);
    try {
      const payload = {
        request_id: params.id,
        author_id: currentUser.id,
        content: newComment.trim(),
        is_system: false
      };

      const { error } = await supabase.from("ls_request_comments").insert(payload);
      if (error) throw error;

      setNewComment("");
      fetchComments();
    } catch (err: any) {
      console.error("Error posting comment:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => setShowDeleteConfirm(true);

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      const { error } = await supabase
        .from("ls_requests")
        .delete()
        .eq("id", params.id);

      if (error) throw error;
      router.push('/requests');
    } catch (err: any) {
      console.error("Error deleting request:", err);
      alert("Failed to delete request.");
    }
  };

  const handleMarkInProgress = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      const { data: statusRow } = await supabase
        .from("ls_request_status")
        .select("id, name")
        .eq("name", "In Progress")
        .single();

      if (!statusRow) throw new Error("Status 'In Progress' not found.");

      await supabase.from("ls_requests").update({ status_id: statusRow.id }).eq("id", params.id);
      await supabase.from("ls_request_comments").insert({
        request_id: params.id,
        author_id: currentUser.id,
        content: `Status changed to: ${statusRow.name}`,
        is_system: true
      });
      fetchData();
    } catch (err: any) {
      console.error("Error updating status:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (selectedStatus === request.status_id || !currentUser) return;
    
    setSaving(true);
    try {
      // 1. Update Request
      const { error: updError } = await supabase.from("ls_requests")
        .update({ status_id: selectedStatus })
        .eq("id", params.id);
      
      if (updError) throw updError;

      // 2. Insert System Message
      const newStatusObj = statuses.find(s => s.id === selectedStatus);
      const systemMessage = `Status changed to: ${newStatusObj?.name}`;
      
      await supabase.from("ls_request_comments").insert({
        request_id: params.id,
        author_id: currentUser.id,
        content: systemMessage,
        is_system: true
      });

      router.push('/requests');
    } catch (err: any) {
      console.error("Error changing status:", err);
      alert("Error updating status.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!request) return <div>Request not found.</div>;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  

  return (
    <PermissionGuard resource="page:requests">
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '400px',
            padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            display: 'flex', flexDirection: 'column', gap: '1.25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#ef4444' }}>
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.75rem' }}>
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Delete Request</h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>This action cannot be undone.</p>
              </div>
            </div>
            <p style={{ color: '#475569', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete request <strong>REQ-{request.id}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} className="primary-btn" style={{ flex: 1, justifyContent: 'center', backgroundColor: '#ef4444', borderColor: '#ef4444' }}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="requests-container" style={{ paddingBottom: '6rem' }}>
        
        <div className="details-header" style={{ marginBottom: '1rem', height: '90px', padding: '0 2.5rem' }}>
          <div className="header-left">
            <button onClick={() => router.push('/requests')} className="back-btn">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="header-title-area">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="id-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  REQ-{request.id}
                </div>
                <h1 className="header-title" style={{ fontSize: '1.5rem', margin: 0 }}>{request.title}</h1>
              </div>
              <div className="header-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
                <span className="badge" style={{ backgroundColor: request.status?.color ? `${request.status.color}20` : '#f1f5f9', color: request.status?.color || '#475569', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                  {request.status?.name}
                </span>
                <span className="badge" style={{ backgroundColor: request.priority?.color, color: 'white', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                  {request.priority?.name} Priority
                </span>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>• Created on {formatDate(request.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {request.assignee_id === currentUser?.id && request.status?.name === "Open" && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            backgroundColor: '#fffbeb', border: '1.5px solid #f59e0b',
            borderRadius: '0.75rem', padding: '0.875rem 1.25rem', marginBottom: '1rem',
            flexWrap: 'wrap'
          }}>
            <AlertTriangle className="w-5 h-5" style={{ color: '#d97706', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: '200px' }}>
              <span style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem' }}>
                This request is assigned to you and still open.
              </span>
              <span style={{ color: '#b45309', fontSize: '0.85rem', marginLeft: '0.4rem' }}>
                Have you started working on it? Update the status to keep the team informed.
              </span>
            </div>
            <button
              onClick={handleMarkInProgress}
              disabled={saving}
              style={{
                backgroundColor: '#f59e0b', color: 'white', border: 'none',
                borderRadius: '0.5rem', padding: '0.5rem 1rem',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0
              }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Mark as In Progress
            </button>
          </div>
        )}

        <div className="request-detail-layout">
          
          {/* Left Panel: Details */}
          <div className="request-sidebar">
            <div className="req-sidebar-section">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>Details</h3>
              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {request.description || <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>No description provided.</span>}
              </p>
            </div>

            <div className="req-sidebar-section">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div>
                  <div className="req-label">Category</div>
                  <div className="req-value">{request.category?.name || '--'}</div>
                </div>
                <div>
                  <div className="req-label">Due Date</div>
                  <div className="req-value" style={{ color: new Date(request.due_date) < new Date() && !request.status?.is_closed ? '#ef4444' : 'inherit' }}>
                    {formatDate(request.due_date)}
                  </div>
                </div>
                <div>
                  <div className="req-label">Requester</div>
                  <div className="req-value">{request.requester?.full_name || 'System'}</div>
                </div>
                <div>
                  <div className="req-label">Assignee</div>
                  <div className="req-value">{request.assignee?.full_name || '--'}</div>
                </div>
              </div>
            </div>

            {request.asset && (
              <div className="req-sidebar-section" style={{ backgroundColor: '#f8fafc', marginTop: 'auto' }}>
                <div className="req-label">Linked Property</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.25rem' }}>
                  {formatPropId(request.asset.ref_id, request.asset.id)}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                  {request.asset.ls_county?.state || '--'} - {request.asset.ls_county?.name || '--'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Parcel: {request.asset.parcel_number}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Chat/Timeline */}
          <div className="chat-panel">
            <div className="chat-header">
              <MessageSquareText className="w-5 h-5 text-primary" />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>Discussion Timeline</h2>
            </div>
            
            <div className="chat-messages">
              {comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                  No comments yet. Start the discussion below.
                </div>
              ) : (
                comments.map((comment) => {
                  if (comment.is_system) {
                    return (
                      <div key={comment.id} className="system-msg">
                        <Info className="w-3.5 h-3.5" />
                        {comment.author?.full_name} • {comment.content} • {formatDate(comment.created_at)}
                      </div>
                    );
                  }

                  const isMine = currentUser?.id === comment.author_id;
                  
                  return (
                    <div key={comment.id} className={`msg-wrapper ${isMine ? 'mine' : 'theirs'}`}>
                      <div className="msg-meta">
                        <span>{isMine ? 'You' : comment.author?.full_name || 'System'}</span>
                        <span style={{ fontSize: '0.65rem' }}>{formatDate(comment.created_at)} at {formatTime(comment.created_at)}</span>
                      </div>
                      <div className="msg-bubble">
                        {comment.content}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <textarea
                className="input-field"
                style={{ flex: 1, resize: 'none', borderRadius: '0.75rem', backgroundColor: '#f8fafc' }}
                rows={2}
                placeholder="Type a message or internal note..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handlePostComment();
                  }
                }}
              />
              <button 
                className="btn-slate" 
                style={{ height: '100%', padding: '0 1.25rem', borderRadius: '0.75rem' }}
                onClick={handlePostComment}
                disabled={saving || !newComment.trim()}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>

        </div>

        <div className="form-actions-bar">
          <button className="btn-secondary" onClick={() => router.push('/requests')}>
            <ArrowLeft className="w-4 h-4" />
            Back to Requests
          </button>

          {request.requester_id === currentUser?.id && (
            <button 
              className="btn-secondary" 
              onClick={handleDelete} 
              style={{ color: '#ef4444', borderColor: '#fee2e2' }}
            >
              <Trash2 className="w-4 h-4" />
              Delete Request
            </button>
          )}

          <div style={{ flex: 1 }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Status:</span>
            <select 
              className="req-filter-select" 
              style={{ width: '180px', height: '38px', padding: '0 0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '0.85rem' }}
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button 
              className="primary-btn" 
              onClick={handleStatusChange} 
              disabled={saving || selectedStatus === request.status_id}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Update Status
            </button>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}
