"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBrandColor } from "@/lib/brandColors";

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

// full_address and building_name are two separate free-text fields entered
// independently in the branch admin form (src/app/admin/branches/page.tsx),
// so it's common for an admin to have typed the building name at the start
// of the address too (e.g. "Kovan Heartland Mall, 200 Hougang Ave 3,
// #01-25") - which then shows up twice in the tooltip, since buildingName is
// already displayed on its own line above. Strip a leading, comma-separated
// occurrence of the building name from the address before display; a no-op
// for records where the admin didn't duplicate it.
function stripLeadingBuildingName(address: string, buildingName: string | null): string {
  if (!buildingName) return address;
  const trimmedBuilding = buildingName.trim();
  if (!trimmedBuilding) return address;
  const prefix = new RegExp(`^\\s*${trimmedBuilding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,?\\s*`, "i");
  return address.replace(prefix, "").trim();
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
      const brandColor = getBrandColor(o.brandName).borderColor;
      const cleanedAddress = stripLeadingBuildingName(o.address, o.buildingName);
      L.marker(point, { icon: pinIcon })
        .bindTooltip(
          `<div class="outlet-tooltip">
            <strong class="outlet-tooltip-building">${escapeHtml(o.buildingName || o.branchName)}</strong>
            <span class="outlet-tooltip-brand" style="color: ${brandColor}">
              <span class="outlet-tooltip-brand-dot" style="background: ${brandColor}"></span>
              ${escapeHtml(o.brandName)}
            </span>
            <span class="outlet-tooltip-address">${escapeHtml(cleanedAddress)}${o.postalCode ? ` (${escapeHtml(o.postalCode)})` : ""}</span>
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
