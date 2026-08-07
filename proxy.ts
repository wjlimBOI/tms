// src/proxy.ts
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Generate a request ID for audit tracing (for all requests)
  const requestId = crypto.randomUUID();

  // 2. Generate a CSP nonce (only used for pages, but we set it for all)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const isDev = process.env.NODE_ENV === 'development';

  // Clone headers to add custom values
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-nonce', nonce);

  // Build the response
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Always set the request ID in the response header (for debugging)
  response.headers.set('x-request-id', requestId);

  // --- Security headers (only for page routes, not API or static) ---
  // /documents/* is the public reference-document folder (PDFs meant to be
  // viewed inline via <iframe> on the same origin, e.g. the express-interest
  // page) - it must not get frame-ancestors 'none' / X-Frame-Options: DENY,
  // or the browser refuses to render them in-page even same-origin.
  const isPageRoute =
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/favicon.ico') &&
    !pathname.startsWith('/documents/') &&
    !pathname.match(/\.(jpg|jpeg|png|gif|ico|svg|webp)$/);

  if (isPageRoute) {
    // Build CSP header
    let scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'`;
    if (isDev) scriptSrc += ` 'unsafe-eval'`;

    const cspHeader = `
      default-src 'self';
      script-src ${scriptSrc};
      style-src 'self' 'nonce-${nonce}';
      img-src 'self' data: blob: https:;
      font-src 'self';
      connect-src 'self' https:;
      frame-src 'none';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      upgrade-insecure-requests;
      block-all-mixed-content;
    `;

    response.headers.set(
      'Content-Security-Policy',
      cspHeader.replace(/\s{2,}/g, ' ').trim()
    );
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );

    // Remove server information leakage
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');
  }

  return response;
}

// Unified matcher: applies to all routes except static assets and prefetch requests
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon.ico
     * - image files (jpg, png, etc.)
     * - prefetch requests (next-router-prefetch header)
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|ico|svg|webp)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    // Explicitly match API routes so they also get the request ID
    {
      source: '/api/:path*',
    },
  ],
};