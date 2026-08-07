// src/app/api/bq/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";

const querySchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
});

// Stop words
const stopWords = new Set([
  "a","an","the","of","for","on","at","to","in","with","without",
  "and","or","but","so","for","nor","yet","as","by","from","into",
  "what","which","who","whom","whose","why","how","where","when",
  "are","were","was","is","am","be","been","being","do","does","did",
  "have","has","had","we","you","they","them","their","our","us",
  "kind","type","style","need","want","use","using","used",
  "much","many","more","most","some","any","such",
]);

function extractKeywords(query: string): string[] {
  return query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

async function getUserRoleIds(userId: number): Promise<number[]> {
  const userRoles = await prisma.user_roles.findMany({
    where: { user_id: userId },
    select: { role_id: true },
  });
  return userRoles.map(ur => ur.role_id);
}

async function canViewCostComparison(userId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.permission_id = rp.permission_id
    WHERE ur.user_id = ${userId} AND p.action = 'view_cost_comparison'
    LIMIT 1
  ` as any[];
  return rows.length > 0;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const queryResult = querySchema.safeParse({ q: searchParams.get('q') });
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query", details: queryResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const queryParam = sanitize(queryResult.data.q);
  const keywords = extractKeywords(queryParam);
  const searchTerms = keywords.length > 0 ? keywords : [queryParam.toLowerCase()];

  const userId = session.user.id;
  const roleIds = await getUserRoleIds(userId);
  const isContractor = roleIds.includes(ROLE_IDS.CONTRACTOR);

  // Non-contractors search across every contractor's line items (including
  // pricing), so require the same permission the compare page itself gates on.
  if (!isContractor && !(await canViewCostComparison(userId))) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

  const params: any[] = [];
  let contractorFilter = "";
  if (isContractor) {
    params.push(userId);
    contractorFilter = ` AND s.contractor_id = $${params.length}`;
  }

  // Build WHERE clause for keywords using parameter placeholders (no manual
  // SQL escaping) so search terms can never influence query structure.
  const keywordConditions = searchTerms.map(kw => {
    params.push(`%${kw}%`);
    const descIdx = params.length;
    params.push(`%${kw}%`);
    const brandIdx = params.length;
    return `(li.description ILIKE $${descIdx} OR li.brand ILIKE $${brandIdx})`;
  });
  const whereClause = keywordConditions.join(" OR ");

  const finalSql = `
    SELECT 
      li.submission_id,
      li.description,
      li.brand,
      li.unit,
      li.quantity,
      li.unit_price,
      li.amount,
      c.category_name,
      s.version_name,
      s.round_no,
      COALESCE(s.client_name_override, br.brand_name) AS client_name,
      u.username AS contractor_name,
      t.tender_name
    FROM bq_line_item li
    JOIN work_category c ON li.category_id = c.category_id
    JOIN tender_submission s ON li.submission_id = s.submission_id
    JOIN tender t ON s.tender_id = t.tender_id
    JOIN branch b ON t.branch_id = b.branch_id
    JOIN brand br ON b.brand_id = br.brand_id
    LEFT JOIN users u ON s.contractor_id = u.user_id
    WHERE s.is_deleted = false
      ${contractorFilter}
      AND (${whereClause})
    ORDER BY c.sort_order, li.sort_order
    LIMIT 50
  `;

  try {
    const rows = await prisma.$queryRawUnsafe(finalSql, ...params) as any[];

    // Group items
    const itemMap = new Map<string, any>();
    for (const row of rows) {
      const key = `${row.category_name}|${row.description}|${row.brand || ''}|${row.unit}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          category_name: row.category_name,
          description: row.description,
          brand: row.brand,
          unit: row.unit,
          submissions: [],
        });
      }
      const entry = itemMap.get(key)!;
      entry.submissions.push({
        submission_id: row.submission_id,
        client_name: row.client_name,
        contractor_name: row.contractor_name || "Unknown",
        version: row.version_name || `Round ${row.round_no}`,
        amount: Number(row.amount) || 0,
        unit_price: Number(row.unit_price) || 0,
        quantity: Number(row.quantity) || 0,
      });
    }

    const results = Array.from(itemMap.values()).map(item => ({
      ...item,
      submissions: item.submissions.sort((a: any, b: any) => a.client_name.localeCompare(b.client_name)),
    }));

    return NextResponse.json({ results }, { headers: corsHeaders });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}