// app/api/admin/bq-template/rate-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { getAnthropicClient } from "@/lib/anthropic";
import { computeStats } from "@/lib/rateStats";
import { classifyDeviation, buildLocalSummary, type FlaggedItem } from "@/lib/bqRateSummary";
import { z } from "zod";

async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: 1 },
  });
  return !!userRole;
}

const querySchema = z.object({
  tenderId: z.string().regex(/^\d+$/, "tenderId must be a numeric string"),
});

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

async function buildAiSummary(flaggedHigh: FlaggedItem[], flaggedLow: FlaggedItem[]): Promise<string | null> {
  let client;
  try {
    client = getAnthropicClient();
  } catch {
    return null;
  }

  const lines = [
    ...flaggedHigh.map(
      (f) => `HIGH: "${f.description}" is $${f.rate.toFixed(2)}, ${f.deviationPct.toFixed(0)}% above the $${f.comparisonAvg.toFixed(2)} historical average.`
    ),
    ...flaggedLow.map(
      (f) => `LOW: "${f.description}" is $${f.rate.toFixed(2)}, ${Math.abs(f.deviationPct).toFixed(0)}% below the $${f.comparisonAvg.toFixed(2)} historical average.`
    ),
  ];

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      system:
        "You are a cost-control assistant for a facilities management tender system. Given a list of BQ (Bill of Quantities) line items flagged as priced significantly above or below their historical/market average, write a short 2-4 sentence plain-English summary for an admin reviewing this tender's pricing. Be factual and specific — mention the counts and call out the single most extreme outlier by name. Plain text only, no headers, no markdown, no preamble like \"Here is the summary:\".",
      messages: [{ role: "user", content: lines.join("\n") }],
    });

    if (response.stop_reason === "refusal") return null;
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    return text || null;
  } catch (error) {
    console.error("rate-summary: Anthropic call failed, falling back to local summary:", error);
    return null;
  }
}

// Auto-scans every priced item in a tender's BQ template against this app's
// internal rate history (see src/app/api/admin/bq-template/market-rate for
// what "market"/"reference" mean here) and flags anything priced more than
// bqRateSummary.DEVIATION_THRESHOLD_PCT away from its comparison average.
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  const validation = querySchema.safeParse({ tenderId: request.nextUrl.searchParams.get("tenderId") });
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid tenderId", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const tenderId = parseInt(validation.data.tenderId, 10);

  const items = await prisma.bq_template_items.findMany({
    where: { tender_id: tenderId, rate: { not: null } },
    select: { item_id: true, description: true, rate: true },
  });

  if (items.length === 0) {
    return NextResponse.json(
      {
        flaggedHigh: [],
        flaggedLow: [],
        withinRange: 0,
        noHistory: 0,
        totalPriced: 0,
        summary: buildLocalSummary([], [], 0, 0, 0),
        aiGenerated: false,
      },
      { headers: corsHeaders }
    );
  }

  // One representative-cased description per normalized key, to build a
  // safe parameterized OR list without querying per-item in a loop.
  const descriptionByKey = new Map<string, string>();
  for (const item of items) {
    const key = item.description.trim().toLowerCase();
    if (!descriptionByKey.has(key)) descriptionByKey.set(key, item.description.trim());
  }
  const uniqueDescriptions = [...descriptionByKey.values()];

  const [referenceRows, marketRows] = await Promise.all([
    prisma.bq_template_items.findMany({
      where: {
        tender_id: { not: tenderId },
        rate: { not: null },
        OR: uniqueDescriptions.map((d) => ({ description: { equals: d, mode: 'insensitive' as const } })),
      },
      select: { description: true, rate: true },
    }),
    prisma.bq_line_item.findMany({
      where: {
        submission: { status: { in: ['Submitted', 'Approved'] }, is_deleted: false },
        OR: uniqueDescriptions.map((d) => ({ description: { equals: d, mode: 'insensitive' as const } })),
      },
      select: { description: true, unit_price: true },
    }),
  ]);

  const referenceByKey = new Map<string, number[]>();
  for (const r of referenceRows) {
    const key = r.description.trim().toLowerCase();
    if (!referenceByKey.has(key)) referenceByKey.set(key, []);
    if (r.rate !== null) referenceByKey.get(key)!.push(Number(r.rate));
  }
  const marketByKey = new Map<string, number[]>();
  for (const r of marketRows) {
    const key = r.description.trim().toLowerCase();
    if (!marketByKey.has(key)) marketByKey.set(key, []);
    marketByKey.get(key)!.push(Number(r.unit_price));
  }

  const flaggedHigh: FlaggedItem[] = [];
  const flaggedLow: FlaggedItem[] = [];
  let withinRange = 0;
  let noHistory = 0;

  for (const item of items) {
    const key = item.description.trim().toLowerCase();
    const marketStats = computeStats(marketByKey.get(key) || []);
    const referenceStats = computeStats(referenceByKey.get(key) || []);
    const comparisonAvg = marketStats.count > 0 ? marketStats.avg : referenceStats.avg;

    if (comparisonAvg === null) {
      noHistory++;
      continue;
    }

    const rate = Number(item.rate);
    const deviationPct = classifyDeviation(rate, comparisonAvg);
    if (deviationPct === null) {
      withinRange++;
      continue;
    }

    const flagged: FlaggedItem = {
      item_id: item.item_id,
      description: item.description,
      rate,
      comparisonAvg,
      deviationPct,
    };
    if (deviationPct > 0) flaggedHigh.push(flagged);
    else flaggedLow.push(flagged);
  }

  const totalPriced = items.length;
  const aiSummary =
    flaggedHigh.length + flaggedLow.length > 0 ? await buildAiSummary(flaggedHigh, flaggedLow) : null;
  const summary = aiSummary ?? buildLocalSummary(flaggedHigh, flaggedLow, withinRange, noHistory, totalPriced);

  return NextResponse.json(
    {
      flaggedHigh,
      flaggedLow,
      withinRange,
      noHistory,
      totalPriced,
      summary,
      aiGenerated: aiSummary !== null,
    },
    { headers: corsHeaders }
  );
}
