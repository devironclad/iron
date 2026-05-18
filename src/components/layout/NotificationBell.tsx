"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let channel: any;
    let isMounted = true;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      // Fetch initial data
      const { data, error } = await supabase
        .from("ls_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (isMounted && !error) {
        setNotifications(data || []);
        setUnreadCount((data || []).filter(n => !n.is_read).length);
      }

      // Setup Realtime
      const channelName = `user-notifs-${user.id}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'ls_notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            if (isMounted) {
              setNotifications((prev) => [payload.new, ...prev].slice(0, 10));
              setUnreadCount((prev) => prev + 1);
            }
          }
        )
        .subscribe();
    };

    init();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      isMounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("ls_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  const markAsRead = async (id: string, link?: string) => {
    try {
      await supabase
        .from("ls_notifications")
        .update({ is_read: true })
        .eq("id", id);
        
      fetchNotifications();
      setIsOpen(false);
      if (link) {
        router.push(link);
      }
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("ls_notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
        
      fetchNotifications();
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await supabase
        .from("ls_notifications")
        .delete()
        .eq("id", id);
      fetchNotifications();
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  return (
    <div className="notification-wrapper" ref={dropdownRef} style={{ position: 'relative' }}>
      <button 
        className="header-action" 
        aria-label="Notifications"
        onClick={() => {
          if (!isOpen) fetchNotifications();
          setIsOpen(!isOpen);
        }}
        style={{ position: 'relative' }}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            backgroundColor: '#ef4444',
            color: 'white',
            fontSize: '0.65rem',
            fontWeight: 'bold',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid white'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '0',
          left: 'calc(100% + 10px)',
          width: '350px',
          backgroundColor: 'white',
          borderRadius: '1rem',
          boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0',
          zIndex: 100,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ 
            padding: '1rem 1.25rem', 
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc'
          }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                style={{ 
                  background: 'none', border: 'none', color: '#3b82f6', 
                  fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.25rem'
                }}
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ margin: '0 auto 0.5rem' }} />
                No new notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <div 
                  key={notif.id}
                  onClick={() => markAsRead(notif.id, notif.link)}
                  style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: notif.is_read ? 'white' : '#f0fdf4',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = notif.is_read ? '#f8fafc' : '#dcfce7'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = notif.is_read ? 'white' : '#f0fdf4'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: notif.is_read ? 600 : 700, color: '#0f172a' }}>
                      {notif.title}
                    </h4>
                    <button 
                      onClick={(e) => deleteNotification(e, notif.id)}
                      style={{ 
                        background: 'none', border: 'none', color: '#cbd5e1', 
                        cursor: 'pointer', padding: '0.2rem', marginLeft: '0.5rem'
                      }}
                      title="Delete notification"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                    {notif.message}
                  </p>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    {new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  
                  {!notif.is_read && (
                    <div style={{ 
                      position: 'absolute', top: '1rem', left: '0', 
                      width: '4px', height: 'calc(100% - 2rem)', 
                      backgroundColor: '#22c55e', borderRadius: '0 4px 4px 0' 
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
          
          <div style={{ 
            padding: '0.75rem', 
            textAlign: 'center', 
            borderTop: '1px solid #f1f5f9',
            backgroundColor: '#f8fafc'
          }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
              End of notifications
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
