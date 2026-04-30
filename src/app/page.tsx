"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Gavel, 
  Building2, 
  TrendingUp, 
  BarChart3, 
  Calendar, 
  ArrowUpRight, 
  Plus,
  Clock,
  MapPin,
  ChevronRight,
  PieChart
} from "lucide-react";
import Link from "next/link";
import "./dashboard.css";

const CHART_COLORS = ['#ca181a', '#1e293b', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalAssets: 0,
    activeAuctions: 0,
    totalInvestment: 0,
    priorityStats: [] as any[],
    countyStats: [] as any[],
    upcomingEvents: [] as any[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      try {
        const { data: allAssets } = await supabase
          .from('ls_assets')
          .select('id, market_value, ls_priority(name, color), auction_date, address, record_type, county_id, ls_county(name, state)');

        const assets = allAssets || [];
        const properties = assets.filter(a => a.record_type === 'PROPERTY');
        const activeAuctions = assets.filter(a => a.record_type === 'AUCTION' && a.auction_date && a.auction_date >= today);
        const totalInvestmentValue = activeAuctions.reduce((acc, curr) => acc + (Number(curr.market_value) || 0), 0);

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

        // County Stats (For Donut)
        const counties: Record<string, number> = {};
        properties.forEach(prop => {
          const county = (Array.isArray(prop.ls_county) ? prop.ls_county[0] : prop.ls_county) as any;
          const cName = county?.name || "Other";
          counties[cName] = (counties[cName] || 0) + 1;
        });

        const countyArray = Object.entries(counties)
          .map(([name, count], index) => ({
            name,
            count,
            color: CHART_COLORS[index % CHART_COLORS.length],
            percentage: properties.length > 0 ? (count / properties.length) * 100 : 0
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

        setStats({
          totalAssets: properties.length,
          activeAuctions: activeAuctions.length,
          totalInvestment: totalInvestmentValue,
          priorityStats: priorityArray,
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

    return stats.countyStats.slice(0, 5).map((c) => {
      const strokeDasharray = `${(c.percentage * circumference) / 100} ${circumference}`;
      const strokeDashoffset = -currentOffset;
      currentOffset += (c.percentage * circumference) / 100;
      return { ...c, strokeDasharray, strokeDashoffset };
    });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    }).format(val);
  };

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="loader"></div>
      </div>
    );
  }

  const donutSegments = getDonutSegments();

  return (
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
            <h3>Total Properties</h3>
            <p className="kpi-value">{stats.totalAssets}</p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
             <Gavel className="w-6 h-6" />
          </div>
          <div className="kpi-info">
            <h3>Active Auctions</h3>
            <p className="kpi-value">{stats.activeAuctions}</p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
             <TrendingUp className="w-6 h-6" />
          </div>
          <div className="kpi-info">
            <h3>Active Target Value</h3>
            <p className="kpi-value">{formatCurrency(stats.totalInvestment)}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-main">
        <div className="left-column">
          <section className="content-section compact">
            <div className="section-header">
              <h2>Auctions by Priority</h2>
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
              <div className="donut-legend">
                {donutSegments.map((seg, i) => (
                  <div key={i} className="legend-item">
                    <div className="legend-color" style={{ background: seg.color }} />
                    <div className="legend-info">
                      <span className="legend-name">{seg.name}</span>
                      <span className="legend-value">{seg.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Timeline with Links */}
        <section className="content-section">
          <div className="section-header">
            <h2>TOP FIVE: Next Auctions</h2>
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
                <div className="event-count">{ev.count} {ev.count === 1 ? 'Auction' : 'Auctions'}</div>
                <ChevronRight className="w-4 h-4 text-muted" />
              </Link>
            )) : <p className="text-muted">No upcoming auctions.</p>}
            <Link href="/auctions" className="primary-btn" style={{ marginTop: '1rem', justifyContent: 'center' }}>
              View All Auctions
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
