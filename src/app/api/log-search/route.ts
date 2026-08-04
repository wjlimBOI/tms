import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { query: searchQuery, itemKey } = await req.json();
    if (!searchQuery) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    await query(
      `INSERT INTO search_logs (user_id, query, item_key, clicked) 
       VALUES ($1, $2, $3, $4)`,
      [session.user.id, searchQuery, itemKey || null, !!itemKey]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to log search:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}