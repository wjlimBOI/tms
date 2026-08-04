// src/lib/brandLogos.ts

const brandLogoMapping: Record<string, string> = {
  "Jonsson": "jonsson.png",
  "Shakura": "shakura.png",
  "Yun Nam": "yun_nam.png",
  "London": "london.png",
  "Victoria": "victoria.png",
  "New York": "new_york.png",
  "Dorra": "dorra.png"
};

/**
 * Returns the public path to the brand's logo, or null if not found.
 */
export function getLogoPath(brandName: string | null | undefined): string | null {
  if (!brandName) return null;
  const filename = brandLogoMapping[brandName.trim()];
  return filename ? `/logos/${filename}` : null;
}