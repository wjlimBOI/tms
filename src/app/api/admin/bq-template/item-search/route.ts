// app/api/admin/bq-template/item-search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { tokenize, scoreMatch } from "@/lib/bqItemSearch";
import { ROLE_IDS } from "@/lib/roles";

// Helper: check if user is admin (matches the sibling admin/bq-template/*
// routes' convention).
async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: { in: [ROLE_IDS.ADMIN, ROLE_IDS.DEVELOPER] } },
  });
  return !!userRole;
}

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
});

const MAX_RESULTS = 10;
const CANDIDATE_LIMIT = 300;

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// "Find & reuse an existing item" search for the BQ template editor —
// admin types free text, gets back items already used on other tenders'
// templates, ranked by relevance and how often they've been reused (see
// src/lib/bqItemSearch.ts for why this isn't a real semantic/LLM search).
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  const validation = querySchema.safeParse({ q: request.nextUrl.searchParams.get("q") });
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid query", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { q } = validation.data;
  const words = tokenize(q);
  if (words.length === 0) {
    return NextResponse.json({ results: [] }, { headers: corsHeaders });
  }

  // Broad, safely-parameterized pre-filter narrows the candidate pool to
  // rows containing at least one query word; ranking then happens in JS.
  const candidates = await prisma.bq_template_items.findMany({
    where: {
      OR: words.map((w) => ({ description: { contains: w, mode: 'insensitive' as const } })),
    },
    select: { description: true, unit: true, rate: true, category_id: true, tender_id: true },
    take: CANDIDATE_LIMIT,
  });

  // Group by normalized description (+ unit/category) so an item reused
  // across many tenders becomes one ranked result with a usage count,
  // instead of N duplicate rows.
  const groups = new Map<
    string,
    { description: string; unit: string; category_id: number; tenderIds: Set<number>; rates: number[] }
  >();
  for (const c of candidates) {
    const key = `${c.description.trim().toLowerCase()}|${c.unit}|${c.category_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        description: c.description.trim(),
        unit: c.unit,
        category_id: c.category_id,
        tenderIds: new Set(),
        rates: [],
      });
    }
    const g = groups.get(key)!;
    g.tenderIds.add(c.tender_id);
    if (c.rate !== null) g.rates.push(Number(c.rate));
  }

  const categoryIds = [...new Set([...groups.values()].map((g) => g.category_id))];
  const categories = await prisma.work_category.findMany({
    where: { category_id: { in: categoryIds } },
    select: { category_id: true, category_name: true },
  });
  const categoryNameById = new Map(categories.map((c) => [c.category_id, c.category_name]));

  const results = [...groups.values()]
    .map((g) => {
      const usageCount = g.tenderIds.size;
      const avgRate = g.rates.length > 0 ? g.rates.reduce((a, b) => a + b, 0) / g.rates.length : null;
      return {
        description: g.description,
        unit: g.unit,
        category_id: g.category_id,
        category_name: categoryNameById.get(g.category_id) || "Uncategorized",
        usage_count: usageCount,
        avg_rate: avgRate,
        score: scoreMatch(q, { description: g.description, usageCount }),
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ score, ...rest }) => rest);

  return NextResponse.json({ results }, { headers: corsHeaders });
}
