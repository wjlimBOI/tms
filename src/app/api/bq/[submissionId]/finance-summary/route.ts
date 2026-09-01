// app/api/bq/[submissionId]/finance-summary/route.ts
//
// Per-submission cost analysis using the real (previously unused)
// finance_budget_summary table: total submitted, a per-category breakdown
// flagging which categories are priced high/low versus this tender's other
// contractors, a recommended ceiling (the lowest competing total, if any),
// and a short AI-generated narrative — reusing the same
// getAnthropicClient/local-fallback pattern as admin/bq-template/rate-summary
// and the same DEVIATION_THRESHOLD_PCT classification (2026-08-10).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAnthropicClient } from "@/lib/anthropic";
import { classifyDeviation, DEVIATION_THRESHOLD_PCT } from "@/lib/bqRateSummary";
import { logInsert } from "@/lib/audit";
import { canAccessSubmission, canGenerateFinanceSummary } from "@/lib/permissions";

interface CategoryRow {
  category_id: number;
  category_name: string;
  total: number;
  comparisonAvg: number | null;
  deviationPct: number | null;
}

async function buildAiNotes(totalSubmitted: number, ceiling: number | null, categories: CategoryRow[]): Promise<string | null> {
  const flagged = categories.filter((c) => c.deviationPct !== null);
  if (flagged.length === 0 && ceiling === null) return null;

  let client;
  try {
    client = getAnthropicClient();
  } catch {
    return null;
  }

  const lines = [
    `Total submitted: $${totalSubmitted.toFixed(2)}.`,
    ceiling !== null ? `Lowest competing total on this tender: $${ceiling.toFixed(2)}.` : "No other submitted bids to compare against yet.",
    ...flagged.map((c) =>
      `${(c.deviationPct as number) > 0 ? "HIGH" : "LOW"}: "${c.category_name}" is $${c.total.toFixed(2)}, ${Math.abs(c.deviationPct as number).toFixed(0)}% ${(c.deviationPct as number) > 0 ? "above" : "below"} the $${(c.comparisonAvg as number).toFixed(2)} average of other contractors' bids on this tender.`
    ),
  ];

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      system:
        "You are a cost-control assistant for a facilities management tender system. Given one contractor's total bid, the lowest competing bid, and any categories priced significantly above/below other contractors' bids on the same tender, write a short 2-4 sentence plain-English summary for staff deciding whether to negotiate. Be factual and specific — mention which categories stand out. Plain text only, no headers, no markdown, no preamble.",
      messages: [{ role: "user", content: lines.join("\n") }],
    });
    if (response.stop_reason === "refusal") return null;
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    return text || null;
  } catch (error) {
    console.error("finance-summary: Anthropic call failed, falling back to local summary:", error);
    return null;
  }
}

function buildLocalNotes(totalSubmitted: number, ceiling: number | null, categories: CategoryRow[]): string {
  const high = categories.filter((c) => (c.deviationPct ?? 0) > 0);
  const low = categories.filter((c) => (c.deviationPct ?? 0) < 0);
  const parts = [`Total submitted: $${totalSubmitted.toFixed(2)}.`];
  if (ceiling !== null) {
    parts.push(`The lowest competing bid on this tender totals $${ceiling.toFixed(2)}.`);
  } else {
    parts.push("No other submitted bids on this tender to compare against yet.");
  }
  if (high.length > 0) {
    parts.push(`${high.length} categor${high.length === 1 ? "y is" : "ies are"} priced notably above other contractors: ${high.map((c) => c.category_name).join(", ")}.`);
  }
  if (low.length > 0) {
    parts.push(`${low.length} categor${low.length === 1 ? "y is" : "ies are"} priced notably below other contractors: ${low.map((c) => c.category_name).join(", ")}.`);
  }
  return parts.join(" ");
}

