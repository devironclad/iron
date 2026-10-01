"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import "./ParcelMapEmbed.css";

type MapType = "satellite" | "roadmap";

const ZOOM_OPTIONS = [
  { label: "Neighborhood", zoom: 16 },
  { label: "Lot", zoom: 18 },
];

// Parses the "lat,lon" string stored in ls_assets.coordinates.
function parseCoordinates(value: string | null | undefined): { lat: number; lon: number } | null {
  const parts = (value || "").split(",").map((p) => parseFloat(p.trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [lat, lon] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// With NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY set, uses the official Maps Embed API.
// Without it, falls back to the keyless legacy embed URL (undocumented, may change without notice).
function buildEmbedUrl(ll: string, mapType: MapType, zoom: number): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (key) {
    const params = new URLSearchParams({ key, q: ll, maptype: mapType, zoom: String(zoom) });
    return `https://www.google.com/maps/embed/v1/place?${params}`;
  }
  return `https://maps.google.com/maps?q=${ll}&t=${mapType === "satellite" ? "k" : "m"}&z=${zoom}&output=embed`;
}

// Same normalization as the form's link inputs: stored links may lack the protocol.
function toHref(url: string | undefined): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}

interface ParcelMapEmbedProps {
  coordinates: string;
  regridLink?: string;
  appraiserLink?: string;
  clerkLink?: string;
}

export function ParcelMapEmbed({ coordinates, regridLink, appraiserLink, clerkLink }: ParcelMapEmbedProps) {
  const [debounced, setDebounced] = useState(coordinates);
  const [mapType, setMapType] = useState<MapType>("satellite");
  const [zoom, setZoom] = useState(18);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(coordinates), 600);
    return () => clearTimeout(t);
  }, [coordinates]);

  const coords = parseCoordinates(debounced);
  const ll = coords ? `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}` : null;
  const regrid = toHref(regridLink);
  const appraiser = toHref(appraiserLink);
  const clerk = toHref(clerkLink);

  return (
    <div className="pme-card">
      <div className="pme-box">
        {ll ? (
          <iframe
            key={`${ll}-${mapType}-${zoom}`}
            className="pme-frame"
            src={buildEmbedUrl(ll, mapType, zoom)}
            title="Parcel location map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : !debounced?.trim() ? (
          <div className="pme-state">
            <MapPin size={20} />
            Fill in Coordinates to see the map.
          </div>
        ) : (
          <div className="pme-state invalid">
            Invalid format. Use &quot;lat, lng&quot; — e.g. 29.05534, -82.06205
          </div>
        )}
      </div>

      <div className="pme-bar">
        <div className="pme-controls">
          <div className="pme-seg">
            <button type="button" className={mapType === "satellite" ? "on" : ""} onClick={() => setMapType("satellite")}>Satellite</button>
            <button type="button" className={mapType === "roadmap" ? "on" : ""} onClick={() => setMapType("roadmap")}>Map</button>
          </div>
          <div className="pme-seg">
            {ZOOM_OPTIONS.map((o) => (
              <button key={o.zoom} type="button" className={zoom === o.zoom ? "on" : ""} onClick={() => setZoom(o.zoom)}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className="pme-links">
          <a className={`pme-link${ll ? "" : " disabled"}`} href={ll ? `https://www.google.com/maps/search/?api=1&query=${ll}` : undefined} target="_blank" rel="noopener noreferrer">
            Google Maps <ExternalLink size={12} />
          </a>
          <a className={`pme-link${ll ? "" : " disabled"}`} href={ll ? `https://earth.google.com/web/@${ll},60a,400d,35y,0h,45t,0r` : undefined} target="_blank" rel="noopener noreferrer">
            Google Earth <ExternalLink size={12} />
          </a>
          <a className={`pme-link${regrid ? "" : " disabled"}`} href={regrid || undefined} target="_blank" rel="noopener noreferrer">
            Regrid <ExternalLink size={12} />
          </a>
          <a
            className={`pme-link${appraiser ? "" : " disabled"}`}
            href={appraiser || undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={appraiser ? undefined : "Appraiser link not available yet"}
          >
            Appraiser <ExternalLink size={12} />
          </a>
          <a
            className={`pme-link${clerk ? "" : " disabled"}`}
            href={clerk || undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={clerk ? undefined : "Clerk recording link not available for this county"}
          >
            Clerk <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
