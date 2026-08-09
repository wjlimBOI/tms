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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// full_address, building_name, and postal_code are separate free-text/data
// fields entered independently in the branch admin form
// (src/app/admin/branches/page.tsx), so it's common for an admin to have
// typed the building name and/or postal code into the address too (e.g.
// "Kovan Heartland Mall, 200 Hougang Ave 3, Singapore 538767") - which then
// shows up twice, once on its own line/field, once again inside the address
// text. Strips every occurrence of both (not just a leading one - a building
// name can appear mid-string too, e.g. a copy-pasted address repeating it),
// then cleans up the leftover punctuation/whitespace. No-op for whichever
// parts a given record doesn't actually duplicate.
function cleanAddress(address: string, buildingName: string | null, postalCode: string | null): string {
  let result = address;

  if (buildingName?.trim()) {
    const re = new RegExp(`\\b${escapeRegex(buildingName.trim())}\\b`, "gi");
    result = result.replace(re, "");
  }

  if (postalCode?.trim()) {
    const re = new RegExp(`\\(?\\s*(singapore\\s*)?${escapeRegex(postalCode.trim())}\\s*\\)?`, "gi");
    result = result.replace(re, "");
  }

  return result
    .replace(/,\s*,/g, ",")
    .replace(/^[,\s]+/, "")
    .replace(/[,\s]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Round to ~1m precision so outlets geocoded to the exact same spot (or
// close enough it doesn't matter at this zoom level) group under one pin
// instead of rendering perfectly-stacked markers where only the topmost one
// can ever be hovered/clicked - which is exactly why a location with
// multiple brands was only ever showing one.
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
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

    // Group outlets sharing (effectively) the same coordinates into one pin,
    // so a building with several BOI brands shows all of them from a single
    // marker instead of stacking identical markers where only the topmost
    // is ever reachable.
    const groups = new Map<string, Outlet[]>();
    outlets.forEach((o) => {
      const key = coordKey(o.lat, o.lng);
      const group = groups.get(key);
      if (group) group.push(o);
      else groups.set(key, [o]);
    });

    const points: L.LatLngExpression[] = [];

    groups.forEach((group) => {
      const [first] = group;
      const point: L.LatLngExpression = [first.lat, first.lng];
      points.push(point);

      const brandRows = group
        .map((o) => {
          const brandColor = getBrandColor(o.brandName).borderColor;
          return `<div class="outlet-popup-brand-row">
            <span class="outlet-popup-brand" style="color: ${brandColor}">
              <span class="outlet-popup-brand-dot" style="background: ${brandColor}"></span>
              ${escapeHtml(o.brandName)}
            </span>
          </div>`;
        })
        .join("");

      const cleanedAddress = cleanAddress(first.address, first.buildingName, first.postalCode);

      L.marker(point, { icon: pinIcon })
        .bindPopup(
          `<div class="outlet-popup">
            <strong class="outlet-popup-building">${escapeHtml(first.buildingName || first.branchName)}</strong>
            <div class="outlet-popup-brands">${brandRows}</div>
            <span class="outlet-popup-address">${escapeHtml(cleanedAddress)}${first.postalCode ? ` (${escapeHtml(first.postalCode)})` : ""}</span>
          </div>`,
          { className: "outlet-popup-container", maxWidth: 280, minWidth: 220, closeButton: true, autoPanPadding: [16, 16] }
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
