import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(
      `SELECT unit_id, unit_code, unit_name
       FROM unit_measure
       ORDER BY sort_order`
    );
    
    // Normalise: ensure 'MM2' unit_code appears as 'mm²' in unit_name
    const units = result.rows.map((row: any) => ({
      ...row,
      unit_name: row.unit_code === 'MM2' ? 'mm²' : row.unit_name
    }));
    
    // Deduplicate by unit_name (keep first occurrence)
    const uniqueUnits = units.filter(
      (unit, index, self) => index === self.findIndex((u) => u.unit_name === unit.unit_name)
    );
    
    return NextResponse.json(uniqueUnits);
  } catch (error) {
    console.error("Failed to fetch units:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}