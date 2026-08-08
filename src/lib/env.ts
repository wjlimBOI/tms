import { z } from "zod";

// Only the variables the app cannot function at all without. SMTP/Upstash/
// Anthropic/CRON_SECRET are real features that degrade gracefully when
// unset (sendTrackedEmail logs+skips, rate limiting no-ops, AI description
// falls back to the local generator, /api/cron/run 500s) - see README.md's
// env table - so they're checked here only as warnings, not hard failures.
const requiredEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Postgres connection string)"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required (NextAuth JWT signing secret)"),
  NEXTAUTH_URL: z.string().min(1, "NEXTAUTH_URL is required (base URL used in emailed links)"),
  LOCAL_ENCRYPTION_KEY: z.string().min(1, "LOCAL_ENCRYPTION_KEY is required (src/lib/encryption.ts)"),
});

const recommendedEnvVars = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;

// Runs once at server startup via src/instrumentation.ts's register() -
// before the server accepts any requests - so a misconfigured deployment
// fails immediately and loudly instead of confusingly at whatever request
// first happens to touch the missing variable (e.g. the first login after
// a NEXTAUTH_SECRET typo, or the first email after an SMTP_HOST typo).
export function validateEnv(): void {
  const result = requiredEnvSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(
      `Missing required environment variables:\n${messages}\n\nSee README.md's "Set up environment variables" section.`
    );
  }

  const missingRecommended = recommendedEnvVars.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(
      `[env] Optional but recommended environment variables are not set: ${missingRecommended.join(", ")}. ` +
        `Email features will silently fail to send until these are configured.`
    );
  }
}
