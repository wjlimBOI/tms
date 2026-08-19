export const brandColors: Record<string, { borderColor: string; bg: string; text: string; badge: string }> = {
  "Yun Nam": { borderColor: "#f97316", bg: "#fff7ed", text: "#9a3412", badge: "#ffedd5" },
  "London": { borderColor: "#ef4444", bg: "#fef2f2", text: "#991b1b", badge: "#fee2e2" },
  "New York": { borderColor: "#3b82f6", bg: "#eff6ff", text: "#1e40af", badge: "#dbeafe" },
  "Dorra": { borderColor: "#a855f7", bg: "#f5f3ff", text: "#5b21b6", badge: "#e9d5ff" },
  "Shakura": { borderColor: "#ec4899", bg: "#fdf2f8", text: "#9d174d", badge: "#fce7f3" },
  "Jonsson": { borderColor: "#eab308", bg: "#fefce8", text: "#854d0e", badge: "#fef9c3" },
  "Victoria": { borderColor: "#0abab5", bg: "#effcfb", text: "#0f6e6a", badge: "#c7f3f0" },
};

export function getBrandColor(brandName: string) {
  const normalized = brandName.toLowerCase();
  for (const [key, colors] of Object.entries(brandColors)) {
    if (normalized.includes(key.toLowerCase())) return colors;
  }
  return { borderColor: "#9ca3af", bg: "#f9fafb", text: "#374151", badge: "#f3f4f6" };
}

// Slug for each brand's fixed color set, so callers that can't use inline
// styles (e.g. OutletMap.tsx's Leaflet popups - blocked by this app's CSP,
// which has no 'unsafe-inline' for style-src) can apply the color via a
// static CSS class instead. Keep in sync with the `brandColors` keys above.
const brandColorSlugs: Record<string, string> = {
  "Yun Nam": "yun-nam",
  "London": "london",
  "New York": "new-york",
  "Dorra": "dorra",
  "Shakura": "shakura",
  "Jonsson": "jonsson",
  "Victoria": "victoria",
};

export function getBrandColorSlug(brandName: string): string {
  const normalized = brandName.toLowerCase();
  for (const [key, slug] of Object.entries(brandColorSlugs)) {
    if (normalized.includes(key.toLowerCase())) return slug;
  }
  return "default";
}

// Public marketing site for each brand - same URLs as the partner cards on
// the homepage (src/app/page.tsx). Kept here too so any other surface (e.g.
// the navbar brand strip) can link out without duplicating the list.
const brandWebsites: Record<string, string> = {
  "Yun Nam": "https://yunnamhaircare.com.sg/",
  "London": "https://londonweight.com.sg/",
  "New York": "https://newyorkskinsolutions.com.sg/",
  "Dorra": "https://dorraslim.com.sg/",
  "Shakura": "https://www.shakura.com.sg/",
  "Jonsson": "https://jonssonprotein.com.sg/",
  "Victoria": "https://victoriafacelift.com.sg/",
};

export function getBrandWebsite(brandName: string): string | null {
  const normalized = brandName.toLowerCase();
  for (const [key, url] of Object.entries(brandWebsites)) {
    if (normalized.includes(key.toLowerCase())) return url;
  }
  return null;
}