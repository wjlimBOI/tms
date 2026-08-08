import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Environment variables
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Rate‑limit settings (with defaults)
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const windowSeconds = Math.floor(windowMs / 1000);

// Create Redis client only if credentials exist
const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

// Fail fast at startup rather than silently running unprotected in
// production — the bypass below is meant for local development, where no
// Redis instance exists, not for a misconfigured production deploy. Without
// this, checkRateLimit() would quietly return { success: true } for every
// request forever, with no signal to anyone that login/password-reset/
// AI-generation endpoints have zero rate limiting. Matches the same
// fail-fast precedent already used in src/lib/db.ts for DB_SSL_CA_PATH.
if (process.env.NODE_ENV === 'production' && !redis) {
  throw new Error(
    'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set in production. ' +
      'Rate limiting (login, password-reset, AI-generation endpoints) would silently ' +
      'run unprotected otherwise. Configure Upstash Redis before deploying, or set ' +
      'NODE_ENV to a non-production value if this is intentional (e.g. a staging ' +
      'environment without Redis provisioned yet).'
  );
}

const limiter = Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`);

export const rateLimit = redis
  ? new Ratelimit({ redis, limiter })
  : null;

export const isRateLimitEnabled = !!redis;

/**
 * Check rate limit for an identifier (e.g., IP address).
 * Bypassed only when Redis isn't configured — safe in development, and the
 * module-load check above prevents this path from ever being reached
 * silently in production.
 */
export async function checkRateLimit(identifier: string) {
  if (!isRateLimitEnabled || !rateLimit) {
    // Bypass (dev/local only — see the production guard above)
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests,
      reset: Date.now() + windowMs,
    };
  }
  return rateLimit.limit(identifier);
}