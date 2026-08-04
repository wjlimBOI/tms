import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const logosDir = path.join(process.cwd(), "public", "logos");
  let logos: string[] = [];
  try {
    const files = fs.readdirSync(logosDir);
    logos = files.filter(file => /\.(png|jpg|jpeg|svg)$/i.test(file));
  } catch (err) {
    console.error("Failed to read logos directory:", err);
  }
  return NextResponse.json({ logos });
}