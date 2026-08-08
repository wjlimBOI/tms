// app/api/health/route.ts
//
// Unauthenticated health-check for load balancers / uptime monitors - none
// existed before. Deliberately returns no internal detail on failure (no
// raw DB error, no stack trace) since this endpoint is public by design.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    await query("SELECT 1");
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
