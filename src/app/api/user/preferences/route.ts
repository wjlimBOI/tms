// src/app/api/user/preferences/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

const DEFAULT_PREFERENCES = {
  newTenders: true,
  statusChanges: true,
  announcements: true,
  alerts: true,
};

// GET /api/user/preferences
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await query(
    `SELECT notification_preferences FROM users WHERE user_id = $1`,
    [session.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const prefs = result.rows[0].notification_preferences;
  // Ensure all keys exist; merge with defaults if any missing
  const merged = { ...DEFAULT_PREFERENCES, ...(prefs || {}) };
  return NextResponse.json({ notifications: merged });
}

// PUT /api/user/preferences
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { notifications } = body;

  // Validate that notifications is an object with the expected keys
  if (!notifications || typeof notifications !== "object") {
    return NextResponse.json(
      { error: "Missing or invalid 'notifications' object" },
      { status: 400 }
    );
  }

  // Only allow specific keys
  const allowedKeys = ["newTenders", "statusChanges", "announcements", "alerts"];
  const validated: any = {};
  let hasInvalid = false;
  for (const key of allowedKeys) {
    if (key in notifications) {
      if (typeof notifications[key] !== "boolean") {
        hasInvalid = true;
        break;
      }
      validated[key] = notifications[key];
    } else {
      // Default to true if missing (or keep existing)
      // We'll merge with existing below
    }
  }
  if (hasInvalid) {
    return NextResponse.json(
      { error: "All notification preferences must be boolean values" },
      { status: 400 }
    );
  }

  // Fetch current preferences to merge (so we don't lose other keys if any)
  const currentRes = await query(
    `SELECT notification_preferences FROM users WHERE user_id = $1`,
    [session.user.id]
  );
  const current = currentRes.rows[0]?.notification_preferences || {};

  // Merge: keep all existing keys, overwrite with provided ones
  const merged = { ...current, ...validated };

  // Update the database
  await query(
    `UPDATE users SET notification_preferences = $1 WHERE user_id = $2`,
    [merged, session.user.id]
  );

  return NextResponse.json({ success: true, notifications: merged });
}