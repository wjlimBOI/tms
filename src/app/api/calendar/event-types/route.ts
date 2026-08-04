import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const projectTypes = await query(`SELECT DISTINCT event_type FROM calendar_events WHERE event_type IS NOT NULL`);
    const teamTypes = await query(`SELECT DISTINCT event_type FROM team_events WHERE event_type IS NOT NULL`);
    const typesSet = new Set<string>();
    projectTypes.rows.forEach(row => typesSet.add(row.event_type));
    teamTypes.rows.forEach(row => typesSet.add(row.event_type));
    if (typesSet.size === 0) {
      ["meeting", "site_visit", "work_trip", "office_day", "milestone", "deadline"].forEach(t => typesSet.add(t));
    }
    const types = Array.from(typesSet).map(type => ({
      value: type,
      label: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    }));
    return NextResponse.json({ types });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}