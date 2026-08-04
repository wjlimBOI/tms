// app/api/user/preferences/dashboard-layout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logUpdate, logAuthEvent } from "@/lib/audit";

// ---------- GET (read‑only, unchanged) ----------
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: { dashboard_layout: true },
    });

    return NextResponse.json({ layout: user?.dashboard_layout || null });
  } catch (error) {
    console.error("GET layout error:", error);
    return NextResponse.json({ error: "Failed to load layout" }, { status: 500 });
  }
}

// ---------- POST (save layout) ----------
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { layout } = await req.json();
    if (!layout) {
      return NextResponse.json({ error: "Layout required" }, { status: 400 });
    }

    // 1. Fetch old layout for audit
    const oldUser = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: { user_id: true, dashboard_layout: true },
    });
    if (!oldUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const oldLayout = oldUser.dashboard_layout;

    // 2. Update
    await prisma.users.update({
      where: { email: session.user.email },
      data: { dashboard_layout: layout },
    });

    // 3. Audit log
    await logUpdate(
      "user",
      oldUser.user_id,
      { dashboard_layout: oldLayout },
      { dashboard_layout: layout },
      session.user.id,
      req,
      {
        action: "update_dashboard_layout",
        source: "api"
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST layout error:", error);
    return NextResponse.json({ error: "Failed to save layout" }, { status: 500 });
  }
}