async function computeSummary(submissionId: number) {
  const subRes = await query(
    `SELECT tender_id, contractor_id FROM tender_submission WHERE submission_id = $1 AND is_deleted = false`,
    [submissionId]
  );
  if (subRes.rows.length === 0) return null;
  const { tender_id: tenderId, contractor_id: contractorId } = subRes.rows[0];

  const ownCategoriesRes = await query(
    `SELECT bli.category_id, wc.category_name, SUM(bli.amount) AS total
     FROM bq_line_item bli
     JOIN work_category wc ON wc.category_id = bli.category_id
     WHERE bli.submission_id = $1
     GROUP BY bli.category_id, wc.category_name`,
    [submissionId]
  );

  // Other contractors' latest Submitted/Approved category totals on the
  // same tender, for comparison — never exposed as raw competitor figures
  // to a contractor, this route is staff-only.
  const othersRes = await query(
    `SELECT ts.contractor_id, bli.category_id, SUM(bli.amount) AS total
     FROM tender_submission ts
     JOIN bq_line_item bli ON bli.submission_id = ts.submission_id
     WHERE ts.tender_id = $1 AND ts.contractor_id != $2 AND ts.is_deleted = false
       AND ts.status IN ('Submitted', 'Approved')
       AND ts.round_no = (
         SELECT MAX(round_no) FROM tender_submission
         WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false
       )
     GROUP BY ts.contractor_id, bli.category_id`,
    [tenderId, contractorId]
  );

  const othersByCategory = new Map<number, number[]>();
  const totalsByContractor = new Map<number, number>();
  for (const row of othersRes.rows) {
    const categoryId = row.category_id;
    const total = Number(row.total);
    if (!othersByCategory.has(categoryId)) othersByCategory.set(categoryId, []);
    othersByCategory.get(categoryId)!.push(total);
    totalsByContractor.set(row.contractor_id, (totalsByContractor.get(row.contractor_id) || 0) + total);
  }

  const categories: CategoryRow[] = ownCategoriesRes.rows.map((row) => {
    const total = Number(row.total);
    const comparisonValues = othersByCategory.get(row.category_id) || [];
    const comparisonAvg = comparisonValues.length > 0
      ? comparisonValues.reduce((a, b) => a + b, 0) / comparisonValues.length
      : null;
    const deviationPct = classifyDeviation(total, comparisonAvg, DEVIATION_THRESHOLD_PCT);
    return {
      category_id: row.category_id,
      category_name: row.category_name,
      total,
      comparisonAvg,
      deviationPct,
    };
  });

  const totalSubmitted = categories.reduce((sum, c) => sum + c.total, 0);
  const otherTotals = Array.from(totalsByContractor.values());
  const recommendedCeiling = otherTotals.length > 0 ? Math.min(...otherTotals) : null;

  return { tenderId, categories, totalSubmitted, recommendedCeiling };
}

// ---------- GET — fetch the existing summary, if any ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];

  const hasRolePermission = await canGenerateFinanceSummary(userId, roleIds);
  if (!hasRolePermission) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { submissionId } = await params;
  const subId = parseInt(submissionId);
  if (isNaN(subId)) return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });

  const sessionUserEmail = (session.user as any)?.email || null;
  const hasSubmissionAccess = await canAccessSubmission(subId, userId, roleIds, { userEmail: sessionUserEmail, forFinance: true });
  if (!hasSubmissionAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await query(
    `SELECT fbs.total_submitted, fbs.recommended_ceiling, fbs.category_breakdown, fbs.notes, fbs.created_at, fbs.updated_at
     FROM finance_budget_summary fbs
     JOIN submission_review sr ON sr.review_id = fbs.review_id
     WHERE fbs.submission_id = $1
     ORDER BY fbs.updated_at DESC LIMIT 1`,
    [subId]
  );

  return NextResponse.json(result.rows[0] || null);
}

// ---------- POST — generate (or regenerate) the summary ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];

  const hasRolePermission = await canGenerateFinanceSummary(userId, roleIds);
  if (!hasRolePermission) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { submissionId } = await params;
  const subId = parseInt(submissionId);
  if (isNaN(subId)) return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });

  const sessionUserEmail = (session.user as any)?.email || null;
  const hasSubmissionAccess = await canAccessSubmission(subId, userId, roleIds, { userEmail: sessionUserEmail, forFinance: true });
  if (!hasSubmissionAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const computed = await computeSummary(subId);
  if (!computed) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  const { categories, totalSubmitted, recommendedCeiling } = computed;

  const aiNotes = await buildAiNotes(totalSubmitted, recommendedCeiling, categories);
  const notes = aiNotes ?? buildLocalNotes(totalSubmitted, recommendedCeiling, categories);

  const categoryBreakdown = categories.map((c) => ({
    category_id: c.category_id,
    category_name: c.category_name,
    total: c.total,
    comparison_avg: c.comparisonAvg,
    deviation_pct: c.deviationPct,
  }));

  // Reuse an existing review for this submission if one exists (from a
  // prior note or resubmission request), otherwise create one.
  let reviewId: number;
  const existingReview = await query(
    `SELECT review_id FROM submission_review WHERE submission_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [subId]
  );
  if (existingReview.rows.length > 0) {
    reviewId = existingReview.rows[0].review_id;
  } else {
    const reviewRes = await query(
      `INSERT INTO submission_review (submission_id, reviewed_by, review_role, review_status)
       VALUES ($1, $2, $3, $4)
       RETURNING review_id`,
      [subId, userId, "Finance", "In Progress"]
    );
    reviewId = reviewRes.rows[0].review_id;
  }

  const upserted = await query(
    `INSERT INTO finance_budget_summary (review_id, submission_id, total_submitted, recommended_ceiling, category_breakdown, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (review_id) DO UPDATE
       SET total_submitted = $3, recommended_ceiling = $4, category_breakdown = $5, notes = $6, updated_at = NOW()
     RETURNING summary_id, total_submitted, recommended_ceiling, category_breakdown, notes, created_at, updated_at`,
    [reviewId, subId, totalSubmitted, recommendedCeiling, JSON.stringify(categoryBreakdown), notes]
  );
  const summary = upserted.rows[0];

  await logInsert(
    "finance_budget_summary",
    summary.summary_id,
    { submission_id: subId, total_submitted: totalSubmitted, recommended_ceiling: recommendedCeiling },
    userId,
    request,
    { action: "generate_finance_summary", submission_id: subId, source: "api" }
  );

  return NextResponse.json(summary, { status: 201 });
}
