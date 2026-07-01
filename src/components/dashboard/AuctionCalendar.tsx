"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Copy, Check } from "lucide-react";
import Link from "next/link";

type CountyEntry = { name: string; state: string; count: number; countyId: number };
export type CalendarDayData = { total: number; counties: CountyEntry[] };

interface AuctionCalendarProps {
  calendarData: Record<string, CalendarDayData>;
  compact?: boolean;
}

const NAV_BTN: React.CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '6px',
  padding: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  color: 'var(--text-secondary)',
};

export function AuctionCalendar({ calendarData, compact = false }: AuctionCalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthNameShort = viewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function copyMonth() {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const entries = Object.entries(calendarData)
      .filter(([d]) => d.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) return;

    const monthTotal = entries.reduce((sum, [, d]) => sum + d.total, 0);
    const separator = '─'.repeat(44);
    const lines = [`Auction Schedule — ${monthName}`, separator];

    for (const [ds, data] of entries) {
      const dateLabel = new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const sorted = [...data.counties].sort((a, b) => b.count - a.count);
      for (const c of sorted) {
        const county = `${c.name} (${c.state})`;
        const assets = `${c.count} ${c.count === 1 ? 'asset' : 'assets'}`;
        lines.push(`${dateLabel.padEnd(10)} ${county.padEnd(26)} ${assets}`);
      }
    }

    lines.push(separator);
    lines.push(`Total: ${monthTotal} ${monthTotal === 1 ? 'asset' : 'assets'}`);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function dayStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedData = selectedDay ? calendarData[selectedDay] : null;

  // compact: county panel stacks below; full: side-by-side
  const gridLayout = !compact && selectedDay && selectedData
    ? { display: 'grid', gridTemplateColumns: '1fr 256px', gap: '1rem', alignItems: 'start' }
    : {};

  return (
    <section className={compact ? 'content-section compact' : 'content-section'} style={compact ? {} : { marginTop: '1.5rem' }}>
      {/* Header */}
      <div className="section-header">
        <h2>Auction Calendar</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            onClick={() => { setViewDate(new Date(year, month - 1, 1)); setSelectedDay(null); }}
            style={NAV_BTN}
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span style={{ fontSize: compact ? '0.75rem' : '0.875rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: compact ? '80px' : '148px', textAlign: 'center' }}>
            {compact ? monthNameShort : monthName}
          </span>
          <button
            onClick={() => { setViewDate(new Date(year, month + 1, 1)); setSelectedDay(null); }}
            style={NAV_BTN}
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={copyMonth}
            style={{ ...NAV_BTN, gap: '0.3rem', padding: '4px 8px', fontSize: '0.72rem', fontWeight: 600, color: copied ? '#10b981' : 'var(--text-secondary)' }}
            aria-label="Copy month as text"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div style={gridLayout}>
        {/* Grid */}
        <div>
          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '3px' }}>
            {(compact ? ['S','M','T','W','T','F','S'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']).map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: compact ? '2px' : '3px' }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} style={{ aspectRatio: '1' }} />;
              const ds = dayStr(day);
              const data = calendarData[ds];
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDay;
              const hasAuctions = !!data;

              return (
                <div
                  key={ds}
                  role={hasAuctions ? 'button' : undefined}
                  tabIndex={hasAuctions ? 0 : undefined}
                  onClick={() => hasAuctions && setSelectedDay(isSelected ? null : ds)}
                  onKeyDown={e => e.key === 'Enter' && hasAuctions && setSelectedDay(isSelected ? null : ds)}
                  style={{
                    aspectRatio: '1',
                    borderRadius: compact ? '6px' : '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1px',
                    cursor: hasAuctions ? 'pointer' : 'default',
                    background: isSelected ? '#273548' : hasAuctions ? 'rgba(39,53,72,0.08)' : 'transparent',
                    border: isToday || isSelected ? '2px solid #273548' : '2px solid transparent',
                    transition: 'background 0.12s, border-color 0.12s',
                    outline: 'none',
                  }}
                >
                  <span style={{
                    fontSize: compact ? '0.65rem' : '0.78rem',
                    fontWeight: hasAuctions ? 700 : 400,
                    color: isSelected ? 'white' : isToday ? '#273548' : hasAuctions ? '#273548' : 'var(--text-muted)',
                    lineHeight: 1,
                  }}>
                    {day}
                  </span>
                  {hasAuctions && (
                    <span style={{
                      fontSize: compact ? '0.5rem' : '0.58rem',
                      fontWeight: 700,
                      color: isSelected ? 'rgba(255,255,255,0.8)' : '#273548',
                      lineHeight: 1,
                    }}>
                      {data.total}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend — hidden in compact mode */}
          {!compact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(39,53,72,0.08)' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Has auctions</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', border: '2px solid #273548' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Today</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#273548' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Selected</span>
              </div>
            </div>
          )}
        </div>

        {/* County Breakdown Panel — side in full, stacked in compact */}
        {selectedDay && selectedData && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: compact ? '0.65rem' : '1rem',
            marginTop: compact ? '0.75rem' : undefined,
          }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>
              {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <p style={{ fontSize: compact ? '1rem' : '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
              {selectedData.total} {selectedData.total === 1 ? 'Asset' : 'Assets'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {[...selectedData.counties]
                .sort((a, b) => b.count - a.count)
                .map(c => (
                  <Link
                    key={c.name}
                    href={`/auctions?county=${c.countyId}&date=${selectedDay}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: 'var(--bg-base)', borderRadius: '7px', textDecoration: 'none', gap: '0.4rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                      <MapPin style={{ width: '10px', height: '10px', color: '#273548', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>{c.state}</span>
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'white', background: '#273548', padding: '0.1rem 0.4rem', borderRadius: '999px', flexShrink: 0 }}>
                      {c.count}
                    </span>
                  </Link>
                ))}
            </div>

            <Link
              href={`/auctions?date=${selectedDay}`}
              style={{ display: 'block', marginTop: '0.6rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, color: '#273548', textDecoration: 'none' }}
            >
              View all on this date →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
