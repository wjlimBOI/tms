import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Optional: protect this endpoint so only authenticated users can fetch synonyms
    // const session = await getServerSession(authOptions);
    // if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch single‑word synonyms
    const synonymResult = await query(`SELECT base_term, variants FROM synonym_map`);
    const phraseResult = await query(`SELECT base_phrase, variants FROM phrase_map`);

    // Convert to the format expected by the frontend (Record<string, string[]>)
    const synonyms: Record<string, string[]> = {};
    for (const row of synonymResult.rows) {
      synonyms[row.base_term] = row.variants;
    }

    const phrases: Record<string, string[]> = {};
    for (const row of phraseResult.rows) {
      phrases[row.base_phrase] = row.variants;
    }

    return NextResponse.json({ synonyms, phrases });
  } catch (error) {
    console.error("Failed to fetch synonyms:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}