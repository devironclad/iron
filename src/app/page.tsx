"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Gavel,
  Building2,
  BarChart3,
  Calendar,
  ArrowUpRight,
  Plus,
  Clock,
  MapPin,
  ChevronRight,
  PieChart,
  XCircle,
  Ticket,
  AlertTriangle,
  Timer
} from "lucide-react";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import "./dashboard.css";

const CHART_COLORS = ['#ca181a', '#1e293b', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalAssets: 0,
    ironcladAssets: 0,
    partnerAssets: 0,
    activeAuctions: 0,
    totalRejecteds: 0,
    priorityStats: [] as any[],
    weeklyStats: [] as any[],
    countyStats: [] as any[],
    upcomingEvents: [] as any[]
  });
  const [ticketsStats, setTicketsStats] = useState({
    openByCategory: [] as { name: string, color: string, count: number, percentage: number }[],
    byPriority: [] as { name: string, color: string, count: number, percentage: number }[],
    overdueCount: 0,
    avgResolutionHours: null as number | null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      try {
        const [
          { data: activeAuctionsRaw },
          { data: propertiesRaw },
          { data: rejectedPriorityRow },
          { data: ticketsData }
        ] = await Promise.all([
          supabase
            .from('ls_assets')
            .select('id, auction_date, county_id, ls_priority(name, color), ls_county(name, state)')
            .eq('record_type', 'AUCTION')
            .gte('auction_date', today)
            .range(0, 4999),
          supabase
            .from('ls_assets')
            .select('id, county_id, owner_type, ls_county(name, state)')
            .eq('record_type', 'PROPERTY')
            .range(0, 4999),
          supabase
            .from('ls_priority')
            .select('id')
            .eq('name', 'Rejected Property')
            .single(),
          supabase
            .from('ls_requests')
            .select(`
              created_at, updated_at, due_date,
              category:ls_request_category(name, color),
              priority:ls_request_priority(name, color),
              status:ls_request_status(is_closed)
            `)
        ]);

        const rejectedId = rejectedPriorityRow?.id;
        const properties = propertiesRaw || [];

        const activeAuctions = (activeAuctionsRaw || []).filter(a => {
          if (!rejectedId) return true;
          const priority = (Array.isArray(a.ls_priority) ? a.ls_priority[0] : a.ls_priority) as any;
          return priority?.name !== 'Rejected Property';
        });

        // Server-side counts for KPI cards
        const activeAuctionsQuery = (() => {
          let q = supabase
            .from('ls_assets')
            .select('id', { count: 'exact', head: true })
            .eq('record_type', 'AUCTION')
            .gte('auction_date', today);
          if (rejectedId) q = q.or(`priority_id.neq.${rejectedId},priority_id.is.null`);
          return q;
        })();

        const rejectedsQuery = rejectedId
          ? supabase.from('ls_assets').select('id', { count: 'exact', head: true }).eq('record_type', 'AUCTION').eq('priority_id', rejectedId)
          : Promise.resolve({ count: 0, data: null, error: null });

        const [{ count: activeAuctionsCount }, { count: rejectedsCount }] = await Promise.all([
          activeAuctionsQuery,
          rejectedsQuery
        ]);

        const totalRejecteds = rejectedsCount || 0;

        // Priority Stats
        const priorities: Record<string, { count: number, color: string }> = {};
        activeAuctions.forEach(auc => {
          const priority = (Array.isArray(auc.ls_priority) ? auc.ls_priority[0] : auc.ls_priority) as any;
          const pName = priority?.name || "Unassigned";
          const pColor = priority?.color || "#ca181a";
          if (!priorities[pName]) priorities[pName] = { count: 0, color: pColor };
          priorities[pName].count++;
        });

        const priorityArray = Object.entries(priorities).map(([name, data]) => ({
          name,
          count: data.count,
          color: data.color,
          percentage: activeAuctions.length > 0 ? (data.count / activeAuctions.length) * 100 : 0
        })).sort((a, b) => b.count - a.count);

        // Weekly Stats (Current + 3 Weeks)
        const weeklyArray = [];
        const currentTime = new Date();
        const now = new Date(currentTime);
        now.setHours(0, 0, 0, 0);

        for (let i = 0; i < 4; i++) {
          const start = new Date(now);
          start.setDate(now.getDate() + (i * 7));
          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          end.setHours(23, 59, 59, 999);

          const count = activeAuctions.filter(auc => {
            const d = new Date(auc.auction_date);
            return d >= start && d <= end;
          }).length;

          weeklyArray.push({
            label: i === 0 ? "Current Week" : `Week +${i}`,
            range: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            count,
            percentage: activeAuctions.length > 0 ? (count / Math.max(...[1, ...activeAuctions.map(() => 1)])) * 100 : 0 // Placeholder logic for bar width
          });
        }
        
        // Fix percentage for weekly bars based on max count in the 4 weeks
        const maxWeeklyCount = Math.max(...weeklyArray.map(w => w.count), 1);
        weeklyArray.forEach(w => {
          w.percentage = (w.count / maxWeeklyCount) * 100;
        });

        // County Stats (For Donut)
        const counties: Record<string, { count: number, state: string, countyName: string }> = {};
        properties.forEach(prop => {
          const county = (Array.isArray(prop.ls_county) ? prop.ls_county[0] : prop.ls_county) as any;
          const countyName = county?.name || "Other";
          const state = county?.state || "Other";
          const key = county ? `${county.name}_${state}` : "Other_Other";
          if (!counties[key]) {
            counties[key] = { count: 0, state, countyName };
          }
          counties[key].count++;
        });

        const countyArray = Object.entries(counties)
          .map(([key, data], index) => ({
            name: data.countyName,
            state: data.state,
            count: data.count,
            color: CHART_COLORS[index % CHART_COLORS.length],
            percentage: properties.length > 0 ? (data.count / properties.length) * 100 : 0
          }))
          .sort((a, b) => b.count - a.count);

        // Upcoming Events (Grouped by Date + County)
        const groupedEvents: Record<string, any> = {};
        activeAuctions.forEach(auc => {
          const rawDate = new Date(auc.auction_date);
          const dateStr = rawDate.toISOString().split('T')[0];
          const county = (Array.isArray(auc.ls_county) ? auc.ls_county[0] : auc.ls_county) as any;
          const countyName = county?.name || "Multiple Counties";
          const countyId = auc.county_id;
          const key = `${dateStr}-${countyName}`;
          
          if (!groupedEvents[key]) {
            groupedEvents[key] = {
              date: rawDate,
              dateStr: dateStr,
              county: countyName,
              countyId: countyId,
              state: county?.state || "FL",
              count: 0
            };
          }
          groupedEvents[key].count++;
        });

        const upcomingArray = Object.values(groupedEvents)
          .sort((a: any, b: any) => a.date.getTime() - b.date.getTime())
          .slice(0, 5);

        // Tickets
        const tickets = ticketsData || [];

        const openTickets = tickets.filter(t => {
          const status = (Array.isArray(t.status) ? t.status[0] : t.status) as any;
          return !status?.is_closed;
        });

        const overdueCount = openTickets.filter(t => t.due_date && new Date(t.due_date) < currentTime).length;

        const catMap: Record<string, { count: number, color: string }> = {};
        openTickets.forEach(t => {
          const cat = (Array.isArray(t.category) ? t.category[0] : t.category) as any;
          const name = cat?.name || 'Uncategorized';
          const color = cat?.color || '#94a3b8';
          if (!catMap[name]) catMap[name] = { count: 0, color };
          catMap[name].count++;
        });
        const maxCat = Math.max(...Object.values(catMap).map(c => c.count), 1);
        const openByCategory = Object.entries(catMap)
          .map(([name, d]) => ({ name, color: d.color, count: d.count, percentage: (d.count / maxCat) * 100 }))
          .sort((a, b) => b.count - a.count);

        const priMap: Record<string, { count: number, color: string }> = {};
        openTickets.forEach(t => {
          const pri = (Array.isArray(t.priority) ? t.priority[0] : t.priority) as any;
          const name = pri?.name || 'Unassigned';
          const color = pri?.color || '#94a3b8';
          if (!priMap[name]) priMap[name] = { count: 0, color };
          priMap[name].count++;
        });
        const maxPri = Math.max(...Object.values(priMap).map(p => p.count), 1);
        const byPriority = Object.entries(priMap)
          .map(([name, d]) => ({ name, color: d.color, count: d.count, percentage: (d.count / maxPri) * 100 }))
          .sort((a, b) => b.count - a.count);

        const closedTickets = tickets.filter(t => {
          const status = (Array.isArray(t.status) ? t.status[0] : t.status) as any;
          return status?.is_closed && t.created_at && t.updated_at;
        });
        const avgResolutionHours = closedTickets.length > 0
          ? closedTickets.reduce((acc, t) => {
              return acc + (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime());
            }, 0) / closedTickets.length / (1000 * 60 * 60)
          : null;

        setTicketsStats({ openByCategory, byPriority, overdueCount, avgResolutionHours });

        const ironcladAssets = properties.filter(p => !p.owner_type || p.owner_type !== 'partner').length;
        const partnerAssets  = properties.filter(p => p.owner_type === 'partner').length;

        setStats({
          totalAssets: properties.length,
          ironcladAssets,
          partnerAssets,
          activeAuctions: activeAuctionsCount || 0,
          totalRejecteds,
          priorityStats: priorityArray,
          weeklyStats: weeklyArray,
          countyStats: countyArray,
          upcomingEvents: upcomingArray
        });
      } catch (err) {
        console.error("Dashboard data fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  const getDonutSegments = () => {
    let currentOffset = 0;
    const radius = 35;
    const circumference = 2 * Math.PI * radius;

    return stats.countyStats.map((c) => {
      const strokeDasharray = `${(c.percentage * circumference) / 100} ${circumference}`;
      const strokeDashoffset = -currentOffset;
      currentOffset += (c.percentage * circumference) / 100;
      return { ...c, strokeDasharray, strokeDashoffset };
    });
  };


  const donutSegments = getDonutSegments();
  
  const segmentsByState = useMemo(() => {
    const groups: Record<string, typeof donutSegments> = {};
    donutSegments.forEach(seg => {
      const stateName = seg.state || "Other";
      if (!groups[stateName]) groups[stateName] = [];
      groups[stateName].push(seg);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [donutSegments]);

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <PermissionGuard resource="page:dashboard">
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-title">
            <h1>Welcome back<span className="dot">.</span></h1>
            <p>Portfolio overview and upcoming opportunities.</p>
          </div>
          <div className="current-date">
            <Calendar className="w-5 h-5 text-primary" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </header>

        {/* KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(202, 24, 26, 0.1)', color: '#ca181a' }}>
              <Building2 className="w-6 h-6" />
            </div>
            <div className="kpi-info">
              <h3>Total Portfolio</h3>
              <p className="kpi-value">{stats.totalAssets}</p>
              <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Ironclad: <strong style={{ color: '#0f172a' }}>{stats.ironcladAssets}</strong>
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Partners: <strong style={{ color: '#0f172a' }}>{stats.partnerAssets}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <Gavel className="w-6 h-6" />
            </div>
            <div className="kpi-info">
              <h3>Active Asset for Auctions</h3>
              <p className="kpi-value">{stats.activeAuctions}</p>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <XCircle className="w-6 h-6" />
            </div>
            <div className="kpi-info">
              <h3>Rejecteds</h3>
              <p className="kpi-value">{stats.totalRejecteds}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="dashboard-main">
          <div className="left-column">
            <section className="content-section compact">
              <div className="section-header">
                <h2>Assets for auction by week</h2>
                <Calendar className="w-5 h-5 text-muted" />
              </div>
              <div className="chart-container">
                {stats.weeklyStats.map(w => (
                  <div key={w.label} className="chart-row">
                    <div className="chart-label">
                      <span>{w.label} <small style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({w.range})</small></span>
                      <span>{w.count} auctions</span>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${w.percentage}%`, backgroundColor: '#3b82f6' }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="content-section compact">
              <div className="section-header">
                <h2>Assets for auction by priority</h2>
                <BarChart3 className="w-5 h-5 text-muted" />
              </div>
              <div className="chart-container">
                {stats.priorityStats.slice(0, 4).map(p => (
                  <div key={p.name} className="chart-row">
                    <div className="chart-label">
                      <span>{p.name}</span>
                      <span>{p.count} auctions</span>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${p.percentage}%`, backgroundColor: p.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="content-section">
              <div className="section-header">
                <h2>Portfolio by County</h2>
                <PieChart className="w-5 h-5 text-muted" />
              </div>
              <div className="donut-chart-wrapper">
                <div className="donut-container">
                  <svg width="150" height="150" viewBox="0 0 100 100" className="donut-svg">
                    {donutSegments.map((seg, i) => (
                      <circle key={i} cx="50" cy="50" r="35" fill="transparent" stroke={seg.color} strokeWidth="12" strokeDasharray={seg.strokeDasharray} strokeDashoffset={seg.strokeDashoffset} strokeLinecap="round" />
                    ))}
                  </svg>
                  <div className="donut-hole-text">
                    <span>{stats.totalAssets}</span>
                    <small>Total</small>
                  </div>
                </div>
                <div className="donut-legend" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                  {segmentsByState.map(([state, segs]) => (
                    <div key={state} className="legend-state-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div className="legend-state-header" style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 800, 
                        color: 'var(--text-muted)', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid var(--border-subtle)',
                        paddingBottom: '2px',
                        marginBottom: '4px'
                      }}>
                        {state === "Other" ? "Other Regions" : state}
                      </div>
                      {segs.map((seg, i) => (
                        <div key={i} className="legend-item">
                          <div className="legend-color" style={{ background: seg.color }} />
                          <div className="legend-info">
                            <span className="legend-name">{seg.name}</span>
                            <span className="legend-value">{seg.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Timeline with Links */}
          <section className="content-section">
            <div className="section-header">
              <h2>Top Five Asset</h2>
              <Clock className="w-5 h-5 text-muted" />
            </div>
            <div className="upcoming-list">
              {stats.upcomingEvents.length > 0 ? stats.upcomingEvents.map((ev, idx) => (
                <Link 
                  key={idx} 
                  href={`/auctions?county=${ev.countyId}&date=${ev.dateStr}`}
                  className="event-card"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="event-date-badge">
                    <span className="day">{ev.date.getDate()}</span>
                    <span className="month">{ev.date.toLocaleDateString('en-US', { month: 'short' })}</span>
                  </div>
                  <div className="event-info">
                    <h4>{ev.county}</h4>
                    <p><MapPin className="w-3 h-3" /> {ev.state}</p>
                  </div>
                  <div className="event-count">{ev.count} {ev.count === 1 ? 'Asset' : 'Assets'}</div>
                  <ChevronRight className="w-4 h-4 text-muted" />
                </Link>
              )) : <p className="text-muted">No upcoming auctions.</p>}
              <Link href="/auctions" className="primary-btn" style={{ marginTop: '1rem', justifyContent: 'center' }}>
                View All Auctions
              </Link>
            </div>
          </section>
        </div>

        {/* ── Requests & Tickets ── */}
        <div style={{ marginTop: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
              <Ticket className="w-4 h-4" />
              Requests &amp; Tickets
            </div>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 260px', gap: '1.5rem', alignItems: 'start' }}>

            {/* By Category */}
            <section className="content-section compact">
              <div className="section-header">
                <h2>Open tickets by category</h2>
                <BarChart3 className="w-5 h-5 text-muted" />
              </div>
              <div className="chart-container">
                {ticketsStats.openByCategory.length > 0 ? ticketsStats.openByCategory.map(c => (
                  <div key={c.name} className="chart-row">
                    <div className="chart-label">
                      <span>{c.name}</span>
                      <span>{c.count}</span>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${c.percentage}%`, backgroundColor: c.color }} />
                    </div>
                  </div>
                )) : <p className="text-muted" style={{ fontSize: '0.875rem' }}>No open tickets.</p>}
              </div>
            </section>

            {/* By Priority */}
            <section className="content-section compact">
              <div className="section-header">
                <h2>Open tickets by priority</h2>
                <BarChart3 className="w-5 h-5 text-muted" />
              </div>
              <div className="chart-container">
                {ticketsStats.byPriority.length > 0 ? ticketsStats.byPriority.map(p => (
                  <div key={p.name} className="chart-row">
                    <div className="chart-label">
                      <span>{p.name}</span>
                      <span>{p.count}</span>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${p.percentage}%`, backgroundColor: p.color }} />
                    </div>
                  </div>
                )) : <p className="text-muted" style={{ fontSize: '0.875rem' }}>No open tickets.</p>}
              </div>
            </section>

            {/* KPI mini-cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="kpi-card">
                <div className="kpi-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="kpi-info">
                  <h3>Overdue (SLA)</h3>
                  <p className="kpi-value">{ticketsStats.overdueCount}</p>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                  <Timer className="w-6 h-6" />
                </div>
                <div className="kpi-info">
                  <h3>Avg Resolution</h3>
                  <p className="kpi-value">
                    {ticketsStats.avgResolutionHours === null
                      ? '—'
                      : ticketsStats.avgResolutionHours < 48
                        ? `${Math.round(ticketsStats.avgResolutionHours)}h`
                        : `${Math.round(ticketsStats.avgResolutionHours / 24)}d`}
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </PermissionGuard>
  );
}
