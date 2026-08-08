// src/app/api/bq/compare/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { hasRole, hasPermission } from "@/lib/permissions";
import { ROLE_IDS } from "@/lib/roles";
import { z } from "zod";

const querySchema = z.object({
  ids: z.string().regex(/^\d+(,\d+)*$/, "ids must be comma-separated integers"),
});

// Used to group the "same" line item across different contractors'
// submissions - normalize case, punctuation, and whitespace so minor
// wording differences (capitalization, a trailing period) don't make an
// identical item appear as two unmatched rows in the comparison.
function normalizeDescription(desc: string): string {
  return desc
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/g, '')
    .replace(/\s+/g, ' ');
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

  const roleIds = (session.user as any).roleIds || [];
  const canView = hasRole(roleIds, ROLE_IDS.ADMIN) || (await hasPermission(session.user.id, roleIds, "BQ", "view_cost_comparison"));
  if (!canView) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const queryResult = querySchema.safeParse({ ids: searchParams.get('ids') });
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid ids parameter", details: queryResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const submissionIds = queryResult.data.ids.split(',').map(Number);
  if (submissionIds.length < 2) {
    return NextResponse.json(
      { error: "Need at least two BQs" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // 1. Fetch submission metadata
    const submissions = await prisma.$queryRaw`
      SELECT 
        s.submission_id, s.version_name, s.round_no, s.status,
        COALESCE(s.client_name_override, br.brand_name) AS client_name,
        COALESCE(s.branch_name_override, b.branch_name) AS job_site,
        t.tender_name,
        u.username AS contractor_name
      FROM tender_submission s
      JOIN tender t ON s.tender_id = t.tender_id
      JOIN branch b ON t.branch_id = b.branch_id
      JOIN brand br ON b.brand_id = br.brand_id
      LEFT JOIN users u ON s.contractor_id = u.user_id
      WHERE s.submission_id = ANY(${submissionIds}::int[]) AND s.is_deleted = false
    ` as any[];
    if (submissions.length !== submissionIds.length) {
      return NextResponse.json(
        { error: "Some submissions not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. Fetch line items
    const items = await prisma.$queryRaw`
      SELECT 
        li.submission_id,
        c.category_name,
        c.sort_order AS category_sort,
        li.description,
        li.brand,
        li.unit,
        li.quantity,
        li.unit_price,
        li.amount
      FROM bq_line_item li
      JOIN work_category c ON li.category_id = c.category_id
      WHERE li.submission_id = ANY(${submissionIds}::int[])
      ORDER BY c.sort_order, li.sort_order
    ` as any[];

    // 3. Aggregate by submission
    const aggregatedBySubmission: Record<number, Map<string, any>> = {};
    for (const item of items) {
      const subId = item.submission_id;
      const normalizedDesc = normalizeDescription(item.description || '');
      const key = `${item.category_name}|${normalizedDesc}|${normalizeDescription(item.brand || '')}|${(item.unit || '').trim().toLowerCase()}`;
      if (!aggregatedBySubmission[subId]) aggregatedBySubmission[subId] = new Map();
      const map = aggregatedBySubmission[subId];
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const amount = Number(item.amount) || 0;

      if (map.has(key)) {
        const existing = map.get(key);
        const newQty = existing.quantity + quantity;
        const newAmount = existing.amount + amount;
        const newUnitPrice = newQty > 0 ? newAmount / newQty : 0;
        map.set(key, {
          ...existing,
          quantity: newQty,
          amount: newAmount,
          unit_price: newUnitPrice,
        });
      } else {
        map.set(key, {
          category_name: item.category_name,
          category_sort: item.category_sort,
          description: item.description,
          brand: item.brand,
          unit: item.unit,
          quantity,
          unit_price: unitPrice,
          amount,
        });
      }
    }

    // 4. Build global item map
    const globalItemMap = new Map();
    for (const subId of submissionIds) {
      const subMap = aggregatedBySubmission[subId] || new Map();
      for (const [key, data] of subMap.entries()) {
        if (!globalItemMap.has(key)) {
          globalItemMap.set(key, {
            category_name: data.category_name,
            category_sort: data.category_sort,
            description: data.description,
            brand: data.brand,
            unit: data.unit,
            items: {},
          });
        }
        const group = globalItemMap.get(key);
        group.items[subId] = {
          quantity: data.quantity,
          unit_price: data.unit_price,
          amount: data.amount,
        };
      }
    }

    // 5. Sort and assign item numbers
    const sortedGroups = Array.from(globalItemMap.values()).sort((a, b) => a.category_sort - b.category_sort);
    const finalCategories: { category_name: string; items: any[] }[] = [];
    let currentCategory = '';
    let itemCounter = 1;

    for (const group of sortedGroups) {
      const catName = group.category_name;
      if (catName !== currentCategory) {
        currentCategory = catName;
        itemCounter = 1;
        finalCategories.push({ category_name: catName, items: [] });
      }
      const category = finalCategories[finalCategories.length - 1];
      category.items.push({
        item_number: itemCounter.toString(),
        description: group.description,
        brand: group.brand,
        unit: group.unit,
        items: group.items,
      });
      itemCounter++;
    }

    const categories = finalCategories.map(cat => ({
      category_name: cat.category_name,
      sections: [{ section_name: "General", items: cat.items }],
    }));

    return NextResponse.json(
      { submissions, categories },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Comparison API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}