"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Outlet {
  branchId: number;
  branchName: string;
  brandName: string;
  address: string;
  buildingName: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
}

const SINGAPORE_CENTER: L.LatLngExpression = [1.3521, 103.8198];

// A small divIcon pin instead of Leaflet's default marker images, which need
// bundler-specific path fixes to load correctly in Next.js.
const pinIcon = L.divIcon({
  className: "outlet-pin",
  html: '<span class="outlet-pin-dot"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function OutletMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/outlets")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Outlet[]) => {
        if (!cancelled) setOutlets(data);
      })
      .catch(() => {
        if (!cancelled) setOutlets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Built with raw Leaflet (not react-leaflet's <MapContainer>) - React 18
  // Strict Mode double-invokes this effect in dev, and MapContainer throws
  // "Map container is already initialized" on the second mount because it
  // doesn't guard against that. Managing the instance via a ref sidesteps it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: SINGAPORE_CENTER,
      zoom: 11,
      scrollWheelZoom: true,
    });

    // Standard OSM tiles (no account/API key, always available) — inverted
    // via CSS to a dark theme instead of relying on a hosted dark tile set.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: "abc",
      maxZoom: 19,
      className: "outlet-map-tiles",
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // (Re)plot markers whenever outlet data arrives or changes.
  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers || outlets.length === 0) return;

    markers.clearLayers();
    const points: L.LatLngExpression[] = [];

    outlets.forEach((o) => {
      const point: L.LatLngExpression = [o.lat, o.lng];
      points.push(point);
      L.marker(point, { icon: pinIcon })
        .bindTooltip(
          `<div class="outlet-tooltip">
            <strong>${escapeHtml(o.buildingName || o.branchName)}</strong>
            <span class="outlet-tooltip-brand">${escapeHtml(o.brandName)}</span>
            <span>${escapeHtml(o.address)}${o.postalCode ? ` (${escapeHtml(o.postalCode)})` : ""}</span>
          </div>`,
          { direction: "top", offset: [0, -8] }
        )
        .addTo(markers);
    });

    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 13 });
  }, [outlets]);

  return (
    <div className="outlet-map-wrap">
      {!loading && outlets.length > 0 && (
        <div className="outlet-map-count">
          {outlets.length} outlet{outlets.length === 1 ? "" : "s"} across Singapore
        </div>
      )}
      <div ref={containerRef} className="outlet-map" />
      {loading && <div className="outlet-map-loading">Loading outlets…</div>}
    </div>
  );
}
