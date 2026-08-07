// app/api/analytics/costings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { parsePagination, paginationMeta } from '@/lib/pagination';

// ------------------------------------------------------------------
// Permission helper
// ------------------------------------------------------------------
async function hasPermission(userId: number, permissionCode: string): Promise<boolean> {
  const [resource, action] = permissionCode.includes(':')
    ? permissionCode.split(':')
    : [permissionCode, permissionCode];
  const res = await query(
    `SELECT 1
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.permission_id = rp.permission_id
     WHERE ur.user_id = $1 AND p.resource = $2 AND p.action = $3`,
    [userId, resource, action]
  );
  return (res.rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------
// Helper to get overall summary (unchanged)
// ------------------------------------------------------------------
async function getOverallSummary(
  whereClause: string,
  params: any[]
): Promise<{
  totalBudget: number;
  totalSpent: number;
  variance: number;
  percentUsed: number;
}> {
  const summarySql = `
    SELECT 
      COALESCE(SUM(t.estimated_budget), 0) AS total_budget,
      COALESCE(SUM(sf.amount), 0) AS total_spent
    FROM spending_facts sf
    LEFT JOIN tender t ON t.tender_id = sf.tender_id
    ${whereClause}
  `;
  const res = await query(summarySql, params);
  const totalBudget = parseFloat(res.rows[0]?.total_budget || 0);
  const totalSpent = parseFloat(res.rows[0]?.total_spent || 0);
  const variance = totalBudget - totalSpent;
  const percentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  return { totalBudget, totalSpent, variance, percentUsed };
}

// ------------------------------------------------------------------
// GET handler with permission check
// ------------------------------------------------------------------
export async function GET(request: NextRequest) {
  // 1. Authentication & permission
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const canView = await hasPermission(userId, 'costings:view');
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Existing query logic (unchanged)
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupBy = searchParams.get('groupBy') || 'monthly';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const categoryId = searchParams.get('categoryId');
    const tenderId = searchParams.get('tenderId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    // Only the `tender` groupBy branch is an unbounded, per-tender list (see
    // docs/api-conventions.md) — pagination there is opt-in, same convention
    // as the other list endpoints.
    const tenderPagination = parsePagination(searchParams);

    // Build WHERE clause dynamically
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`sf.awarded_date >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`sf.awarded_date <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (categoryId) {
      conditions.push(`sf.category_id = $${paramIndex++}`);
      params.push(parseInt(categoryId, 10));
    }
    if (tenderId) {
      conditions.push(`sf.tender_id = $${paramIndex++}`);
      params.push(parseInt(tenderId, 10));
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let sql: string;
    let dataRows: any[];
    let tenderPaginationInfo: ReturnType<typeof paginationMeta> | undefined;

    switch (groupBy) {
      case 'monthly':
        sql = `
          SELECT 
            DATE_TRUNC('month', sf.awarded_date) AS period,
            SUM(sf.amount) AS total
          FROM spending_facts sf
          ${whereClause}
          GROUP BY period
          ORDER BY period DESC
        `;
        const monthlyRes = await query(sql, params);
        dataRows = monthlyRes.rows.map(row => ({
          period: row.period,
          total: parseFloat(row.total),
        }));
        break;

      case 'yearly':
        sql = `
          SELECT 
            DATE_TRUNC('year', sf.awarded_date) AS period,
            SUM(sf.amount) AS total
          FROM spending_facts sf
          ${whereClause}
          GROUP BY period
          ORDER BY period DESC
        `;
        const yearlyRes = await query(sql, params);
        dataRows = yearlyRes.rows.map(row => ({
          period: row.period,
          total: parseFloat(row.total),
        }));
        break;

      case 'category':
        sql = `
          SELECT 
            wc.category_name,
            SUM(sf.amount) AS total
          FROM spending_facts sf
          LEFT JOIN work_category wc ON wc.category_id = sf.category_id
          ${whereClause}
          GROUP BY wc.category_name
          ORDER BY total DESC
        `;
        const catRes = await query(sql, params);
        dataRows = catRes.rows.map(row => ({
          category_name: row.category_name || 'Uncategorized',
          total: parseFloat(row.total),
        }));
        break;

      case 'item':
        sql = `
          SELECT 
            bli.description,
            SUM(sf.amount) AS total_spent,
            COUNT(DISTINCT sf.submission_id) AS times_used
          FROM spending_facts sf
          JOIN bq_line_item bli ON bli.line_item_id = sf.line_item_id
          ${whereClause}
          GROUP BY bli.description
          ORDER BY total_spent DESC
          LIMIT $${paramIndex}
        `;
        params.push(limit);
        const itemRes = await query(sql, params);
        dataRows = itemRes.rows.map(row => ({
          description: row.description,
          total_spent: parseFloat(row.total_spent),
          times_used: parseInt(row.times_used, 10),
        }));
        break;

      case 'tender': {
        const tenderBaseQuery = `
          SELECT
            t.tender_id,
            t.tender_name,
            t.estimated_budget,
            SUM(sf.amount) AS actual_spent,
            (t.estimated_budget - SUM(sf.amount)) AS variance,
            ROUND(100.0 * SUM(sf.amount) / NULLIF(t.estimated_budget, 0), 2) AS percent_used
          FROM spending_facts sf
          JOIN tender t ON t.tender_id = sf.tender_id
          ${whereClause}
          GROUP BY t.tender_id, t.tender_name, t.estimated_budget
        `;

        if (tenderPagination) {
          const countRes = await query(
            `SELECT COUNT(*) AS total FROM (${tenderBaseQuery}) AS subquery`,
            params
          );
          const total = parseInt(countRes.rows[0]?.total || '0', 10);
          tenderPaginationInfo = paginationMeta(tenderPagination, total);

          sql = `${tenderBaseQuery} ORDER BY percent_used DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
          const tenderRes = await query(sql, [...params, tenderPagination.limit, tenderPagination.offset]);
          dataRows = tenderRes.rows.map(row => ({
            tender_id: row.tender_id,
            tender_name: row.tender_name,
            estimated_budget: parseFloat(row.estimated_budget || 0),
            actual_spent: parseFloat(row.actual_spent || 0),
            variance: parseFloat(row.variance || 0),
            percent_used: parseFloat(row.percent_used || 0),
          }));
        } else {
          sql = `${tenderBaseQuery} ORDER BY percent_used DESC`;
          const tenderRes = await query(sql, params);
          dataRows = tenderRes.rows.map(row => ({
            tender_id: row.tender_id,
            tender_name: row.tender_name,
            estimated_budget: parseFloat(row.estimated_budget || 0),
            actual_spent: parseFloat(row.actual_spent || 0),
            variance: parseFloat(row.variance || 0),
            percent_used: parseFloat(row.percent_used || 0),
          }));
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid groupBy. Allowed: monthly, yearly, category, item, tender' },
          { status: 400 }
        );
    }

    const summary = await getOverallSummary(whereClause, params);

    return NextResponse.json({
      data: dataRows,
      summary,
      ...(tenderPaginationInfo ?? {}),
    });
  } catch (error) {
    console.error('Costings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}