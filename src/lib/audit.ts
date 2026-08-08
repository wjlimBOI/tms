// lib/audit.ts
import { query } from "./db";

interface AuditLogParams {
  tableName: string;
  recordId?: number | null;
  action: string;
  oldData?: any | null;
  newData?: any | null;
  userId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  details?: any | null;
}

function extractIpAndAgent(req?: any): { ip: string; agent: string } {
  if (!req) return { ip: "unknown", agent: "unknown" };
  if (typeof req.headers?.get === "function") {
    return {
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown",
      agent: req.headers.get("user-agent") || "unknown",
    };
  }
  if (req.headers) {
    return {
      ip: (req.headers["x-forwarded-for"] as string) || (req.headers["cf-connecting-ip"] as string) || "unknown",
      agent: (req.headers["user-agent"] as string) || "unknown",
    };
  }
  return { ip: "unknown", agent: "unknown" };
}

export function extractAuditContext(req?: any): {
  ipAddress: string;
  userAgent: string;
  requestId: string | null;
  details: {
    path?: string;
    method?: string;
    referer?: string;
    session_id?: string;
  };
} {
  const { ip, agent } = extractIpAndAgent(req);

  // Get request ID from header
  let requestId: string | null = null;
  if (req?.headers?.get) {
    requestId = req.headers.get("x-request-id");
  } else if (req?.headers) {
    requestId = req.headers["x-request-id"] || null;
  }

  const details: any = {};
  if (req?.url) {
    try {
      const url = new URL(req.url);
      details.path = url.pathname;
      details.method = req.method || "GET";
    } catch {
      // ignore
    }
  }
  if (req?.headers?.get) {
    details.referer = req.headers.get("referer") || undefined;
    details.session_id = req.headers.get("x-session-id") || undefined;
  } else if (req?.headers) {
    details.referer = req.headers["referer"] || req.headers["referrer"] || undefined;
    details.session_id = req.headers["x-session-id"] || undefined;
  }

  return { ipAddress: ip, userAgent: agent, requestId, details };
}

export async function logEvent(params: AuditLogParams): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log 
        (table_name, record_id, action, old_data, new_data, changed_by, ip_address, user_agent, request_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        params.tableName,
        params.recordId || null,
        params.action,
        params.oldData ? JSON.stringify(params.oldData) : null,
        params.newData ? JSON.stringify(params.newData) : null,
        params.userId || null,
        params.ipAddress || null,
        params.userAgent || null,
        params.requestId || null,
        params.details ? JSON.stringify(params.details) : null,
      ]
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

// ===== CONVENIENCE WRAPPERS =====

export function logInsert(
  tableName: string,
  recordId: number,
  newData: any,
  userId?: number,
  req?: any,
  extraDetails?: any
) {
  const ctx = extractAuditContext(req);
  return logEvent({
    tableName,
    recordId,
    action: "INSERT",
    newData,
    userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    details: { ...ctx.details, ...extraDetails },
  });
}

export function logUpdate(
  tableName: string,
  recordId: number,
  oldData: any,
  newData: any,
  userId?: number,
  req?: any,
  extraDetails?: any
) {
  const ctx = extractAuditContext(req);
  return logEvent({
    tableName,
    recordId,
    action: "UPDATE",
    oldData,
    newData,
    userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    details: { ...ctx.details, ...extraDetails },
  });
}

export function logDelete(
  tableName: string,
  recordId: number,
  oldData: any,
  userId?: number,
  req?: any,
  extraDetails?: any
) {
  const ctx = extractAuditContext(req);
  return logEvent({
    tableName,
    recordId,
    action: "DELETE",
    oldData,
    userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    details: { ...ctx.details, ...extraDetails },
  });
}

export async function logAuthEvent(
  action: "LOGIN" | "LOGOUT" | "LOGIN_FAILED" | "PERMISSION_DENIED",
  userId?: number,
  req?: any,
  extraDetails?: any
) {
  const ctx = extractAuditContext(req);
  const result = logEvent({
    tableName: "auth",
    recordId: userId || undefined,
    action,
    newData: { details: extraDetails },
    userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    details: { ...ctx.details, ...extraDetails },
  });

  // Also persist to the dedicated login_history table (real columns, real
  // indexes, previously unused by any application code) — a queryable login
  // audit trail, independent of the generic audit_log write above so a
  // failure here can never affect that write or block login itself.
  // ip_address is NOT NULL @db.Inet — "unknown" isn't a valid inet literal,
  // so fall back to a recognizable sentinel address rather than a value
  // that would fail the insert (and silently drop the row) whenever IP
  // extraction comes up empty.
  if (action === "LOGIN" || action === "LOGIN_FAILED") {
    const ip = ctx.ipAddress && ctx.ipAddress !== "unknown" ? ctx.ipAddress : "0.0.0.0";
    query(
      `INSERT INTO login_history (user_id, username_attempted, ip_address, user_agent, login_status, failure_reason, auth_method)
       VALUES ($1, $2, $3, $4, $5, $6, 'PASSWORD')`,
      [
        userId || null,
        extraDetails?.username || null,
        ip,
        ctx.userAgent && ctx.userAgent !== "unknown" ? ctx.userAgent : null,
        action === "LOGIN" ? "SUCCESS" : "FAILED",
        action === "LOGIN_FAILED" ? extraDetails?.reason || null : null,
      ]
    ).catch((err: unknown) => console.error("Failed to write login_history:", err));
  }

  return result;
}