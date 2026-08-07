// app/api/admin/bq-template/market-rate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { computeStats } from "@/lib/rateStats";

// Helper: check if user is admin (matches the sibling admin/bq-template/*
// routes' convention of querying user_roles directly, rather than trusting
// session.user.roleIds).
async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: 1 },
  });
  return !!userRole;
}

const querySchema = z.object({
  description: z.string().trim().min(1).max(500),
  exclude_item_id: z.coerce.number().int().positive().optional(),
});

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// Compares a candidate BQ item rate against this app's own historical data -
// there's no external market-data source wired into this app, so "market
// rate" here means two internal signals:
//  - referenceStats: rates other admins have set for the same item
//    description on other tenders' BQ templates.
//  - marketStats: unit prices contractors have actually bid in real
//    Submitted/Approved submissions for the same item description - the
//    closest thing this app has to "what people are actually paying."
// Matching is exact (case-insensitive, trimmed) on description, not fuzzy -
// a deliberate simplification, not a bug; different wording for the same
// real-world item won't be found.
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  const searchParams = request.nextUrl.searchParams;
  const validation = querySchema.safeParse({
    description: searchParams.get("description"),
    exclude_item_id: searchParams.get("exclude_item_id") ?? undefined,
  });
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid query", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { description, exclude_item_id } = validation.data;

  const referenceRows = await prisma.bq_template_items.findMany({
    where: {
      description: { equals: description, mode: 'insensitive' },
      rate: { not: null },
      ...(exclude_item_id ? { item_id: { not: exclude_item_id } } : {}),
    },
    select: { rate: true },
  });

  const marketRows = await prisma.bq_line_item.findMany({
    where: {
      description: { equals: description, mode: 'insensitive' },
      submission: { status: { in: ['Submitted', 'Approved'] }, is_deleted: false },
    },
    select: { unit_price: true },
  });

  return NextResponse.json(
    {
      referenceStats: computeStats(referenceRows.map((r) => Number(r.rate))),
      marketStats: computeStats(marketRows.map((r) => Number(r.unit_price))),
    },
    { headers: corsHeaders }
  );
}
