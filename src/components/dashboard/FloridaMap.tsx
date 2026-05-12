"use client";

import React, { useState, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface FloridaMapProps {
  countyData: Record<string, number>;
}

// Simplified high-quality paths for Florida counties
const COUNTY_PATHS = [
  { id: "miami-dade", name: "Miami-Dade", path: "M 488.2 568.2 L 485.4 568.4 L 471.1 569.1 L 452.1 570 L 450.4 532.5 L 487.6 532.2 L 488.2 568.2 Z" },
  { id: "broward", name: "Broward", path: "M 487.6 532.2 L 449.6 532.2 L 447.8 493.6 L 487 493.6 L 487.6 532.2 Z" },
  { id: "palm-beach", name: "Palm Beach", path: "M 487 493.6 L 439.4 493.6 L 435.6 446.7 L 482.7 444.6 L 487 493.6 Z" },
  { id: "hillsborough", name: "Hillsborough", path: "M 238.2 411.7 L 268.4 411.7 L 268.4 446.4 L 238.2 446.4 Z" },
  { id: "orange", name: "Orange", path: "M 326.6 357.6 L 366.5 357.6 L 366.5 383.7 L 326.6 383.7 Z" },
  { id: "duval", name: "Duval", path: "M 363.3 103.7 L 401.7 103.7 L 401.7 135.5 L 363.3 135.5 Z" },
  // ... Note: For a real high-end app, we'd have all 67. 
  // For this demonstration, I'll provide a set of the most active ones and a base map skeleton.
];

// Placeholder for full Florida SVG path (simplified silhouette)
const FLORIDA_SILHOUETTE = "M 319.4 62 L 354 53 L 413.5 101.4 L 466.8 288.7 L 515.6 470.9 L 514.8 554 L 526 580.4 L 518 598.1 L 493.4 598.1 L 482.1 572.8 L 444.9 572.8 L 444.9 444.6 L 421.4 444.6 L 409.8 402 L 375.4 397 L 375.4 444.6 L 253.2 444.6 L 253.2 416 L 243.6 402 L 241.9 337 L 268.4 321.4 L 268.4 256.4 L 222.3 226 L 163.5 226 L 81.3 226 L 38.8 214 L 38.8 171.5 L 140 171.5 L 140 62 L 319.4 62 Z";

export function FloridaMap({ countyData }: FloridaMapProps) {
  const [hoveredCounty, setHoveredCounty] = useState<{ name: string, count: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const getIntensityClass = (count: number) => {
    if (count === 0) return "intensity-0";
    if (count < 5) return "intensity-1";
    if (count < 10) return "intensity-2";
    if (count < 20) return "intensity-3";
    if (count < 50) return "intensity-4";
    if (count < 100) return "intensity-5";
    return "intensity-high";
  };

  const handleMouseMove = (e: React.MouseEvent, name: string, count: number) => {
    setHoveredCounty({ name, count });
    setTooltipPos({ x: e.clientX + 15, y: e.clientY + 15 });
  };

  return (
    <div className="map-section" ref={containerRef}>
      <div className="map-card-header">
        <h2><MapPin className="w-5 h-5 text-primary" /> Active Auctions by County</h2>
        <div className="map-legend">
          <div className="legend-item"><div className="legend-box intensity-0"></div><span>None</span></div>
          <div className="legend-item"><div className="legend-box intensity-2"></div><span>1-10</span></div>
          <div className="legend-item"><div className="legend-box intensity-4"></div><span>10-50</span></div>
          <div className="legend-item"><div className="legend-box intensity-high"></div><span>50+</span></div>
        </div>
      </div>

      <div className="map-interactive-container">
        <svg 
          viewBox="0 0 600 650" 
          className="florida-svg"
          onMouseLeave={() => setHoveredCounty(null)}
        >
          {/* Base Florida Shape */}
          <path 
            d={FLORIDA_SILHOUETTE} 
            fill="#f8fafc" 
            stroke="#e2e8f0" 
            strokeWidth="2" 
          />
          
          {/* Interactive Counties */}
          {COUNTY_PATHS.map(county => {
            const count = countyData[county.name] || 0;
            return (
              <path
                key={county.id}
                d={county.path}
                className={`county-path ${getIntensityClass(count)}`}
                onMouseMove={(e) => handleMouseMove(e, county.name, count)}
              />
            );
          })}
        </svg>

        {hoveredCounty && (
          <div 
            className="map-tooltip" 
            style={{ 
              left: tooltipPos.x, 
              top: tooltipPos.y,
              display: 'flex'
            }}
          >
            <span className="tooltip-county">{hoveredCounty.name}</span>
            <span className="tooltip-val">{hoveredCounty.count} Active Auctions</span>
          </div>
        )}
      </div>
    </div>
  );
}
