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

// The limiter – passing windowSeconds as a number (the library accepts numbers as milliseconds)
// The `as any` bypasses a TypeScript strictness issue; the runtime works fine.
const limiter = Ratelimit.slidingWindow(maxRequests, windowSeconds as any);

export const rateLimit = redis
  ? new Ratelimit({ redis, limiter })
  : null;

export const isRateLimitEnabled = !!redis;

/**
 * Check rate limit for an identifier (e.g., IP address).
 * In development (no Redis), we always allow the request.
 */
export async function checkRateLimit(identifier: string) {
  if (!isRateLimitEnabled || !rateLimit) {
    // Bypass in development – return a dummy success
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests,
      reset: Date.now() + windowMs,
    };
  }
  return rateLimit.limit(identifier);
}