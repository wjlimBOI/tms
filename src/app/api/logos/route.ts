import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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