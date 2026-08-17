"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Gavel,
  Building2,
  BarChart3,
  ArrowUpRight,
  Plus,
  Clock,
  MapPin,
  ChevronRight,
  ClipboardList,
  Ticket,
  AlertTriangle,
  Timer
} from "lucide-react";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { AuctionCalendar, type CalendarDayData } from "@/components/dashboard/AuctionCalendar";
import "./dashboard.css";

const CHART_COLORS = ['var(--primary)', '#1e293b', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

export default function Dashboard() {
  const [activeView, setActiveView] = useState<'properties' | 'auctions' | 'requests' | null>('properties');
  const [stats, setStats] = useState({
    totalAssets: 0,
    ironcladAssets: 0,
    partnerAssets: 0,
    activeAuctions: 0,
    openRequests: 0,
    priorityStats: [] as any[],
    weeklyStats: [] as any[],
    countyStats: [] as any[],
    upcomingEvents: [] as any[],
    ownerStats: [] as { name: string; count: number; percentage: number; isIronclad: boolean }[],
    calendarData: {} as Record<string, CalendarDayData>
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
            .select('id, auction_date, county_id, priority_id, ls_priority(name, color), ls_county(name, state)')
            .eq('record_type', 'AUCTION')
            .gte('auction_date', today)
            .limit(1000),
          supabase
            .from('ls_assets')
            .select('id, county_id, owner_type, ls_county(name, state), owner:ls_users_metadata!owner_partner_id(full_name)')
            .eq('record_type', 'PROPERTY')
            .or('sale_type.is.null,sale_type.neq.sold_out')
            .limit(1000),
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
            .limit(500)
        ]);

        const rejectedId = rejectedPriorityRow?.id;
        const properties = propertiesRaw || [];

        const activeAuctions = (activeAuctionsRaw || []).filter(a => {
          if (!rejectedId) return true;
          return a.priority_id !== rejectedId;
        });

        // Priority Stats
        const priorities: Record<string, { count: number, color: string }> = {};
        activeAuctions.forEach(auc => {
          const priority = (Array.isArray(auc.ls_priority) ? auc.ls_priority[0] : auc.ls_priority) as any;
          const pName = priority?.name || "Unassigned";
          const pColor = priority?.color || "var(--primary)";
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

        // Align to start of current calendar week (Sunday = 0)
        const startOfCurrentWeek = new Date(now);
        startOfCurrentWeek.setDate(now.getDate() - now.getDay());

        for (let i = 0; i < 4; i++) {
          const start = new Date(startOfCurrentWeek);
          start.setDate(startOfCurrentWeek.getDate() + (i * 7));
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

        // County Stats (Portfolio by County breakdown)
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
          .map(([key, data]) => ({
            name: data.countyName,
            state: data.state,
            count: data.count,
          }))
          .sort((a, b) => b.count - a.count);

        // Upcoming Events (Grouped by Date + County)
        const groupedEvents: Record<string, any> = {};
        activeAuctions.forEach(auc => {
          if (!auc.auction_date) return;
          const dateStr = auc.auction_date.substring(0, 10);
          const [y, m, d] = dateStr.split('-').map(Number);
          const rawDate = new Date(y, m - 1, d);
          if (isNaN(rawDate.getTime())) return;
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

        // Calendar Data (grouped by date → county)
        const calendarData: Record<string, CalendarDayData> = {};
        activeAuctions.forEach(auc => {
          if (!auc.auction_date) return;
          const ds = auc.auction_date.substring(0, 10);
          const county = (Array.isArray(auc.ls_county) ? auc.ls_county[0] : auc.ls_county) as any;
          const countyName = county?.name || 'Unknown';
          const countyState = county?.state || '';
          const countyId = auc.county_id;
          if (!calendarData[ds]) calendarData[ds] = { total: 0, counties: [] };
          calendarData[ds].total++;
          const existing = calendarData[ds].counties.find(c => c.name === countyName);
          if (existing) { existing.count++; }
          else { calendarData[ds].counties.push({ name: countyName, state: countyState, count: 1, countyId }); }
        });

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

        // Owner breakdown for bar chart
        const ownerMap: Record<string, { count: number; isIronclad: boolean }> = {};
        properties.forEach(p => {
          const isIronclad = !p.owner_type || p.owner_type !== 'partner';
          const owner = p as any;
          const name = isIronclad ? 'Ironclad' : (owner.owner?.full_name || 'Unknown Partner');
          if (!ownerMap[name]) ownerMap[name] = { count: 0, isIronclad };
          ownerMap[name].count++;
        });
        const ownerMax = Math.max(...Object.values(ownerMap).map(o => o.count), 1);
        const ownerStats = Object.entries(ownerMap)
          .map(([name, { count, isIronclad }]) => ({ name, count, isIronclad, percentage: (count / ownerMax) * 100 }))
          .sort((a, b) => b.count - a.count);

        setStats({
          totalAssets: properties.length,
          ironcladAssets,
          partnerAssets,
          activeAuctions: activeAuctions.length,
          openRequests: openTickets.length,
          priorityStats: priorityArray,
          weeklyStats: weeklyArray,
          countyStats: countyArray,
          upcomingEvents: upcomingArray,
          ownerStats,
          calendarData
        });
      } catch (err) {
        console.error("Dashboard data fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  // Portfolio by County — which state's counties are expanded (accordion, one at a time)
  const [expandedState, setExpandedState] = useState<string | null>(null);

  // Properties by Owner — collapsed to the Ironclad row until expanded
  const [ownerExpanded, setOwnerExpanded] = useState(false);

  // Aggregate the per-county stats up to state level
  const stateStats = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    stats.countyStats.forEach(c => {
      const key = c.state || "Other";
      if (!map[key]) map[key] = { name: key, count: 0 };
      map[key].count += c.count;
    });
    const arr = Object.values(map).sort((a, b) => b.count - a.count);
    const maxCount = Math.max(...arr.map(s => s.count), 1);
    return arr.map((s, i) => ({ ...s, percentage: (s.count / maxCount) * 100, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [stats.countyStats]);

  // Counties belonging to the currently expanded state, scaled relative to that state's largest county
  const selectedStateCounties = useMemo(() => {
    if (!expandedState) return [];
    const counties = stats.countyStats.filter(c => (c.state || "Other") === expandedState);
    const maxCount = Math.max(...counties.map(c => c.count), 1);
    return counties
      .sort((a, b) => b.count - a.count)
      .map(c => ({ ...c, percentage: (c.count / maxCount) * 100 }));
  }, [stats.countyStats, expandedState]);

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
        {/* Page Header */}
        <div className="page-header">
          <div className="page-header-text">
            <h1 className="page-title">Welcome back<span className="dot">.</span></h1>
            <p className="page-subtitle">Portfolio overview and upcoming opportunities &middot; {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="kpi-grid">
          <div
            className="kpi-card"
            onClick={() => setActiveView('properties')}
            style={{ cursor: 'pointer', outline: activeView === 'properties' ? '2px solid var(--primary)' : 'none', transition: 'outline 0.15s' }}
          >
            <div className="kpi-icon-wrapper" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
              <Building2 className="w-6 h-6" />
            </div>
            <div className="kpi-info">
              <h3>Assets in Portfolio</h3>
              <p className="kpi-value">{stats.totalAssets}</p>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span className="stat-pill stat-pill--primary">
                  <span className="stat-pill-dot" />
                  Ironclad · {stats.ironcladAssets}
                </span>
                <span className="stat-pill stat-pill--neutral">
                  <span className="stat-pill-dot" />
                  Partners · {stats.partnerAssets}
                </span>
              </div>
            </div>
          </div>

          <div
            className="kpi-card"
            onClick={() => setActiveView('auctions')}
            style={{ cursor: 'pointer', outline: activeView === 'auctions' ? '2px solid var(--primary)' : 'none', transition: 'outline 0.15s' }}
          >
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <Gavel className="w-6 h-6" />
            </div>
            <div className="kpi-info">
              <h3>Researched Assets</h3>
              <p className="kpi-value">{stats.activeAuctions}</p>
            </div>
          </div>

          <div
            className="kpi-card"
            onClick={() => setActiveView('requests')}
            style={{ cursor: 'pointer', outline: activeView === 'requests' ? '2px solid var(--primary)' : 'none', transition: 'outline 0.15s' }}
          >
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(39, 53, 72, 0.08)', color: 'var(--primary)' }}>
              <ClipboardList className="w-6 h-6" />
            </div>
            <div className="kpi-info">
              <h3>Active Requests</h3>
              <p className="kpi-value">{stats.openRequests}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        {activeView === 'auctions' && <div className="dashboard-main">
          <div className="left-column">
            <AuctionCalendar calendarData={stats.calendarData} compact />

            <section className="content-section compact">
              <div className="section-header">
                <h2>Active for auction by priority</h2>
                <BarChart3 className="w-5 h-5 text-muted" />
              </div>
              <div className="chart-container">
                {stats.priorityStats.slice(0, 4).map(p => (
                  <div key={p.name} className="chart-row">
                    <div className="chart-label">
                      <span>{p.name}</span>
                      <span>{p.count} assets</span>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${p.percentage}%`, backgroundColor: p.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* Right Column: Timeline with Links */}
          <section className="content-section">
            <div className="section-header">
              <h2>Top 5 Next Auctions</h2>
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
        </div>}

        {/* Portfolio by County + Properties by Owner — side by side, half width each */}
        {(activeView === 'properties') && (
          <div className="dashboard-half-grid" style={{ marginTop: '1.5rem' }}>
            <section className="content-section">
              <div className="section-header">
                <h2>Portfolio by County</h2>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>{stats.totalAssets} total</span>
              </div>
              <div className="chart-container">
                {stateStats.map(s => {
                  const isExpanded = expandedState === s.name;
                  return (
                    <div key={s.name}>
                      <div
                        className="chart-row"
                        onClick={() => setExpandedState(isExpanded ? null : s.name)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="chart-label">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <ChevronRight className="w-3.5 h-3.5 text-muted" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                            {s.name}
                          </span>
                          <span>{s.count} {s.count === 1 ? 'property' : 'properties'}</span>
                        </div>
                        <div className="chart-bar-bg">
                          <div className="chart-bar-fill" style={{ width: `${s.percentage}%`, backgroundColor: s.color }} />
                        </div>
                      </div>
                      {isExpanded && selectedStateCounties.map(c => (
                        <div key={c.name} className="chart-row" style={{ paddingLeft: '1.15rem' }}>
                          <div className="chart-label">
                            <span>{c.name}</span>
                            <span>{c.count} {c.count === 1 ? 'property' : 'properties'}</span>
                          </div>
                          <div className="chart-bar-bg">
                            <div className="chart-bar-fill" style={{ width: `${c.percentage}%`, backgroundColor: 'var(--text-secondary)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="content-section compact">
              <div className="section-header">
                <h2>Properties by owner</h2>
                <BarChart3 className="w-5 h-5 text-muted" />
              </div>
              <div className="chart-container">
                {stats.ownerStats.filter(o => o.isIronclad).map(o => (
                  <div
                    key={o.name}
                    className="chart-row"
                    onClick={() => setOwnerExpanded(v => !v)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="chart-label">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <ChevronRight className="w-3.5 h-3.5 text-muted" style={{ transform: ownerExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        {o.name}
                      </span>
                      <span>{o.count} {o.count === 1 ? 'property' : 'properties'}</span>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${o.percentage}%`, backgroundColor: 'var(--primary)' }} />
                    </div>
                  </div>
                ))}
                {ownerExpanded && stats.ownerStats.filter(o => !o.isIronclad).map(o => (
                  <div key={o.name} className="chart-row">
                    <div className="chart-label">
                      <span style={{ paddingLeft: '1.15rem' }}>{o.name}</span>
                      <span>{o.count} {o.count === 1 ? 'property' : 'properties'}</span>
                    </div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${o.percentage}%`, backgroundColor: 'var(--text-secondary)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── Requests & Tickets ── */}
        {(activeView === 'requests') && <div style={{ marginTop: '2.5rem' }}>
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
        </div>}

      </div>
    </PermissionGuard>
  );
}
