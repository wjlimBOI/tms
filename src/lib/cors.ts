// ===========================================
// CORS Configuration (Environment‑Aware)
// ===========================================

/**
 * Allowed origins are read from ALLOWED_ORIGINS env variable.
 * Format: comma‑separated list, e.g. "https://example.com,https://www.example.com"
 * Fallback to localhost for development.
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

/**
 * Get CORS headers for a given origin.
 * Returns an empty object if the origin is not allowed.
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  return {};
}

/**
 * Helper to handle OPTIONS preflight requests.
 * Returns a Response with the appropriate CORS headers, or null if origin is not allowed.
 */
export function handleCorsOptions(origin: string | null): Response | null {
  const headers = getCorsHeaders(origin);
  if (Object.keys(headers).length === 0) return null;
  return new Response(null, {
    status: 204,
    headers,
  });
}