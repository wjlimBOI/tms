import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode for development
  reactStrictMode: true,

  // Security headers
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';

    return [
      {
        // Excludes /documents/* (public reference PDFs meant to be embedded
        // inline via <iframe> on the same origin) - X-Frame-Options: DENY
        // would block the browser from rendering them in-page even though
        // it's the app's own page framing its own same-origin file.
        source: '/:path((?!documents/).*)',
        headers: [
          // Basic security headers
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },

          // HSTS (only in production)
          ...(isProduction
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
            : []),

          // Content-Security-Policy is set in proxy.ts (needs a per-request nonce,
          // which static headers here can't provide). Do not duplicate it here.
        ],
      },
    ];
  },

  // Other configurations (e.g., images, experimental features) can go here
};

export default nextConfig;