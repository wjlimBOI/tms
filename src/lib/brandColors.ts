export const brandColors: Record<string, { borderColor: string; bg: string; text: string; badge: string }> = {
  "Yun Nam": { borderColor: "#f97316", bg: "#fff7ed", text: "#9a3412", badge: "#ffedd5" },
  "London": { borderColor: "#ef4444", bg: "#fef2f2", text: "#991b1b", badge: "#fee2e2" },
  "New York": { borderColor: "#3b82f6", bg: "#eff6ff", text: "#1e40af", badge: "#dbeafe" },
  "Dorra": { borderColor: "#a855f7", bg: "#f5f3ff", text: "#5b21b6", badge: "#e9d5ff" },
  "Shakura": { borderColor: "#ec4899", bg: "#fdf2f8", text: "#9d174d", badge: "#fce7f3" },
  "Jonsson": { borderColor: "#eab308", bg: "#fefce8", text: "#854d0e", badge: "#fef9c3" },
  "Victoria": { borderColor: "#14b8a6", bg: "#f0fdfa", text: "#115e59", badge: "#ccfbf1" },
};

export function getBrandColor(brandName: string) {
  const normalized = brandName.toLowerCase();
  for (const [key, colors] of Object.entries(brandColors)) {
    if (normalized.includes(key.toLowerCase())) return colors;
  }
  return { borderColor: "#9ca3af", bg: "#f9fafb", text: "#374151", badge: "#f3f4f6" };
}