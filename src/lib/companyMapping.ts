// lib/companyMapping.ts

export const brandCompanyMap: Record<string, {
  companyName: string;
  address: string;
  tel: string;
  fax: string;
}> = {
  "YUN NAM": {
    companyName: "YUN NAM HAIR CARE (S) PTE LTD",
    address: "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526",
    tel: "6372 2668",
    fax: "6565 1861"
  },
  "LONDON": {
    companyName: "LONDON WEIGHT MANAGEMENT (S) PTE LTD",
    address: "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526",
    tel: "6372 2668",
    fax: "6565 1861"
  },
  "NEW YORK": {
    companyName: "NEW YORK SKIN SOLUTIONS (S) PTE LTD",
    address: "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526",
    tel: "6372 2668",
    fax: "6565 1861"
  },
  "DORRA": {
    companyName: "DORRA SLIMMING PTE LTD",
    address: "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526",
    tel: "6372 2668",
    fax: "6565 1861"
  },
  "SHAKURA": {
    companyName: "SHAKURA PIGMENTATION BEAUTY PTE LTD",
    address: "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526",
    tel: "6372 2668",
    fax: "6565 1861"
  },
  "JONSSON": {
    companyName: "JONSSON PROTEIN HEALTHY HAIR GROWTH PTE LTD",
    address: "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526",
    tel: "6372 2668",
    fax: "6565 1861"
  },
  "VICTORIA": {
    companyName: "VICTORIA FACELIFT PTE LTD",
    address: "2 Venture Drive, #21-01 Vision Exchange, Singapore 608526",
    tel: "6372 2668",
    fax: "6565 1861"
  }
};

/**
 * Get company details by brand name.
 * Normalises the brand name to uppercase and trims whitespace.
 */
export function getCompanyDetailsByBrand(brandName: string) {
  if (!brandName) return null;
  const normalized = brandName.toUpperCase().trim();
  return brandCompanyMap[normalized] || null;
}